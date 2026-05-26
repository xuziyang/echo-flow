use std::path::Path;

use ort::session::{builder::GraphOptimizationLevel, Session};
use ort::value::Tensor;

use super::error::SubtitleError;
use super::types::ms_to_sample;

const VAD_WINDOW_SAMPLES: usize = 512;
const VAD_CONTEXT_SAMPLES: usize = 64;
const VAD_INPUT_SAMPLES: usize = VAD_CONTEXT_SAMPLES + VAD_WINDOW_SAMPLES;
const VAD_STATE_SIZE: usize = 2 * 128;
const MIN_SILENCE_MS: u64 = 100;
const MIN_SPEECH_MS: u64 = 250;
const CHUNK_PADDING_MS: u64 = 250;

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct VoiceSegment {
    pub(crate) start_sample: usize,
    pub(crate) end_sample: usize,
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct AudioChunk {
    pub(crate) start_sample: usize,
    pub(crate) end_sample: usize,
}

pub(crate) fn load_vad_session(model_path: &Path) -> Result<Session, SubtitleError> {
    let vad_builder = Session::builder().map_err(|error| {
        SubtitleError::VadLoad(format!("failed to create ORT session builder: {error}"))
    })?;

    vad_builder
        .with_optimization_level(GraphOptimizationLevel::All)
        .map_err(|error| SubtitleError::VadLoad(error.to_string()))?
        .commit_from_file(model_path)
        .map_err(|error| SubtitleError::VadLoad(error.to_string()))
}

pub(crate) fn detect_voice_segments(
    vad: &mut Session,
    samples: &[f32],
    threshold: f32,
    sample_rate: u32,
) -> Result<Vec<VoiceSegment>, SubtitleError> {
    let mut state = vec![0.0_f32; VAD_STATE_SIZE];
    let mut context = vec![0.0_f32; VAD_CONTEXT_SAMPLES];
    let mut segments = Vec::new();
    let mut current_start = None;
    let mut pending_silence_start = None;
    let min_silence_samples = ms_to_sample(MIN_SILENCE_MS, sample_rate);
    let min_speech_samples = ms_to_sample(MIN_SPEECH_MS, sample_rate);

    let mut offset = 0;
    while offset < samples.len() {
        let mut window = vec![0.0_f32; VAD_WINDOW_SAMPLES];
        let available = (samples.len() - offset).min(VAD_WINDOW_SAMPLES);
        window[..available].copy_from_slice(&samples[offset..offset + available]);

        let mut model_input = Vec::with_capacity(VAD_INPUT_SAMPLES);
        model_input.extend_from_slice(&context);
        model_input.extend_from_slice(&window);

        let input = Tensor::<f32>::from_array(([1_usize, VAD_INPUT_SAMPLES], model_input))
            .map_err(|error| SubtitleError::VadInference(error.to_string()))?;
        let state_input = Tensor::<f32>::from_array(([2_usize, 1, 128], state.clone()))
            .map_err(|error| SubtitleError::VadInference(error.to_string()))?;
        let sr_input = Tensor::<i64>::from_array((Vec::<usize>::new(), vec![sample_rate as i64]))
            .map_err(|error| SubtitleError::VadInference(error.to_string()))?;

        let outputs = vad
            .run(ort::inputs![
                "input" => input,
                "state" => state_input,
                "sr" => sr_input,
            ])
            .map_err(|error| SubtitleError::VadInference(error.to_string()))?;

        let probability = outputs["output"]
            .try_extract_tensor::<f32>()
            .map_err(|error| SubtitleError::VadInference(error.to_string()))?
            .1
            .first()
            .copied()
            .ok_or_else(|| {
                SubtitleError::VadInference("missing VAD output probability".to_owned())
            })?;
        let next_state = outputs["stateN"]
            .try_extract_tensor::<f32>()
            .map_err(|error| SubtitleError::VadInference(error.to_string()))?
            .1;
        state.clear();
        state.extend_from_slice(next_state);
        context.copy_from_slice(&window[VAD_WINDOW_SAMPLES - VAD_CONTEXT_SAMPLES..]);

        if probability >= threshold {
            if current_start.is_none() {
                current_start = Some(offset);
            }
            pending_silence_start = None;
        } else if let Some(start) = current_start {
            let silence_start = *pending_silence_start.get_or_insert(offset);
            if offset.saturating_sub(silence_start) >= min_silence_samples {
                push_voice_segment(
                    &mut segments,
                    start,
                    silence_start.min(samples.len()),
                    min_speech_samples,
                );
                current_start = None;
                pending_silence_start = None;
            }
        }

        offset += VAD_WINDOW_SAMPLES;
    }

    if let Some(start) = current_start {
        let end = pending_silence_start
            .unwrap_or(samples.len())
            .min(samples.len());
        push_voice_segment(&mut segments, start, end, min_speech_samples);
    }

    Ok(segments)
}

pub(crate) fn merge_voice_segments(
    segments: &[VoiceSegment],
    sample_rate: u32,
    chunk_size_secs: f32,
    total_samples: usize,
) -> Vec<AudioChunk> {
    if segments.is_empty() {
        return Vec::new();
    }

    let max_samples = (chunk_size_secs * sample_rate as f32).round() as usize;
    let mut chunks = Vec::new();
    let mut current_start = segments[0].start_sample;
    let mut current_end = segments[0].end_sample;

    for segment in segments.iter().skip(1) {
        if segment.end_sample.saturating_sub(current_start) > max_samples
            && current_end > current_start
        {
            chunks.push(AudioChunk {
                start_sample: current_start,
                end_sample: current_end,
            });
            current_start = segment.start_sample;
        }

        current_end = segment.end_sample;
    }

    chunks.push(AudioChunk {
        start_sample: current_start,
        end_sample: current_end,
    });

    pad_audio_chunks(&mut chunks, sample_rate, total_samples);
    chunks
}

fn pad_audio_chunks(chunks: &mut [AudioChunk], sample_rate: u32, total_samples: usize) {
    if chunks.is_empty() {
        return;
    }

    let padding_samples = ms_to_sample(CHUNK_PADDING_MS, sample_rate);
    let mut padded = chunks
        .iter()
        .map(|chunk| AudioChunk {
            start_sample: chunk.start_sample.saturating_sub(padding_samples),
            end_sample: chunk
                .end_sample
                .saturating_add(padding_samples)
                .min(total_samples),
        })
        .collect::<Vec<_>>();

    for index in 0..padded.len().saturating_sub(1) {
        if padded[index].end_sample <= padded[index + 1].start_sample {
            continue;
        }

        let split = (chunks[index].end_sample + chunks[index + 1].start_sample) / 2;
        padded[index].end_sample = split.max(padded[index].start_sample).min(total_samples);
        padded[index + 1].start_sample = split.min(padded[index + 1].end_sample);
    }

    chunks.clone_from_slice(&padded);
}

fn push_voice_segment(
    segments: &mut Vec<VoiceSegment>,
    start_sample: usize,
    end_sample: usize,
    min_speech_samples: usize,
) {
    if end_sample > start_sample && end_sample - start_sample >= min_speech_samples {
        segments.push(VoiceSegment {
            start_sample,
            end_sample,
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn merge_voice_segments_pads_chunk_boundaries() {
        let segments = vec![VoiceSegment {
            start_sample: 16_000,
            end_sample: 32_000,
        }];

        let chunks = merge_voice_segments(&segments, 16_000, 30.0, 64_000);

        assert_eq!(
            chunks,
            vec![AudioChunk {
                start_sample: 12_000,
                end_sample: 36_000,
            }]
        );
    }

    #[test]
    fn merge_voice_segments_clamps_padding_to_audio_bounds() {
        let segments = vec![VoiceSegment {
            start_sample: 1_000,
            end_sample: 15_000,
        }];

        let chunks = merge_voice_segments(&segments, 16_000, 30.0, 16_000);

        assert_eq!(
            chunks,
            vec![AudioChunk {
                start_sample: 0,
                end_sample: 16_000,
            }]
        );
    }

    #[test]
    fn merge_voice_segments_keeps_padded_chunks_non_overlapping() {
        let segments = vec![
            VoiceSegment {
                start_sample: 0,
                end_sample: 10_000,
            },
            VoiceSegment {
                start_sample: 12_000,
                end_sample: 22_000,
            },
        ];

        let chunks = merge_voice_segments(&segments, 16_000, 1.0, 30_000);

        assert_eq!(
            chunks,
            vec![
                AudioChunk {
                    start_sample: 0,
                    end_sample: 11_000,
                },
                AudioChunk {
                    start_sample: 11_000,
                    end_sample: 26_000,
                },
            ]
        );
    }
}
