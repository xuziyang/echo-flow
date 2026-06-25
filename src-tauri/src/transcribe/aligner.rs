use std::collections::HashMap;
use std::fmt;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use ort::session::{builder::GraphOptimizationLevel, Session};
use ort::value::Tensor;

use super::audio::SAMPLE_RATE;
use super::error::SubtitleError;
use super::types::{
    ms_to_sample, samples_to_ms, validate_audio, AlignedRange, AudioSamples, SplitAlignmentResult,
    Subtitle, Transcript, TranscriptSegment, DEFAULT_LANGUAGE,
};

const MIN_WAV2VEC_SAMPLES: usize = 400;

#[derive(Clone)]
pub struct Aligner {
    config: Arc<AlignerConfig>,
    models: Arc<Mutex<Option<AlignerModels>>>,
}

impl fmt::Debug for Aligner {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("Aligner")
            .field("model_path", &self.config.model_path)
            .field("vocab_path", &self.config.vocab_path)
            .finish_non_exhaustive()
    }
}

#[derive(Debug, Clone)]
pub struct AlignerConfig {
    pub model_path: PathBuf,
    pub vocab_path: PathBuf,
}

struct AlignerModels {
    session: Session,
    vocab: AlignmentVocab,
}

#[derive(Debug, Clone)]
struct AlignmentVocab {
    token_to_id: HashMap<char, usize>,
    blank_id: usize,
}

#[derive(Debug, Clone)]
struct CleanTranscript {
    chars: Vec<char>,
    char_to_original: Vec<usize>,
}

#[derive(Debug, Clone, PartialEq)]
struct Point {
    token_index: usize,
    time_index: usize,
    score: f32,
}

#[derive(Debug, Clone, PartialEq)]
struct AlignedChar {
    original_index: usize,
    start_ms: u64,
    end_ms: u64,
    score: f32,
}

#[derive(Debug, Clone, PartialEq)]
struct AlignedWord {
    start_original: usize,
    end_original: usize,
    start_ms: u64,
    end_ms: u64,
    score: f32,
}

#[derive(Debug, Clone, PartialEq)]
struct TokenSegment {
    start: usize,
    end: usize,
    score: f32,
}

#[derive(Debug, Clone, PartialEq)]
struct SentenceSpan {
    start: usize,
    end: usize,
    text: String,
}

#[derive(Debug, Clone, PartialEq)]
struct TimedSentence {
    text: String,
    start_ms: Option<u64>,
    end_ms: Option<u64>,
}

impl Default for Aligner {
    fn default() -> Self {
        Self::new()
    }
}

impl Default for AlignerConfig {
    fn default() -> Self {
        let home = std::env::var("HOME").unwrap_or_default();
        let cache_dir = PathBuf::from(format!("{}/.cache/echo-flow/models", home));

        Self {
            model_path: cache_dir.join("wav2vec2-base-en.onnx"),
            vocab_path: cache_dir.join("wav2vec2-vocab.json"),
        }
    }
}

impl Aligner {
    pub fn new() -> Self {
        Self::with_config(AlignerConfig::default())
    }

    pub fn with_config(config: AlignerConfig) -> Self {
        Self {
            config: Arc::new(config),
            models: Arc::new(Mutex::new(None)),
        }
    }

    pub fn align(
        &self,
        audio: &AudioSamples,
        transcript: &Transcript,
    ) -> Result<Vec<Subtitle>, SubtitleError> {
        validate_audio(audio, SAMPLE_RATE)?;
        if transcript.segments.is_empty() {
            return Ok(Vec::new());
        }

        let mut models_guard = self
            .models
            .lock()
            .map_err(|error| SubtitleError::AlignInference(error.to_string()))?;
        if models_guard.is_none() {
            *models_guard = Some(load_models(&self.config)?);
        }
        let models = models_guard
            .as_mut()
            .expect("alignment models should be initialized");

        let language = transcript.language.as_deref().unwrap_or(DEFAULT_LANGUAGE);
        let mut subtitles = Vec::new();

        for (position, segment) in transcript.segments.iter().enumerate() {
            let fallback = fallback_segment_time(position, segment);
            let aligned_chars = align_segment(audio, segment, models)?;
            let sentences = timed_sentences(segment, language, &aligned_chars, fallback);

            for sentence in sentences {
                subtitles.push(Subtitle {
                    index: subtitles.len() + 1,
                    start_ms: sentence.start_ms.unwrap_or(fallback.0),
                    end_ms: sentence.end_ms.unwrap_or(fallback.1),
                    text: sentence.text,
                });
            }
        }

        // 确保相邻字幕时间不重叠，且每句至少持续 1ms
        for i in 0..subtitles.len().saturating_sub(1) {
            let next_start = subtitles[i + 1].start_ms;
            if subtitles[i].end_ms >= next_start {
                subtitles[i].end_ms = next_start.saturating_sub(1);
            }
            if subtitles[i].end_ms <= subtitles[i].start_ms {
                subtitles[i].end_ms = subtitles[i].start_ms + 1;
            }
        }

        Ok(subtitles)
    }

