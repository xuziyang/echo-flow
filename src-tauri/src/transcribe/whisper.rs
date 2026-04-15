// src-tauri/src/transcribe/whisper.rs — Whisper 模型调用与词级时间戳提取
use log::info;

use whisper_rs::{
    DtwMode, DtwModelPreset, FullParams, SamplingStrategy, WhisperContext,
    WhisperContextParameters, WhisperTokenData,
};

use crate::transcribe::audio::load_audio_samples;
use crate::transcribe::types::{RawTranscriptSegment, WordToken};

#[derive(Default)]
struct TokenExtractionStats {
    total_segments: usize,
    total_tokens: usize,
    special_tokens_filtered: usize,
    missing_timestamps_filtered: usize,
    empty_text_tokens_filtered: usize,
    emitted_words: usize,
    segments_without_words: usize,
}

fn select_dtw_mode_for_model(model_path: &str) -> (DtwMode<'static>, &'static str) {
    let model = model_path.to_ascii_lowercase();

    // 优先使用官方预设；如果无法识别模型名则回退到 TopMost。
    if model.contains("large-v3-turbo") {
        (
            DtwMode::ModelPreset {
                model_preset: DtwModelPreset::LargeV3Turbo,
            },
            "model-preset:large-v3-turbo",
        )
    } else if model.contains("large-v3") {
        (
            DtwMode::ModelPreset {
                model_preset: DtwModelPreset::LargeV3,
            },
            "model-preset:large-v3",
        )
    } else if model.contains("large-v2") {
        (
            DtwMode::ModelPreset {
                model_preset: DtwModelPreset::LargeV2,
            },
            "model-preset:large-v2",
        )
    } else if model.contains("large-v1") {
        (
            DtwMode::ModelPreset {
                model_preset: DtwModelPreset::LargeV1,
            },
            "model-preset:large-v1",
        )
    } else if model.contains("medium.en") {
        (
            DtwMode::ModelPreset {
                model_preset: DtwModelPreset::MediumEn,
            },
            "model-preset:medium-en",
        )
    } else if model.contains("medium") {
        (
            DtwMode::ModelPreset {
                model_preset: DtwModelPreset::Medium,
            },
            "model-preset:medium",
        )
    } else if model.contains("small.en") {
        (
            DtwMode::ModelPreset {
                model_preset: DtwModelPreset::SmallEn,
            },
            "model-preset:small-en",
        )
    } else if model.contains("small") {
        (
            DtwMode::ModelPreset {
                model_preset: DtwModelPreset::Small,
            },
            "model-preset:small",
        )
    } else if model.contains("base.en") {
        (
            DtwMode::ModelPreset {
                model_preset: DtwModelPreset::BaseEn,
            },
            "model-preset:base-en",
        )
    } else if model.contains("base") {
        (
            DtwMode::ModelPreset {
                model_preset: DtwModelPreset::Base,
            },
            "model-preset:base",
        )
    } else if model.contains("tiny.en") {
        (
            DtwMode::ModelPreset {
                model_preset: DtwModelPreset::TinyEn,
            },
            "model-preset:tiny-en",
        )
    } else if model.contains("tiny") {
        (
            DtwMode::ModelPreset {
                model_preset: DtwModelPreset::Tiny,
            },
            "model-preset:tiny",
        )
    } else {
        (
            DtwMode::TopMost { n_top: 4 },
            "fallback:top-most(n_top=4)",
        )
    }
}

