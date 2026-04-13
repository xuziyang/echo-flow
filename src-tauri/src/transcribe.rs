// src-tauri/src/transcribe.rs — Whisper transcription + sentencex sentence boundary detection
use log::info;
use serde::{Deserialize, Serialize};
use std::cmp::max;
use std::path::Path;
use std::process::Command;
use std::sync::atomic::{AtomicU64, Ordering};
use tauri::Emitter;
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters, WhisperTokenData};

static LAST_TRANSCRIBE_JOB_ID: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Clone, Serialize)]
pub struct TranscribeProgressEvent {
    pub job_id: u64,
    pub audio_path: String,
    pub percent: f32,
    pub sentence: String,
    pub done: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct TranscribeDoneEvent {
    pub job_id: u64,
    pub audio_path: String,
    pub segments: Vec<TranscriptSegment>,
}

#[derive(Debug, Clone, Serialize)]
pub struct TranscribeErrorEvent {
    pub job_id: u64,
    pub audio_path: String,
    pub error: String,
}

/// 转写后的字幕条目
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranscriptSegment {
    pub id: i64,
    pub en: String,
    pub start_ms: i64,
    pub end_ms: i64,
    /// 词级时间戳（可选，Whisper 启用 token_timestamps 时填充）
    #[serde(default)]
    pub words: Vec<WordToken>,
}

/// 词级时间戳
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WordToken {
    pub text: String,
    pub start_ms: i64,
    pub end_ms: i64,
}

/// Whisper 转写结果片段（本地命名避免与 whisper_rs::WhisperSegment 冲突）
#[derive(Debug)]
struct WhisperRawSegment {
    text: String,
    start_ms: i64,
    end_ms: i64,
    /// word-level tokens extracted from whisper
    tokens: Vec<WordToken>,
}

fn normalize_whitespace(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn normalize_word_text(text: &str) -> String {
    normalize_whitespace(text).trim().to_string()
}

fn canonicalize_word_for_match(text: &str) -> String {
    normalize_word_text(text)
        .trim_matches(|c: char| {
            c.is_whitespace()
                || matches!(c, '.' | ',' | ';' | ':' | '!' | '?' | '。' | '，' | '；' | '：' | '！' | '？')
        })
        .to_ascii_lowercase()
}

fn build_word_stream(whisper_segments: &[WhisperRawSegment]) -> Vec<WordToken> {
    whisper_segments
        .iter()
        .flat_map(|seg| seg.tokens.iter())
        .filter_map(|word| {
            let text = normalize_word_text(&word.text);
            if text.is_empty() {
                return None;
            }

            let start_ms = max(0, word.start_ms);
            let end_ms = max(start_ms, word.end_ms);
            Some(WordToken { text, start_ms, end_ms })
        })
        .collect()
}

fn join_words_text(words: &[WordToken]) -> String {
    words.iter()
        .map(|word| word.text.as_str())
        .collect::<Vec<_>>()
        .join(" ")
}

fn sentence_match_words(sentence: &str) -> Vec<String> {
    normalize_whitespace(sentence)
        .split_whitespace()
        .map(canonicalize_word_for_match)
        .filter(|word| !word.is_empty())
        .collect()
}

fn word_stream_match_words(words: &[WordToken]) -> Vec<String> {
    words.iter()
        .map(|word| canonicalize_word_for_match(&word.text))
        .filter(|word| !word.is_empty())
        .collect()
}

fn match_sentence_word_range(
    sentence: &str,
    words: &[WordToken],
    word_keys: &[String],
    cursor: usize,
) -> Option<(usize, usize)> {
    let sentence_words = sentence_match_words(sentence);
    if sentence_words.is_empty() || cursor >= words.len() {
        return None;
    }

    let len = sentence_words.len();
    let end = cursor.checked_add(len)?;
    if end > word_keys.len() {
        return None;
    }

    if word_keys[cursor..end] == sentence_words[..] {
        Some((cursor, end))
    } else {
        None
    }
}

fn build_segment_from_words(id: i64, sentence: String, words: &[WordToken]) -> Option<TranscriptSegment> {
    let first = words.first()?;
    let last = words.last()?;
    let start_ms = max(0, first.start_ms);
    let end_ms = max(start_ms, last.end_ms);

    Some(TranscriptSegment {
        id,
        en: sentence,
        start_ms,
        end_ms,
        words: words.to_vec(),
    })
}

fn build_segments_from_raw_segments(whisper_segments: &[WhisperRawSegment]) -> Vec<TranscriptSegment> {
    whisper_segments
        .iter()
        .filter_map(|seg| {
            let text = normalize_whitespace(&seg.text);
            if text.is_empty() {
                return None;
            }

            let start_ms = max(0, seg.start_ms);
            let end_ms = max(start_ms, seg.end_ms);
            Some(TranscriptSegment {
                id: 0,
                en: text,
                start_ms,
                end_ms,
                words: seg.tokens.clone(),
            })
        })
        .enumerate()
        .map(|(idx, mut seg)| {
            seg.id = (idx + 1) as i64;
            seg
        })
        .collect()
}

fn align_sentences_to_words(sentences: Vec<String>, words: &[WordToken]) -> Vec<TranscriptSegment> {
    if sentences.is_empty() || words.is_empty() {
        return Vec::new();
    }

    let word_keys = word_stream_match_words(words);
    let mut segments = Vec::with_capacity(sentences.len());
    let mut cursor = 0_usize;

    for sentence in sentences {
        if cursor >= words.len() {
            break;
        }

        match match_sentence_word_range(&sentence, words, &word_keys, cursor) {
            Some((start, end)) => {
                if let Some(segment) =
                    build_segment_from_words((segments.len() + 1) as i64, sentence, &words[start..end])
                {
                    segments.push(segment);
                }
                cursor = end;
            }
            None => {
                let tail_sentence = join_words_text(&words[cursor..]);
                if let Some(segment) = build_segment_from_words(
                    (segments.len() + 1) as i64,
                    tail_sentence,
                    &words[cursor..],
                ) {
                    segments.push(segment);
                }
                break;
            }
        }
    }

    if segments.is_empty() && !words.is_empty() {
        if let Some(segment) = build_segment_from_words(1, join_words_text(words), words) {
            segments.push(segment);
        }
    }

    segments
}

fn build_transcript_segments_from_whisper(whisper_segments: &[WhisperRawSegment]) -> Vec<TranscriptSegment> {
    let words = build_word_stream(whisper_segments);
    if words.is_empty() {
        let fallback_segments = build_segments_from_raw_segments(whisper_segments);
        eprintln!(
            "Transcribe post-process: no word timestamps available, falling back to raw segments: whisper_segments={}, fallback_segments={}",
            whisper_segments.len(),
            fallback_segments.len()
        );
        return fallback_segments;
    }

    let full_text = join_words_text(&words);
    let mut sentences = split_sentences(&full_text);
    if sentences.is_empty() {
        if !full_text.is_empty() {
            sentences.push(full_text.clone());
        }
    }

    eprintln!(
        "Transcribe post-process: whisper_segments={}, words={}, detected_sentences={}, preview={:?}",
        whisper_segments.len(),
        words.len(),
        sentences.len(),
        sentences.iter().take(3).collect::<Vec<_>>()
    );

    let segments = align_sentences_to_words(sentences, &words);

    eprintln!(
        "Transcribe post-process: built_segments={}, first_segment={:?}",
        segments.len(),
        segments.first().map(|segment| (&segment.en, segment.start_ms, segment.end_ms))
    );

    segments
}

/// 运行 Whisper 转写（调用方提供模型路径）
fn run_whisper(
    audio_path: &str,
    model_path: &str,
    progress_callback: impl Fn(f32, &str),
) -> Result<Vec<WhisperRawSegment>, String> {
    let ctx = WhisperContext::new_with_params(
        model_path,
        WhisperContextParameters::default(),
    ).map_err(|e| format!("无法加载 Whisper 模型: {}", e))?;

    let mut state = ctx.create_state()
        .map_err(|e| format!("无法创建 Whisper 状态: {}", e))?;

    let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 0 });
    params.set_language(Some("en"));
    params.set_print_progress(false);
    // 启用 token 级别时间戳（用于词级时间戳）
    params.set_token_timestamps(true);
    // 让 Whisper 直接按词切分时间戳，便于后续基于词流断句。
    params.set_split_on_word(true);