    pub fn align_split(
        &self,
        audio: &AudioSamples,
        start_ms: u64,
        end_ms: u64,
        left_text: &str,
        right_text: &str,
    ) -> Result<SplitAlignmentResult, SubtitleError> {
        validate_audio(audio, SAMPLE_RATE)?;
        let left_text = left_text.trim();
        let right_text = right_text.trim();
        if left_text.is_empty() || right_text.is_empty() {
            return Err(SubtitleError::AlignInference(
                "split alignment requires non-empty left and right text".to_owned(),
            ));
        }
        if end_ms <= start_ms + 1 {
            return Err(SubtitleError::AlignInference(format!(
                "invalid split alignment range: {start_ms}..{end_ms}"
            )));
        }

        let mut models_guard = self
            .models
            .lock()
            .map_err(|error| SubtitleError::AlignInference(error.to_string()))?;
        if models_guard.is_none() {
            *models_guard = Some(load_models(&self.config)?);
        }
        let models = models_guard
            .as_mut()
            .expect("alignment models should be initialized");

        let combined_text = format!("{left_text} {right_text}");
        let segment = TranscriptSegment {
            id: 0,
            start_ms,
            end_ms,
            text: combined_text,
        };
        let aligned_chars = align_segment(audio, &segment, models)?;
        let aligned_chars = aligned_chars.as_deref().ok_or_else(|| {
            SubtitleError::AlignInference("failed to align split sentence text".to_owned())
        })?;
        let aligned_words = aligned_words(&segment.text, aligned_chars);

        let left_end = left_text.chars().count();
        let right_start = left_end + 1;
        let right_end = right_start + right_text.chars().count();
        let left_span = SentenceSpan {
            start: 0,
            end: left_end,
            text: left_text.to_owned(),
        };
        let right_span = SentenceSpan {
            start: right_start,
            end: right_end,
            text: right_text.to_owned(),
        };

        let (left_start, left_end) = sentence_time(&left_span, &aligned_words, Some(aligned_chars));
        let (right_start, right_end) =
            sentence_time(&right_span, &aligned_words, Some(aligned_chars));
        let (Some(left_start), Some(left_end), Some(right_start), Some(right_end)) =
            (left_start, left_end, right_start, right_end)
        else {
            return Err(SubtitleError::AlignInference(
                "failed to resolve aligned split ranges".to_owned(),
            ));
        };

        Ok(normalize_split_alignment(
            start_ms,
            end_ms,
            left_start,
            left_end,
            right_start,
            right_end,
        ))
    }
}

fn normalize_split_alignment(
    range_start: u64,
    range_end: u64,
    left_start: u64,
    left_end: u64,
    right_start: u64,
    right_end: u64,
) -> SplitAlignmentResult {
    let mut left_start = left_start.clamp(range_start, range_end - 1);
    let mut left_end = left_end.clamp(left_start + 1, range_end);
    let mut right_start = right_start.clamp(range_start, range_end - 1);
    let mut right_end = right_end.clamp(right_start + 1, range_end);

    if left_start > right_start {
        std::mem::swap(&mut left_start, &mut right_start);
    }
    if left_end > right_end {
        std::mem::swap(&mut left_end, &mut right_end);
    }
    if left_end >= right_start {
        let boundary = ((left_end + right_start) / 2).clamp(range_start + 1, range_end - 1);
        left_end = boundary;
        right_start = boundary;
    }
    if left_end <= left_start {
        left_end = (left_start + 1).min(range_end);
    }
    if right_end <= right_start {
        right_end = (right_start + 1).min(range_end);
    }

    SplitAlignmentResult {
        left: AlignedRange {
            start_ms: left_start as i64,
            end_ms: left_end as i64,
        },
        right: AlignedRange {
            start_ms: right_start as i64,
            end_ms: right_end as i64,
        },
    }
}

