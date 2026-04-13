// src-tauri/src/transcribe.rs — Whisper transcription + nnn-split sentence boundary detection
use log::info;
use nnsplit::NNSplit;
use serde::{Deserialize, Serialize};
use std::cmp::{max, min};
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

const MIN_SENTENCE_DURATION_MS: i64 = 80;

fn normalize_whitespace(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn sanitize_for_match(text: &str) -> String {
    let trimmed = normalize_whitespace(text);
    trimmed
        .trim_matches(|c: char| {
            c.is_whitespace()
                || matches!(c, '.' | ',' | ';' | ':' | '!' | '?' | '。' | '，' | '；' | '：' | '！' | '？')
        })
        .to_string()
}

fn find_char_subsequence(haystack: &[char], needle: &[char], from: usize) -> Option<(usize, usize)> {
    if needle.is_empty() || haystack.is_empty() || from >= haystack.len() || needle.len() > haystack.len() {
        return None;
    }
    let max_start = haystack.len().saturating_sub(needle.len());
    for start in from..=max_start {
        if haystack[start..start + needle.len()] == needle[..] {
            return Some((start, start + needle.len()));
        }
    }
    None
}

fn build_full_text_timeline(whisper_segments: &[WhisperRawSegment]) -> (Vec<char>, Vec<i64>) {
    let mut chars = Vec::<char>::new();
    let mut times = Vec::<i64>::new();
    let mut has_prev = false;
    let mut last_end_ms = 0_i64;

    for seg in whisper_segments {
        let text = normalize_whitespace(&seg.text);
        if text.is_empty() {
            continue;
        }

        let start_ms = max(0, seg.start_ms);
        let end_ms = max(start_ms, seg.end_ms);

        if has_prev {
            chars.push(' ');
            times.push(last_end_ms);
        }

        let segment_chars: Vec<char> = text.chars().collect();
        if segment_chars.len() == 1 {
            chars.push(segment_chars[0]);
            times.push(start_ms);
        } else {
            let denom = (segment_chars.len() - 1) as i64;
            for (idx, ch) in segment_chars.into_iter().enumerate() {
                let t = start_ms + ((end_ms - start_ms) * idx as i64) / denom;
                chars.push(ch);
                times.push(t);
            }
        }

        has_prev = true;
        last_end_ms = end_ms;
    }

    (chars, times)
}

fn align_sentences_to_timeline(
    sentences: Vec<String>,
    full_chars: &[char],
    char_times: &[i64],
    whisper_segments: &[WhisperRawSegment],
) -> Vec<TranscriptSegment> {
    if sentences.is_empty() || full_chars.is_empty() || char_times.is_empty() {
        return Vec::new();
    }

    // 构建 normalized 文本位置 → whisper segment 索引的映射
    // 用于查找每个句子片段落在哪个 whisper segment 内
    let mut char_to_seg: Vec<usize> = Vec::with_capacity(full_chars.len());
    for (seg_idx, seg) in whisper_segments.iter().enumerate() {
        let seg_text = normalize_whitespace(&seg.text);
        if seg_text.is_empty() {
            continue;
        }
        if seg_idx > 0 {
            // segment 分隔符 ' ' 也标记所属
            char_to_seg.push(seg_idx - 1);
        }
        for _ in seg_text.chars() {
            char_to_seg.push(seg_idx);
        }
    }

    let mut cursor = 0_usize;
    // (start_ms, end_ms, char_start, char_end, seg_idx)
    let mut aligned: Vec<Option<(i64, i64, usize, usize, usize)>> =
        Vec::with_capacity(sentences.len());

    for sentence in &sentences {
        let normalized = normalize_whitespace(sentence);
        let normalized_chars: Vec<char> = normalized.chars().collect();
        let fallback_chars: Vec<char> = sanitize_for_match(sentence).chars().collect();

        let found = find_char_subsequence(full_chars, &normalized_chars, cursor)
            .or_else(|| find_char_subsequence(full_chars, &fallback_chars, cursor));

        if let Some((char_start, char_end)) = found {
            cursor = char_end;
            let start_ms = char_times.get(char_start).copied().unwrap_or(0);
            let end_ms = char_times
                .get(char_end.saturating_sub(1))
                .copied()
                .unwrap_or(start_ms);
            let seg_idx = char_to_seg.get(char_start).copied().unwrap_or(0);
            aligned.push(Some((start_ms, end_ms, char_start, char_end, seg_idx)));
        } else {
            aligned.push(None);
        }
    }

    let mut resolved = vec![(0_i64, MIN_SENTENCE_DURATION_MS); sentences.len()];
    let timeline_start = *char_times.first().unwrap_or(&0);
    let timeline_end = *char_times.last().unwrap_or(&timeline_start);

    for idx in 0..sentences.len() {
        if let Some((start_ms, end_ms, _, _, _)) = aligned[idx] {
            resolved[idx] = (start_ms, end_ms);
            continue;
        }

        let prev_end = if idx == 0 { timeline_start } else { resolved[idx - 1].1 };
        let next_known_start = aligned
            .iter()
            .skip(idx + 1)
            .find_map(|it| it.map(|(s, _, _, _, _)| s))
            .unwrap_or(timeline_end);

        let start_ms = prev_end;
        let mut end_ms = start_ms + 160;

        if next_known_start > start_ms {
            let gap = next_known_start - start_ms;
            let local_span = min(300, max(MIN_SENTENCE_DURATION_MS, gap / 2));
            end_ms = start_ms + local_span;
        }

        resolved[idx] = (start_ms, end_ms);
    }

    let mut last_start = timeline_start;
    let mut segments = Vec::with_capacity(sentences.len());

    for (idx, sentence) in sentences.into_iter().enumerate() {
        let (raw_start, raw_end) = resolved[idx];
        let start_ms = max(raw_start, last_start);
        let end_ms = max(raw_end, start_ms + MIN_SENTENCE_DURATION_MS);
        last_start = start_ms;

        // 提取词级时间戳：从对应 whisper segment 中筛选落在句子范围内的词
        let words: Vec<WordToken> =
            if let Some((_, _, char_start, char_end, seg_idx)) = aligned[idx] {
                if let Some(seg) = whisper_segments.get(seg_idx) {
                    extract_words_in_range(seg, char_start, char_end, full_chars, char_times)
                } else {
                    Vec::new()
                }
            } else {
                Vec::new()
            };

        segments.push(TranscriptSegment {
            id: (idx + 1) as i64,
            en: sentence,
            start_ms,
            end_ms,
            words,
        });
    }

    segments
}

/// 从指定 whisper segment 中提取落在 normalized 文本范围 [char_start, char_end) 内的词
fn extract_words_in_range(
    seg: &WhisperRawSegment,
    char_start: usize,
    char_end: usize,
    full_chars: &[char],
    _char_times: &[i64],
) -> Vec<WordToken> {
    if seg.tokens.is_empty() {
        return Vec::new();
    }

    let seg_norm = normalize_whitespace(&seg.text);
    if seg_norm.is_empty() {
        return Vec::new();
    }
    let seg_chars: Vec<char> = seg_norm.chars().collect();
    let seg_len = seg_chars.len();

    // 在 full_chars 中找 seg_norm 的起始位置
    let seg_global_start = char_start.saturating_sub(seg_len);

    // 确认该位置确实匹配
    let matches = full_chars[seg_global_start..]
        .chunks(seg_len + 1)
        .next()
        .map(|chunk| chunk.starts_with(&seg_chars))
        .unwrap_or(false);

    if !matches {
        return Vec::new();
    }

    // 该句子的 char_start 相对于 segment 起始的偏移
    let offset_in_seg = char_start.saturating_sub(seg_global_start);
    let local_start = offset_in_seg;
    let local_end = offset_in_seg + (char_end - char_start);

    seg.tokens
        .iter()
        .enumerate()
        .filter(|(token_idx, _)| {
            let tok_pos = offset_in_seg + token_idx;
            tok_pos >= local_start && tok_pos < local_end
        })
        .map(|(_, w)| w.clone())
        .collect()
}

fn build_transcript_segments_from_whisper(whisper_segments: &[WhisperRawSegment]) -> Vec<TranscriptSegment> {
    let (full_chars, char_times) = build_full_text_timeline(whisper_segments);
    if full_chars.is_empty() || char_times.is_empty() {
        return Vec::new();
    }

    let full_text: String = full_chars.iter().collect();
    let mut sentences = split_sentences(&full_text);
    if sentences.is_empty() {
        let normalized = normalize_whitespace(&full_text);
        if !normalized.is_empty() {
            sentences.push(normalized);
        }
    }

    align_sentences_to_timeline(sentences, &full_chars, &char_times, whisper_segments)
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

        segments.push(WhisperRawSegment { text: txt, start_ms, end_ms, tokens: words });
    }

    Ok(segments)
}

