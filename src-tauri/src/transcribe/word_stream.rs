// src-tauri/src/transcribe/word_stream.rs — 词流构建、句子对齐与 TranscriptSegment 生成
use std::cmp::max;

use crate::transcribe::normalization::{
    sentence_match_words, word_stream_match_words, normalize_whitespace,
};
use crate::transcribe::types::{RawTranscriptSegment, TranscriptSegment, WordToken};

/// 使用 sentencex 做句子边界检测（基于语言感知规则，速度快）
pub fn split_sentences(text: &str) -> Vec<String> {
    sentencex::segment("en", text)
        .into_iter()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect()
}

/// 从 Whisper 原始片段集合构建扁平词流
fn build_word_stream(whisper_segments: &[RawTranscriptSegment]) -> Vec<WordToken> {
    use crate::transcribe::normalization::normalize_word_text;

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
            Some(WordToken {
                text,
                start_ms,
                end_ms,
            })
        })
        .collect()
}

/// 将词列表用空格连接成字符串
fn join_words_text(words: &[WordToken]) -> String {
    words.iter().map(|word| word.text.as_str()).collect::<Vec<_>>().join(" ")
}

/// 在词流中查找与句子匹配的词范围
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

/// 从词切片构建 TranscriptSegment
fn build_segment_from_words(
    id: i64,
    sentence: String,
    words: &[WordToken],
) -> Option<TranscriptSegment> {
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

/// Whisper 原始片段 → TranscriptSegment（用于 fallback 或 raw SRT）
fn build_segments_from_raw_segments(
    whisper_segments: &[RawTranscriptSegment],
) -> Vec<TranscriptSegment> {
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

/// 将句子列表与词流对齐，生成带时间戳的 TranscriptSegment
fn align_sentences_to_words(
    sentences: Vec<String>,
    words: &[WordToken],
) -> Vec<TranscriptSegment> {
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

/// 从 Whisper 结果构建最终的 TranscriptSegment 列表（带句子对齐）
pub fn build_transcript_segments_from_whisper(
    whisper_segments: &[RawTranscriptSegment],
) -> Vec<TranscriptSegment> {
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

/// Whisper 原始片段 → TranscriptSegment（不经过句子对齐，直接用 Whisper 分段）
pub fn raw_segments_to_transcript_segments(
    whisper_segments: &[RawTranscriptSegment],
) -> Vec<TranscriptSegment> {
    build_segments_from_raw_segments(whisper_segments)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::transcribe::types::WordToken;

    fn word(text: &str, start_ms: i64, end_ms: i64) -> WordToken {
        WordToken {
            text: text.to_string(),
            start_ms,
            end_ms,
        }
    }

    fn ws(
        text: &str,
        start_ms: i64,
        end_ms: i64,
        tokens: Vec<WordToken>,
    ) -> RawTranscriptSegment {
        RawTranscriptSegment {
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
        let whisper = vec![ws(
            "Hello there. General Kenobi.",
            0,
            900,
            vec![
                word("Hello", 0, 150),
                word("there.", 160, 300),
                word("General", 360, 580),
                word("Kenobi.", 600, 900),
            ],
        )];
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
            ws(
                "We are",
                0,
                350,
                vec![word("We", 0, 120), word("are", 140, 350)],
            ),
            ws(
                "ready. Move",
                360,
                700,
                vec![word("ready.", 360, 520), word("Move", 540, 700)],
            ),
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
        let whisper = vec![ws(
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
        )];
        let segments = build_transcript_segments_from_whisper(&whisper);

        assert_eq!(segments.len(), 3);
        assert_monotonic(&segments);
        assert_eq!(segments[0].start_ms, 0);
        assert_eq!(segments[1].start_ms, 560);
        assert_eq!(segments[2].start_ms, 1160);
    }

    #[test]
    fn handles_whitespace_and_punctuation_tolerantly() {
        let whisper = vec![ws(
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
        )];
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