fn load_models(config: &AlignerConfig) -> Result<AlignerModels, SubtitleError> {
    let builder = Session::builder().map_err(|error| {
        SubtitleError::AlignLoad(format!("failed to create ORT session builder: {error}"))
    })?;
    let session = builder
        .with_optimization_level(GraphOptimizationLevel::All)
        .map_err(|error| SubtitleError::AlignLoad(error.to_string()))?
        .commit_from_file(&config.model_path)
        .map_err(|error| SubtitleError::AlignLoad(error.to_string()))?;

    Ok(AlignerModels {
        session,
        vocab: load_vocab(&config.vocab_path)?,
    })
}

fn load_vocab(path: &Path) -> Result<AlignmentVocab, SubtitleError> {
    let bytes = fs::read(path).map_err(|error| SubtitleError::AlignLoad(error.to_string()))?;
    let raw = serde_json::from_slice::<HashMap<String, usize>>(&bytes)
        .map_err(|error| SubtitleError::AlignLoad(error.to_string()))?;

    let mut token_to_id = HashMap::new();
    let mut blank_id = 0;
    for (token, id) in raw {
        if token == "<pad>" || token == "[pad]" {
            blank_id = id;
        }
        if let Some(ch) = token.chars().next().filter(|_| token.chars().count() == 1) {
            token_to_id.insert(ch.to_ascii_lowercase(), id);
        }
    }

    Ok(AlignmentVocab {
        token_to_id,
        blank_id,
    })
}

fn align_segment(
    audio: &AudioSamples,
    segment: &TranscriptSegment,
    models: &mut AlignerModels,
) -> Result<Option<Vec<AlignedChar>>, SubtitleError> {
    let clean = clean_transcript(&segment.text, &models.vocab);
    if clean.chars.is_empty() || segment.end_ms <= segment.start_ms {
        return Ok(None);
    }

    let start_sample = ms_to_sample(segment.start_ms, audio.sample_rate).min(audio.samples.len());
    let end_sample = ms_to_sample(segment.end_ms, audio.sample_rate).min(audio.samples.len());
    if end_sample <= start_sample {
        return Ok(None);
    }

    let mut waveform = audio.samples[start_sample..end_sample].to_vec();
    let original_len = waveform.len();
    if waveform.len() < MIN_WAV2VEC_SAMPLES {
        waveform.resize(MIN_WAV2VEC_SAMPLES, 0.0);
    }

    let emission = run_alignment_model(&mut models.session, waveform, &models.vocab)?;
    if emission.is_empty() {
        return Ok(None);
    }

    let tokens = tokens_for_clean_transcript(&clean.chars, &models.vocab);
    let trellis = get_trellis(&emission, &tokens, models.vocab.blank_id);
    let Some(path) = backtrack(&trellis, &emission, &tokens, models.vocab.blank_id) else {
        return Ok(None);
    };
    let token_segments = merge_repeats(&path);
    if token_segments.len() != clean.chars.len() {
        return Ok(None);
    }

    let duration_ms = samples_to_ms(original_len, audio.sample_rate);
    let frame_count = trellis.len().saturating_sub(1).max(1);
    let ratio = duration_ms as f32 / frame_count as f32;

    let chars = token_segments
        .iter()
        .zip(clean.char_to_original.iter().copied())
        .map(|(token, original_index)| AlignedChar {
            original_index,
            start_ms: segment.start_ms + (token.start as f32 * ratio).round() as u64,
            end_ms: segment.start_ms + (token.end as f32 * ratio).round() as u64,
            score: token.score,
        })
        .collect();

    Ok(Some(chars))
}