/// 使用 nnn-split 做句子边界检测
fn split_sentences(text: &str) -> Vec<String> {
    // 模型路径：优先使用本地模型文件
    let model_home = std::env::var("HOME").unwrap_or_default();
    let model_paths = [
        format!("{}/.cache/nnsplit/model.onnx", model_home),
        "./models/nnsplit.onnx".to_string(),
        "./nnsplit.onnx".to_string(),
    ];
    let model_path = model_paths.iter()
        .find(|p| Path::new(p).exists())
        .cloned();

    match model_path {
        Some(path) => {
            match NNSplit::new(&path, Default::default()) {
                Ok(splitter) => {
                    let texts: Vec<&str> = vec![text];
                    let splits = splitter.split(&texts);
                    splits[0].iter()
                        .map(|s| s.text().to_string())
                        .collect()
                }
                Err(_) => fallback_split(text),
            }
        }
        None => fallback_split(text),
    }
}

/// 简单 fallback 断句：按标点符号分割
fn fallback_split(text: &str) -> Vec<String> {
    text.split(|c| c == '.' || c == '?' || c == '!' || c == '\n')
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

    fn ws(text: &str, start_ms: i64, end_ms: i64) -> WhisperRawSegment {
        WhisperRawSegment {
            text: text.to_string(),
            start_ms,
            end_ms,
            tokens: vec![],
        }
    }

    fn assert_monotonic(segments: &[TranscriptSegment]) {
        let mut prev_start = i64::MIN;
        for seg in segments {
            assert!(seg.start_ms >= prev_start, "start_ms should be monotonic");
            assert!(seg.end_ms >= seg.start_ms + MIN_SENTENCE_DURATION_MS, "minimum duration violated");
            prev_start = seg.start_ms;
        }
    }

    #[test]
    fn timeline_short_sentences_are_monotonic() {
        let whisper = vec![
            ws("Go.", 0, 220),
            ws("Now.", 240, 480),
            ws("Run.", 500, 760),
            ws("Stop.", 780, 1100),
        ];
        let sentences = vec!["Go".to_string(), "Now".to_string(), "Run".to_string(), "Stop".to_string()];
        let (full_chars, char_times) = build_full_text_timeline(&whisper);
        let segments = align_sentences_to_timeline(sentences, &full_chars, &char_times, &whisper);

        assert_eq!(segments.len(), 4);
        assert_monotonic(&segments);
        assert!(segments[0].start_ms <= 20);
        assert!(segments[3].start_ms >= 700);
    }

    #[test]
    fn timeline_repeated_phrases_match_in_order() {
        let whisper = vec![
            ws("hello there.", 0, 500),
            ws("hello there.", 550, 1100),
            ws("hello there.", 1150, 1700),
        ];
        let sentences = vec![
            "hello there".to_string(),
            "hello there".to_string(),
            "hello there".to_string(),
        ];
        let (full_chars, char_times) = build_full_text_timeline(&whisper);
        let segments = align_sentences_to_timeline(sentences, &full_chars, &char_times, &whisper);

        assert_eq!(segments.len(), 3);
        assert_monotonic(&segments);
        assert!(segments[1].start_ms > segments[0].start_ms);
        assert!(segments[2].start_ms > segments[1].start_ms);
    }

    #[test]
    fn timeline_handles_whitespace_and_punctuation() {
        let whisper = vec![
            ws("  We   are   ready!  ", 0, 600),
            ws("Yes, we are.\n", 620, 1200),
        ];
        let sentences = vec!["We are ready".to_string(), "Yes, we are".to_string()];
        let (full_chars, char_times) = build_full_text_timeline(&whisper);
        let segments = align_sentences_to_timeline(sentences, &full_chars, &char_times, &whisper);

        assert_eq!(segments.len(), 2);
        assert_monotonic(&segments);
        assert!(segments[1].start_ms >= 620);
    }

    #[test]
    fn timeline_local_fallback_keeps_continuity() {
        let whisper = vec![
            ws("alpha beta", 0, 500),
            ws("gamma delta", 520, 1000),
        ];
        let sentences = vec![
            "alpha beta".to_string(),
            "not-found sentence".to_string(),
            "gamma delta".to_string(),
        ];
        let (full_chars, char_times) = build_full_text_timeline(&whisper);
        let segments = align_sentences_to_timeline(sentences, &full_chars, &char_times, &whisper);

        assert_eq!(segments.len(), 3);
        assert_monotonic(&segments);
        assert!(segments[1].start_ms >= segments[0].end_ms);
        assert!(segments[2].start_ms >= segments[1].start_ms);
    }
}
