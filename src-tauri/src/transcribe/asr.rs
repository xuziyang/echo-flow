use std::fmt;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

use super::audio::SAMPLE_RATE;
use super::error::SubtitleError;
use super::types::{
    samples_to_ms, validate_audio, AudioSamples, Transcript, TranscriptSegment, DEFAULT_LANGUAGE,
};
use super::vad::{
    detect_voice_segments, load_vad_session, merge_voice_segments, DEFAULT_VAD_MODEL,
};

const DEFAULT_WHISPER_MODEL: &str = "models/ggml-base.en.bin";
const DEFAULT_CHUNK_SIZE_SECS: f32 = 30.0;
const DEFAULT_VAD_THRESHOLD: f32 = 0.5;

#[derive(Clone)]
pub struct Asr {
    config: Arc<AsrConfig>,
    models: Arc<Mutex<Option<AsrModels>>>,
}

impl fmt::Debug for Asr {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("Asr")
            .field("vad_model_path", &self.config.vad_model_path)
            .field("whisper_model_path", &self.config.whisper_model_path)
            .field("chunk_size_secs", &self.config.chunk_size_secs)
            .field("vad_threshold", &self.config.vad_threshold)
            .finish_non_exhaustive()
    }
}

#[derive(Debug, Clone)]
pub struct AsrConfig {
    pub vad_model_path: PathBuf,
    pub whisper_model_path: PathBuf,
    pub chunk_size_secs: f32,
    pub vad_threshold: f32,
}

struct AsrModels {
    vad: ort::session::Session,
    whisper: WhisperContext,
}

impl Default for Asr {
    fn default() -> Self {
        Self::new()
    }
}

impl Default for AsrConfig {
    fn default() -> Self {
        let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let home = std::env::var("HOME").unwrap_or_default();
        let cache_models = PathBuf::from(format!("{}/.cache/echo-flow/models", home));

        let whisper_model_path = if cache_models.join("ggml-base.en.bin").exists() {
            cache_models.join("ggml-base.en.bin")
        } else {
            manifest_dir.join(DEFAULT_WHISPER_MODEL)
        };

        let vad_model_path = if cache_models.join("silero_vad.onnx").exists() {
            cache_models.join("silero_vad.onnx")
        } else {
            manifest_dir.join(DEFAULT_VAD_MODEL)
        };

        Self {
            vad_model_path,
            whisper_model_path,
            chunk_size_secs: DEFAULT_CHUNK_SIZE_SECS,
            vad_threshold: DEFAULT_VAD_THRESHOLD,
        }
    }
}

impl Asr {
    pub fn new() -> Self {
        Self::with_config(AsrConfig::default())
    }

    pub fn with_config(config: AsrConfig) -> Self {
        Self {
            config: Arc::new(config),
            models: Arc::new(Mutex::new(None)),
        }
    }

    pub fn recognize(&self, audio: &AudioSamples) -> Result<Transcript, SubtitleError> {
        validate_audio(audio, SAMPLE_RATE)?;

        let mut models_guard = self
            .models
            .lock()
            .map_err(|error| SubtitleError::WhisperInference(error.to_string()))?;
        if models_guard.is_none() {
            *models_guard = Some(load_models(&self.config)?);
        }
        let models = models_guard
            .as_mut()
            .expect("ASR models should be initialized");

        let voice_segments = detect_voice_segments(
            &mut models.vad,
            &audio.samples,
            self.config.vad_threshold,
            audio.sample_rate,
        )?;
        let chunks = merge_voice_segments(
            &voice_segments,
            audio.sample_rate,
            self.config.chunk_size_secs,
        );

        if chunks.is_empty() {
            return Ok(Transcript {
                language: None,
                segments: Vec::new(),
            });
        }

        let mut transcript_segments = Vec::new();
        for chunk in chunks {
            let samples = &audio.samples[chunk.start_sample..chunk.end_sample];
            append_whisper_segments(
                &models.whisper,
                samples,
                sample_to_ms(chunk.start_sample, audio.sample_rate),
                &mut transcript_segments,
            )?;
        }

        Ok(Transcript {
            language: Some(DEFAULT_LANGUAGE.to_owned()),
            segments: transcript_segments,
        })
    }
}

fn load_models(config: &AsrConfig) -> Result<AsrModels, SubtitleError> {
    let vad = load_vad_session(&config.vad_model_path)?;
    let whisper = WhisperContext::new_with_params(
        &config.whisper_model_path,
        WhisperContextParameters::default(),
    )
    .map_err(|error| SubtitleError::WhisperLoad(error.to_string()))?;

    Ok(AsrModels { vad, whisper })
}

fn append_whisper_segments(
    whisper: &WhisperContext,
    samples: &[f32],
    chunk_start_ms: u64,
    transcript_segments: &mut Vec<TranscriptSegment>,
) -> Result<(), SubtitleError> {
    if samples.is_empty() {
        return Ok(());
    }

    let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
    params.set_language(Some(DEFAULT_LANGUAGE));
    params.set_translate(false);
    params.set_no_context(true);
    params.set_print_progress(false);
    params.set_print_realtime(false);
    params.set_print_timestamps(false);

    let mut state = whisper
        .create_state()
        .map_err(|error| SubtitleError::WhisperInference(error.to_string()))?;
    state
        .full(params, samples)
        .map_err(|error| SubtitleError::WhisperInference(error.to_string()))?;

    for segment in state.as_iter() {
        let text = segment
            .to_str_lossy()
            .map_err(|error| SubtitleError::WhisperInference(error.to_string()))?
            .trim()
            .to_owned();

        if text.is_empty() {
            continue;
        }

        let start_ms = chunk_start_ms + centiseconds_to_ms(segment.start_timestamp());
        let end_ms = chunk_start_ms + centiseconds_to_ms(segment.end_timestamp());
        transcript_segments.push(TranscriptSegment {
            id: transcript_segments.len(),
            start_ms,
            end_ms,
            text,
        });
    }

    Ok(())
}

fn sample_to_ms(sample: usize, sample_rate: u32) -> u64 {
    samples_to_ms(sample, sample_rate)
}

fn centiseconds_to_ms(timestamp: i64) -> u64 {
    timestamp.max(0) as u64 * 10
}