fn run_alignment_model(
    session: &mut Session,
    waveform: Vec<f32>,
    vocab: &AlignmentVocab,
) -> Result<Vec<Vec<f32>>, SubtitleError> {
    let input = Tensor::<f32>::from_array(([1_usize, waveform.len()], waveform))
        .map_err(|error| SubtitleError::AlignInference(error.to_string()))?;
    let outputs = session
        .run(ort::inputs!["input" => input])
        .map_err(|error| SubtitleError::AlignInference(error.to_string()))?;
    let (shape, logits) = outputs["logits"]
        .try_extract_tensor::<f32>()
        .map_err(|error| SubtitleError::AlignInference(error.to_string()))?;

    if shape.len() != 3 {
        return Err(SubtitleError::AlignInference(format!(
            "expected logits rank 3, got shape {shape:?}"
        )));
    }
    let batch = shape_dim_to_usize(shape[0], "batch")?;
    let frames = shape_dim_to_usize(shape[1], "time")?;
    let classes = shape_dim_to_usize(shape[2], "vocab")?;
    if batch != 1 {
        return Err(SubtitleError::AlignInference(format!(
            "expected batch size 1, got {batch}"
        )));
    }
    if classes <= vocab.blank_id {
        return Err(SubtitleError::AlignInference(format!(
            "blank id {} is outside logits class count {classes}",
            vocab.blank_id
        )));
    }

    let expected = batch * frames * classes;
    if logits.len() != expected {
        return Err(SubtitleError::AlignInference(format!(
            "expected {expected} logits, got {}",
            logits.len()
        )));
    }

    let mut emission = Vec::with_capacity(frames);
    for frame in 0..frames {
        let start = frame * classes;
        let end = start + classes;
        emission.push(log_softmax(&logits[start..end]));
    }

    Ok(emission)
}

fn shape_dim_to_usize(value: i64, name: &str) -> Result<usize, SubtitleError> {
    usize::try_from(value).map_err(|_| {
        SubtitleError::AlignInference(format!("invalid {name} dimension in logits shape: {value}"))
    })
}

fn clean_transcript(text: &str, vocab: &AlignmentVocab) -> CleanTranscript {
    let chars = text.chars().collect::<Vec<_>>();
    let leading = chars.iter().take_while(|ch| ch.is_whitespace()).count();
    let trailing = chars
        .iter()
        .rev()
        .take_while(|ch| ch.is_whitespace())
        .count();
    let align_end = chars.len().saturating_sub(trailing);

    let mut clean_chars = Vec::new();
    let mut char_to_original = Vec::new();
    for (index, ch) in chars.iter().copied().enumerate() {
        if index < leading || index >= align_end {
            continue;
        }

        let clean_ch = if ch.is_whitespace() {
            '|'
        } else {
            ch.to_ascii_lowercase()
        };
        if !vocab.token_to_id.contains_key(&clean_ch) {
            continue;
        }

        if clean_ch == '|' && (clean_chars.is_empty() || clean_chars.last() == Some(&'|')) {
            continue;
        }

        clean_chars.push(clean_ch);
        char_to_original.push(index);
    }

    if clean_chars.last() == Some(&'|') {
        clean_chars.pop();
        char_to_original.pop();
    }

    CleanTranscript {
        chars: clean_chars,
        char_to_original,
    }
}

fn tokens_for_clean_transcript(chars: &[char], vocab: &AlignmentVocab) -> Vec<usize> {
    let tokens = chars
        .iter()
        .filter_map(|ch| vocab.token_to_id.get(ch).copied())
        .collect();

    tokens
}

fn timed_sentences(
    segment: &TranscriptSegment,
    language: &str,
    aligned_chars: &Option<Vec<AlignedChar>>,
    fallback: (u64, u64),
) -> Vec<TimedSentence> {
    let spans = sentence_spans(language, &segment.text);
    let aligned_words = aligned_chars
        .as_deref()
        .map(|chars| aligned_words(&segment.text, chars))
        .unwrap_or_default();
    if spans.is_empty() {
        return vec![TimedSentence {
            text: segment.text.clone(),
            start_ms: Some(fallback.0),
            end_ms: Some(fallback.1),
        }];
    }

    let mut timed = spans
        .into_iter()
        .map(|span| {
            let (start_ms, end_ms) = sentence_time(&span, &aligned_words, aligned_chars.as_deref());
            TimedSentence {
                text: span.text,
                start_ms,
                end_ms,
            }
        })
        .collect::<Vec<_>>();

    interpolate_sentence_times(&mut timed);
    for sentence in &mut timed {
        if sentence.start_ms.is_none() {
            sentence.start_ms = Some(fallback.0);
        }
        if sentence.end_ms.is_none() {
            sentence.end_ms = Some(fallback.1);
        }
        if sentence.end_ms <= sentence.start_ms {
            sentence.start_ms = Some(fallback.0);
            sentence.end_ms = Some(fallback.1);
        }
    }

    timed
}