    // 如果不是 WAV，先用 ffmpeg 转换
    let audio_file = Path::new(audio_path);
    let wav_path = if audio_file.extension().and_then(|e| e.to_str()) == Some("wav") {
        audio_path.to_string()
    } else {
        let output = Command::new("ffmpeg")
            .args(["-y", "-i", audio_path, "-ar", "16000", "-ac", "1", "/tmp/whisper_input.wav"])
            .output()
            .map_err(|e| format!("调用 ffmpeg 失败: {}", e))?;
        if !output.status.success() {
            return Err(format!("ffmpeg 转换失败: {}", String::from_utf8_lossy(&output.stderr)));
        }
        "/tmp/whisper_input.wav".to_string()
    };

    let mut reader = hound::WavReader::open(&wav_path)
        .map_err(|e| format!("无法读取 WAV 文件: {}", e))?;
    let spec = reader.spec();
    let samples: Vec<f32> = reader.samples::<i16>()
        .filter_map(|s| s.ok())
        .map(|s| s as f32 / 32768.0)
        .collect();

    // 降混音为单声道（如需要）
    let audio: Vec<f32> = if spec.channels == 2 {
        samples.chunks(2).map(|chunk| {
            let l = chunk.get(0).copied().unwrap_or(0.0);
            let r = chunk.get(1).copied().unwrap_or(0.0);
            (l + r) / 2.0
        }).collect()
    } else {
        samples
    };

