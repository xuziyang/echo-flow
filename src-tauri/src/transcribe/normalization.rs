// src-tauri/src/transcribe/normalization.rs — 文本规范化与词匹配工具

use crate::transcribe::types::WordToken;

/// 合并多余空格
pub fn normalize_whitespace(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// trim + 空格规范化
pub fn normalize_word_text(text: &str) -> String {
    normalize_whitespace(text).trim().to_string()
}

/// 去除标点符号并转小写，用于词匹配
fn canonicalize_word_for_match(text: &str) -> String {
    normalize_word_text(text)
        .trim_matches(|c: char| {
            c.is_whitespace()
                || matches!(c, '.' | ',' | ';' | ':' | '!' | '?' | '。' | '，' | '；' | '：' | '！' | '？')
        })
        .to_ascii_lowercase()
}

/// 将句子切分为规范化词列表（用于与词流匹配）
pub fn sentence_match_words(sentence: &str) -> Vec<String> {
    normalize_whitespace(sentence)
        .split_whitespace()
        .map(canonicalize_word_for_match)
        .filter(|word| !word.is_empty())
        .collect()
}

/// 将词流转换为规范化词列表（用于与句子匹配）
pub fn word_stream_match_words(words: &[WordToken]) -> Vec<String> {
    words
        .iter()
        .map(|word| canonicalize_word_for_match(&word.text))
        .filter(|word| !word.is_empty())
        .collect()
}