fn sentence_spans(language: &str, text: &str) -> Vec<SentenceSpan> {
    let boundaries = sentencex::get_sentence_boundaries(language, text);
    if boundaries.is_empty() {
        let trimmed = text.trim();
        return if trimmed.is_empty() {
            Vec::new()
        } else {
            vec![SentenceSpan {
                start: 0,
                end: text.chars().count(),
                text: trimmed.to_owned(),
            }]
        };
    }

    let char_offsets = char_byte_offsets(text);
    boundaries
        .into_iter()
        .filter_map(|boundary| {
            let start = byte_to_char_index(&char_offsets, boundary.start_index);
            let end = byte_to_char_index(&char_offsets, boundary.end_index);
            let sentence_text = boundary.text.trim().to_owned();
            if sentence_text.is_empty() || end <= start {
                None
            } else {
                Some(SentenceSpan {
                    start,
                    end,
                    text: sentence_text,
                })
            }
        })
        .collect()
}

fn char_byte_offsets(text: &str) -> Vec<usize> {
    let mut offsets = text
        .char_indices()
        .map(|(index, _)| index)
        .collect::<Vec<_>>();
    offsets.push(text.len());
    offsets
}

fn byte_to_char_index(offsets: &[usize], byte_index: usize) -> usize {
    match offsets.binary_search(&byte_index) {
        Ok(index) => index,
        Err(index) => index.saturating_sub(1),
    }
}

fn sentence_time(
    span: &SentenceSpan,
    aligned_words: &[AlignedWord],
    aligned_chars: Option<&[AlignedChar]>,
) -> (Option<u64>, Option<u64>) {
    let mut word_start_ms = None;
    let mut word_end_ms = None;
    for word in aligned_words {
        if word.end_original <= span.start || word.start_original >= span.end {
            continue;
        }
        word_start_ms =
            Some(word_start_ms.map_or(word.start_ms, |start: u64| start.min(word.start_ms)));
        word_end_ms = Some(word_end_ms.map_or(word.end_ms, |end: u64| end.max(word.end_ms)));
    }
    if word_start_ms.is_some() && word_end_ms.is_some() {
        return (word_start_ms, word_end_ms);
    }

    let Some(aligned_chars) = aligned_chars else {
        return (None, None);
    };

    let mut start_ms = None;
    let mut end_ms = None;
    for aligned in aligned_chars {
        if aligned.original_index < span.start || aligned.original_index >= span.end {
            continue;
        }
        start_ms =
            Some(start_ms.map_or(aligned.start_ms, |start: u64| start.min(aligned.start_ms)));
        end_ms = Some(end_ms.map_or(aligned.end_ms, |end: u64| end.max(aligned.end_ms)));
    }

    (start_ms, end_ms)
}

fn aligned_words(text: &str, aligned_chars: &[AlignedChar]) -> Vec<AlignedWord> {
    let chars = text.chars().collect::<Vec<_>>();
    let mut words = Vec::new();
    let mut start = None;

    for (index, ch) in chars.iter().copied().enumerate() {
        if ch.is_whitespace() {
            if let Some(start_index) = start.take() {
                push_aligned_word(&mut words, start_index, index, aligned_chars);
            }
        } else if start.is_none() {
            start = Some(index);
        }
    }

    if let Some(start_index) = start {
        push_aligned_word(&mut words, start_index, chars.len(), aligned_chars);
    }

    words
}

fn push_aligned_word(
    words: &mut Vec<AlignedWord>,
    start_original: usize,
    end_original: usize,
    aligned_chars: &[AlignedChar],
) {
    let mut start_ms = None;
    let mut end_ms = None;
    let mut score_sum = 0.0;
    let mut score_count = 0;

    for aligned in aligned_chars {
        if aligned.original_index < start_original || aligned.original_index >= end_original {
            continue;
        }
        start_ms =
            Some(start_ms.map_or(aligned.start_ms, |start: u64| start.min(aligned.start_ms)));
        end_ms = Some(end_ms.map_or(aligned.end_ms, |end: u64| end.max(aligned.end_ms)));
        score_sum += aligned.score;
        score_count += 1;
    }

    if let (Some(start_ms), Some(end_ms)) = (start_ms, end_ms) {
        words.push(AlignedWord {
            start_original,
            end_original,
            start_ms,
            end_ms,
            score: score_sum / score_count as f32,
        });
    }
}