/// 运行 Whisper 转写（调用方提供模型路径）
pub fn run_whisper(
    audio_path: &str,
    model_path: &str,
    progress_callback: impl Fn(f32, &str),
) -> Result<Vec<RawTranscriptSegment>, String> {
    let (dtw_mode, dtw_mode_label) = select_dtw_mode_for_model(model_path);
    let mut context_params = WhisperContextParameters::default();
    context_params.dtw_parameters.mode = dtw_mode;
    info!(
        "Whisper DTW config selected: mode={}, model={}",
        dtw_mode_label, model_path
    );

    let ctx = WhisperContext::new_with_params(
        model_path,
        context_params,
    )
    .map_err(|e| format!("无法加载 Whisper 模型: {}", e))?;

    let mut state = ctx
        .create_state()
        .map_err(|e| format!("无法创建 Whisper 状态: {}", e))?;

    let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 0 });
    params.set_language(Some("en"));
    params.set_print_progress(false);
    // 启用 token 级别时间戳（用于词级时间戳）
    params.set_token_timestamps(true);
    // 让 Whisper 直接按词切分时间戳，便于后续基于词流断句。
    params.set_split_on_word(true);
    let audio = load_audio_samples(audio_path)?;

    state.full(params, &audio).map_err(|e| format!("Whisper 推理失败: {}", e))?;

    let n_segments = state.full_n_segments() as usize;
    let mut segments = Vec::new();
    let mut stats = TokenExtractionStats::default();

    for i in 0..n_segments {
        let Some(seg) = state.get_segment(i as i32) else {
            continue;
        };
        let txt = seg
            .to_str()
            .map(|s| s.trim().to_string())
            .unwrap_or_default();

        if txt.is_empty() {
            continue;
        }

        // Whisper 时间戳单位是 10ms（centisecond ticks）→ 毫秒
        let start_ms = seg.start_timestamp() * 10;
        let end_ms = seg.end_timestamp() * 10;

        // 提取词级时间戳
        // Whisper token 可能以前导空格开头（如 " are"），表示新单词的开始
        // 我们按此规则切分：遇到前导空格 → 保存当前词并开始新词
        let mut words: Vec<WordToken> = Vec::new();
        let n_tokens = seg.n_tokens() as usize;
        stats.total_segments += 1;
        stats.total_tokens += n_tokens;
        let mut word_text = String::new();
        let mut word_start_ms: Option<i64> = None;

        for j in 0..n_tokens {
            let Some(token) = seg.get_token(j as i32) else {
                continue;
            };
            let token_text = token.to_str().unwrap_or_default();
            let token_data: WhisperTokenData = token.token_data();

            // 过滤 Whisper 特殊 token（以 < 开头，如 <|nospeech|>, <|timeless|> 等）
            // t_dtw < 0 表示该 token 无时间信息（whisper-rs-sys 0.15 中 t_dtw 是 i64，单位厘秒）
            if token_text.starts_with('<') {
                stats.special_tokens_filtered += 1;
                continue;
            }
            if token_data.t_dtw < 0 {
                stats.missing_timestamps_filtered += 1;
                continue;
            }

            // t_dtw 单位是 centisecond（厘秒），×10 转毫秒
            let token_start_ms = token_data.t_dtw * 10;
            let token_text_trimmed = token_text.trim_start();

            if token_text_trimmed.is_empty() {
                stats.empty_text_tokens_filtered += 1;
                continue;
            }

            if word_text.is_empty() {
                // 去掉 token 前导空格作为词的开头
                word_text.push_str(token_text_trimmed);
                word_start_ms = Some(token_start_ms);
            } else if token_text.starts_with(' ') {
                // 前导空格 → 保存当前词，开始新词
                words.push(WordToken {
                    text: word_text.clone(),
                    start_ms: word_start_ms.unwrap_or(token_start_ms),
                    end_ms: token_start_ms,
                });
                word_text.clear();
                word_text.push_str(token_text_trimmed);
                word_start_ms = Some(token_start_ms);
            } else {
                // token 续接同一词（无前导空格）
                word_text.push_str(&token_text);
            }
        }

        // 保存最后一个词
        if !word_text.is_empty() {
            words.push(WordToken {
                text: word_text,
                start_ms: word_start_ms.unwrap_or(start_ms),
                end_ms,
            });
        }

        stats.emitted_words += words.len();
        if words.is_empty() {
            stats.segments_without_words += 1;
            info!(
                "Whisper segment has no usable word timestamps: index={}, text={:?}, tokens={}",
                i,
                txt,
                n_tokens
            );
        }

        let percent = ((i + 1) as f32 / n_segments as f32) * 100.0;
        progress_callback(percent, &txt);

        segments.push(RawTranscriptSegment {
            text: txt,
            start_ms,
            end_ms,
            tokens: words,
        });
    }

    info!(
        "Whisper token extraction summary: segments={}, tokens={}, emitted_words={}, filtered_special={}, filtered_missing_timestamps={}, filtered_empty_text={}, segments_without_words={}",
        stats.total_segments,
        stats.total_tokens,
        stats.emitted_words,
        stats.special_tokens_filtered,
        stats.missing_timestamps_filtered,
        stats.empty_text_tokens_filtered,
        stats.segments_without_words
    );

    Ok(segments)
}