    info!("Whisper: {} samples at {} Hz, {} channels", audio.len(), spec.sample_rate, spec.channels);

    state.full(params, &audio)
        .map_err(|e| format!("Whisper 推理失败: {}", e))?;

    let n_segments = state.full_n_segments() as usize;
    let mut segments = Vec::new();

    for i in 0..n_segments {
        let Some(seg) = state.get_segment(i as i32) else { continue };
        let txt = seg.to_str()
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
            let Some(token) = seg.get_token(j as i32) else { continue };
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

        segments.push(WhisperRawSegment {
            text: txt,
            start_ms,
            end_ms,
            tokens: words,
        });
    }

    Ok(segments)
}

/// 使用 sentencex 做句子边界检测（基于语言感知规则，速度快）
fn split_sentences(text: &str) -> Vec<String> {
    sentencex::segment("en", text)
        .into_iter()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect()
}

/// 转写音频文件，返回带时间戳的字幕
#[tauri::command]
pub fn transcribe_audio(
    window: tauri::Window,
    audio_path: String,
    model_path: Option<String>,
    job_id: Option<u64>,
) -> Result<u64, String> {
    // 查找 Whisper 模型
    let model = model_path.unwrap_or_else(|| {
        let home = std::env::var("HOME").unwrap_or_default();
        [
            format!("{}/.cache/whisper/ggml-small.en.bin", home),
            format!("{}/.cache/whisper/ggml-base.en.bin", home),
            format!("{}/.cache/whisper/ggml-base.bin", home),
            "./models/ggml-small.en.bin".to_string(),
            "./models/ggml-base.en.bin".to_string(),
            "./ggml-small.en.bin".to_string(),
            "./ggml-base.en.bin".to_string(),
        ]
        .into_iter()
        .find(|p| Path::new(p).exists())
        .unwrap_or_default()
    });

    if model.is_empty() {
        return Err("未找到 Whisper 模型文件。请下载模型并指定路径，或将模型放置在 ~/.cache/whisper/ 目录下。".to_string());
    }

    info!("Starting transcription: audio={}, model={}", audio_path, model);

    let resolved_job_id =
        job_id.unwrap_or_else(|| LAST_TRANSCRIBE_JOB_ID.fetch_add(1, Ordering::Relaxed) + 1);
    let audio_path_clone = audio_path.clone();
    let model_clone = model.clone();
    let window_clone = window.clone();

    std::thread::spawn(move || {
        let progress_audio_path = audio_path_clone.clone();
        let result = run_whisper(
            &audio_path_clone,
            &model_clone,
            |percent, sentence| {
                let _ = window_clone.emit("transcribe-progress", TranscribeProgressEvent {
                    job_id: resolved_job_id,
                    audio_path: progress_audio_path.clone(),
                    percent,
                    sentence: sentence.to_string(),
                    done: false,
                });
            },
        );

        match result {
            Ok(whisper_segments) => {
                let segments = build_transcript_segments_from_whisper(&whisper_segments);
                eprintln!(
                    "Emitting transcribe-done: job_id={}, audio_path={}, whisper_segments={}, transcript_segments={}",
                    resolved_job_id,
                    audio_path_clone,
                    whisper_segments.len(),
                    segments.len()
                );

                let _ = window_clone.emit("transcribe-done", TranscribeDoneEvent {
                    job_id: resolved_job_id,
                    audio_path: audio_path_clone.clone(),
                    segments,
                });
            }
            Err(e) => {
                let _ = window_clone.emit("transcribe-error", TranscribeErrorEvent {
                    job_id: resolved_job_id,
                    audio_path: audio_path_clone.clone(),
                    error: e,
                });
            }
        }
    });

    Ok(resolved_job_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn word(text: &str, start_ms: i64, end_ms: i64) -> WordToken {
        WordToken {
            text: text.to_string(),
            start_ms,
            end_ms,
        }
    }

    fn ws(text: &str, start_ms: i64, end_ms: i64, tokens: Vec<WordToken>) -> WhisperRawSegment {
        WhisperRawSegment {
            text: text.to_string(),
            start_ms,
            end_ms,
            tokens,
        }
    }

    fn assert_monotonic(segments: &[TranscriptSegment]) {
        let mut prev_start = i64::MIN;
        for seg in segments {
            assert!(seg.start_ms >= prev_start, "start_ms should be monotonic");
            assert!(seg.end_ms >= seg.start_ms, "end_ms should not be before start_ms");
            prev_start = seg.start_ms;
        }
    }

    #[test]
    fn splits_sentences_using_word_timestamps() {
        let whisper = vec![
            ws(
                "Hello there. General Kenobi.",
                0,
                900,
                vec![
                    word("Hello", 0, 150),
                    word("there.", 160, 300),
                    word("General", 360, 580),
                    word("Kenobi.", 600, 900),
                ],
            ),
        ];
        let segments = build_transcript_segments_from_whisper(&whisper);

        assert_eq!(segments.len(), 2);
        assert_monotonic(&segments);
        assert_eq!(segments[0].en, "Hello there.");
        assert_eq!(segments[0].start_ms, 0);
        assert_eq!(segments[0].end_ms, 300);
        assert_eq!(segments[0].words.len(), 2);
        assert_eq!(segments[1].en, "General Kenobi.");
        assert_eq!(segments[1].start_ms, 360);
        assert_eq!(segments[1].end_ms, 900);
    }

    #[test]
    fn combines_words_across_segments() {
        let whisper = vec![
            ws("We are", 0, 350, vec![word("We", 0, 120), word("are", 140, 350)]),
            ws("ready. Move", 360, 700, vec![word("ready.", 360, 520), word("Move", 540, 700)]),
            ws("now.", 710, 880, vec![word("now.", 710, 880)]),
        ];
        let segments = build_transcript_segments_from_whisper(&whisper);

        assert_eq!(segments.len(), 2);
        assert_monotonic(&segments);
        assert_eq!(segments[0].en, "We are ready.");
        assert_eq!(segments[0].start_ms, 0);
        assert_eq!(segments[0].end_ms, 520);
        assert_eq!(segments[0].words.len(), 3);
        assert_eq!(segments[1].en, "Move now.");
        assert_eq!(segments[1].start_ms, 540);
        assert_eq!(segments[1].end_ms, 880);
    }

    #[test]
    fn repeated_phrases_match_in_order() {
        let whisper = vec![
            ws(
                "hello there. hello there. hello there.",
                0,
                1700,
                vec![
                    word("hello", 0, 120),
                    word("there.", 130, 500),
                    word("hello", 560, 700),
                    word("there.", 710, 1100),
                    word("hello", 1160, 1300),
                    word("there.", 1310, 1700),
                ],
            ),
        ];
        let segments = build_transcript_segments_from_whisper(&whisper);

        assert_eq!(segments.len(), 3);
        assert_monotonic(&segments);
        assert_eq!(segments[0].start_ms, 0);
        assert_eq!(segments[1].start_ms, 560);
        assert_eq!(segments[2].start_ms, 1160);
    }

    #[test]
    fn handles_whitespace_and_punctuation_tolerantly() {
        let whisper = vec![
            ws(
                "  We   are   ready!  Yes, we are.\n",
                0,
                1200,
                vec![
                    word("We", 0, 180),
                    word("are", 200, 360),
                    word("ready!", 380, 620),
                    word("Yes,", 700, 860),
                    word("we", 880, 1000),
                    word("are.", 1020, 1200),
                ],
            ),
        ];
        let segments = build_transcript_segments_from_whisper(&whisper);

        assert_eq!(segments.len(), 2);
        assert_monotonic(&segments);
        assert_eq!(segments[0].en, "We are ready!");
        assert_eq!(segments[0].end_ms, 620);
        assert_eq!(segments[1].en, "Yes, we are.");
        assert_eq!(segments[1].start_ms, 700);
    }

    #[test]
    fn unmatched_sentence_falls_back_to_tail_segment() {
        let words = vec![
            word("alpha", 0, 100),
            word("beta", 110, 220),
            word("gamma", 240, 360),
        ];
        let segments = align_sentences_to_words(
            vec!["alpha beta".to_string(), "not-found sentence".to_string()],
            &words,
        );

        assert_eq!(segments.len(), 2);
        assert_eq!(segments[0].en, "alpha beta");
        assert_eq!(segments[0].start_ms, 0);
        assert_eq!(segments[0].end_ms, 220);
        assert_eq!(segments[1].en, "gamma");
        assert_eq!(segments[1].start_ms, 240);
        assert_eq!(segments[1].end_ms, 360);
    }

    #[test]
    fn falls_back_to_raw_segments_when_no_word_timestamps_exist() {
        let whisper = vec![ws("Hello there.", 0, 500, vec![])];
        let segments = build_transcript_segments_from_whisper(&whisper);
        assert_eq!(segments.len(), 1);
        assert_eq!(segments[0].en, "Hello there.");
        assert_eq!(segments[0].start_ms, 0);
        assert_eq!(segments[0].end_ms, 500);
    }
}