fn interpolate_sentence_times(sentences: &mut [TimedSentence]) {
    for index in 0..sentences.len() {
        if sentences[index].start_ms.is_some() && sentences[index].end_ms.is_some() {
            continue;
        }

        let previous = sentences[..index]
            .iter()
            .rev()
            .find_map(|sentence| sentence.start_ms.zip(sentence.end_ms));
        let next = sentences[index + 1..]
            .iter()
            .find_map(|sentence| sentence.start_ms.zip(sentence.end_ms));

        let replacement = match (previous, next) {
            (Some(prev), Some(next)) => {
                let prev_gap = index
                    - sentences[..index]
                        .iter()
                        .rposition(|sentence| {
                            sentence.start_ms.is_some() && sentence.end_ms.is_some()
                        })
                        .unwrap_or(0);
                let next_gap = sentences[index + 1..]
                    .iter()
                    .position(|sentence| sentence.start_ms.is_some() && sentence.end_ms.is_some())
                    .map(|pos| pos + 1)
                    .unwrap_or(usize::MAX);
                if prev_gap <= next_gap {
                    Some(prev)
                } else {
                    Some(next)
                }
            }
            (Some(prev), None) => Some(prev),
            (None, Some(next)) => Some(next),
            (None, None) => None,
        };

        if let Some((start_ms, end_ms)) = replacement {
            sentences[index].start_ms = Some(start_ms);
            sentences[index].end_ms = Some(end_ms);
        }
    }
}

fn fallback_segment_time(position: usize, segment: &TranscriptSegment) -> (u64, u64) {
    if segment.end_ms > segment.start_ms {
        (segment.start_ms, segment.end_ms)
    } else {
        let start_ms = position as u64 * 2_000;
        (start_ms, start_ms + 2_000)
    }
}

fn get_trellis(emission: &[Vec<f32>], tokens: &[usize], blank_id: usize) -> Vec<Vec<f32>> {
    let num_frame = emission.len();
    let num_tokens = tokens.len();
    let mut trellis = vec![vec![f32::NEG_INFINITY; num_tokens + 1]; num_frame + 1];
    trellis[0][0] = 0.0;

    for t in 0..num_frame {
        trellis[t + 1][0] = trellis[t][0] + emission[t][blank_id];
    }
    for row in trellis
        .iter_mut()
        .skip(num_frame.saturating_sub(num_tokens) + 1)
    {
        row[0] = f32::INFINITY;
    }

    for t in 0..num_frame {
        for j in 1..=num_tokens {
            let stay = trellis[t][j] + emission[t][blank_id];
            let change = trellis[t][j - 1] + emission[t][tokens[j - 1]];
            trellis[t + 1][j] = stay.max(change);
        }
    }

    trellis
}

fn backtrack(
    trellis: &[Vec<f32>],
    emission: &[Vec<f32>],
    tokens: &[usize],
    blank_id: usize,
) -> Option<Vec<Point>> {
    if tokens.is_empty() || trellis.is_empty() {
        return Some(Vec::new());
    }

    let mut j = tokens.len();
    let mut t_start = 0;
    let mut best = f32::NEG_INFINITY;
    for (t, row) in trellis.iter().enumerate() {
        if row[j] > best {
            best = row[j];
            t_start = t;
        }
    }

    let mut path = Vec::new();
    for t in (1..=t_start).rev() {
        let stayed = trellis[t - 1][j] + emission[t - 1][blank_id];
        let changed = trellis[t - 1][j - 1] + emission[t - 1][tokens[j - 1]];
        let is_changed = changed > stayed;
        let token_id = if is_changed { tokens[j - 1] } else { blank_id };
        path.push(Point {
            token_index: if is_changed { j - 1 } else { usize::MAX },
            time_index: t - 1,
            score: emission[t - 1][token_id].exp(),
        });

        if is_changed {
            j -= 1;
            if j == 0 {
                break;
            }
        }
    }

    if j != 0 {
        return None;
    }

    path.reverse();
    Some(path)
}

