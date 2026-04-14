// src-tauri/src/transcribe/whisper.rs — Whisper 模型调用与词级时间戳提取
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters, WhisperTokenData};

use crate::transcribe::audio::load_audio_samples;
use crate::transcribe::types::{RawTranscriptSegment, WordToken};

/// 运行 Whisper 转写（调用方提供模型路径）
pub fn run_whisper(
    audio_path: &str,
    model_path: &str,
    progress_callback: impl Fn(f32, &str),
) -> Result<Vec<RawTranscriptSegment>, String> {
    let ctx = WhisperContext::new_with_params(
        model_path,
        WhisperContextParameters::default(),
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
            if token_text.starts_with('<') || token_data.t_dtw < 0 {
                continue;
            }

            // t_dtw 单位是 centisecond（厘秒），×10 转毫秒
            let token_start_ms = token_data.t_dtw * 10;

            if word_text.is_empty() {
                // 去掉 token 前导空格作为词的开头
                word_text.push_str(token_text.trim_start());
                word_start_ms = Some(token_start_ms);
            } else if token_text.starts_with(' ') {
                // 前导空格 → 保存当前词，开始新词
                words.push(WordToken {
                    text: word_text.clone(),
                    start_ms: word_start_ms.unwrap_or(token_start_ms),
                    end_ms: token_start_ms,
                });
                word_text.clear();
                word_text.push_str(token_text.trim_start());
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

        let percent = ((i + 1) as f32 / n_segments as f32) * 100.0;
        progress_callback(percent, &txt);

        segments.push(RawTranscriptSegment {
            text: txt,
            start_ms,
            end_ms,
            tokens: words,
        });
    }

    Ok(segments)
}