fn merge_repeats(path: &[Point]) -> Vec<TokenSegment> {
    let non_blank: Vec<&Point> = path
        .iter()
        .filter(|p| p.token_index != usize::MAX)
        .collect();

    let mut segments = Vec::new();
    let mut i1 = 0;
    while i1 < non_blank.len() {
        let mut i2 = i1;
        while i2 < non_blank.len() && non_blank[i1].token_index == non_blank[i2].token_index {
            i2 += 1;
        }
        let score = non_blank[i1..i2].iter().map(|p| p.score).sum::<f32>() / (i2 - i1) as f32;
        segments.push(TokenSegment {
            start: non_blank[i1].time_index,
            end: non_blank[i2 - 1].time_index + 1,
            score,
        });
        i1 = i2;
    }
    segments
}

fn log_softmax(values: &[f32]) -> Vec<f32> {
    let max = values.iter().copied().fold(f32::NEG_INFINITY, f32::max);
    let sum_exp = values.iter().map(|value| (*value - max).exp()).sum::<f32>();
    let log_sum_exp = max + sum_exp.ln();
    values.iter().map(|value| *value - log_sum_exp).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_vocab() -> AlignmentVocab {
        let token_to_id = [('a', 1), ('b', 2), ('c', 3), ('d', 4), ('|', 5)]
            .into_iter()
            .collect();

        AlignmentVocab {
            token_to_id,
            blank_id: 0,
        }
    }

    #[test]
    fn clean_transcript_ignores_punctuation_and_unknown_chars() {
        let clean = clean_transcript(" Ab, c! 你 d. ", &test_vocab());

        assert_eq!(clean.chars, vec!['a', 'b', '|', 'c', '|', 'd']);
        assert_eq!(clean.char_to_original, vec![1, 2, 4, 5, 7, 10]);

        let clean = clean_transcript("你 ab", &test_vocab());

        assert_eq!(clean.chars, vec!['a', 'b']);
        assert_eq!(clean.char_to_original, vec![2, 3]);
    }

    #[test]
    fn aligned_words_groups_chars_across_skipped_punctuation() {
        let aligned_chars = vec![
            AlignedChar {
                original_index: 0,
                start_ms: 100,
                end_ms: 140,
                score: 0.9,
            },
            AlignedChar {
                original_index: 1,
                start_ms: 140,
                end_ms: 180,
                score: 0.8,
            },
            AlignedChar {
                original_index: 3,
                start_ms: 180,
                end_ms: 220,
                score: 0.7,
            },
            AlignedChar {
                original_index: 5,
                start_ms: 300,
                end_ms: 340,
                score: 0.6,
            },
        ];

        let words = aligned_words("ab,c d", &aligned_chars);

        assert_eq!(
            words,
            vec![
                AlignedWord {
                    start_original: 0,
                    end_original: 4,
                    start_ms: 100,
                    end_ms: 220,
                    score: 0.8,
                },
                AlignedWord {
                    start_original: 5,
                    end_original: 6,
                    start_ms: 300,
                    end_ms: 340,
                    score: 0.6,
                },
            ]
        );
    }

    #[test]
    fn sentence_time_prefers_word_boundaries() {
        let span = SentenceSpan {
            start: 1,
            end: 4,
            text: "b,c".to_owned(),
        };
        let aligned_words = vec![AlignedWord {
            start_original: 0,
            end_original: 4,
            start_ms: 100,
            end_ms: 220,
            score: 0.8,
        }];
        let aligned_chars = vec![AlignedChar {
            original_index: 1,
            start_ms: 140,
            end_ms: 180,
            score: 0.8,
        }];

        assert_eq!(
            sentence_time(&span, &aligned_words, Some(&aligned_chars)),
            (Some(100), Some(220))
        );
    }

    #[test]
    fn normalize_split_alignment_keeps_ranges_ordered_and_bounded() {
        let result = normalize_split_alignment(100, 1_100, 90, 800, 700, 1_300);

        assert!(result.left.start_ms >= 100);
        assert!(result.right.end_ms <= 1_100);
        assert!(result.left.end_ms > result.left.start_ms);
        assert!(result.right.end_ms > result.right.start_ms);
        assert!(result.left.end_ms <= result.right.start_ms);
    }
}
