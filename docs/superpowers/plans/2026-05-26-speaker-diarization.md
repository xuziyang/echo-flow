# Speaker Diarization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add speaker diarization to the transcription pipeline so multi-speaker audio is segmented by speaker, enabling proper shadowing practice for dialogues.

**Architecture:** Use ONNX-based speaker embedding model (WeSpeaker CAM++ or ECAPA-TDNN, ~25-30MB) to extract 192-dim embeddings from VAD segments. Implement agglomerative clustering in Rust to group segments by speaker. Pipeline becomes: VAD → Speaker Embedding → Clustering → Per-Speaker Whisper → Alignment → Subtitles with speaker labels.

**Tech Stack:** Rust, ONNX Runtime (ort crate), WeSpeaker CAM++ ONNX model, agglomerative clustering with cosine distance

---

## File Structure

### Backend (Rust) - New Files
- `src-tauri/src/transcribe/diarizer.rs` — Speaker embedding extraction + agglomerative clustering
- `src-tauri/src/transcribe/fbank.rs` — Log mel filterbank feature extraction (80-dim)

### Backend (Rust) - Modified Files
- `src-tauri/src/transcribe/mod.rs` — Integrate diarizer into pipeline
- `src-tauri/src/transcribe/types.rs` — Add `speaker_id` to `TranscriptSegment`, `Subtitle`, frontend types
- `src-tauri/src/transcribe/asr.rs` — Pass speaker info through ASR
- `src-tauri/src/transcribe/aligner.rs` — Propagate speaker info to subtitles
- `src-tauri/src/transcribe/error.rs` — Add diarization error variants
- `src-tauri/Cargo.toml` — Add `dct` crate for FFT (or use `rustfft`)

### Frontend - Modified Files
- `src/stores/useTranscriptStore.ts` — Add `speaker_id` to `Sentence`, `TranscriptSegment`
- `src/components/listening/SubtitleCard.vue` — Display speaker label
- `src/components/shadowing/ScriptFlowItem.vue` — Display speaker label

### Model Files (downloaded at runtime)
- `~/.cache/echo-flow/models/voxceleb_CAM++.onnx` — WeSpeaker CAM++ model (29.3MB)

---

## Task 1: Add Error Types for Diarization

**Files:**
- Modify: `src-tauri/src/transcribe/error.rs`

- [ ] **Step 1: Add diarization error variants**

```rust
// Add to SubtitleError enum in error.rs

    #[error("failed to load speaker embedding model: {0}")]
    DiarizerLoad(String),

    #[error("failed to run speaker embedding model: {0}")]
    DiarizerInference(String),

    #[error("failed to compute fbank features: {0}")]
    FbankCompute(String),
```

- [ ] **Step 2: Verify compilation**

Run: `cd /Users/xuziyang/code/github/xzygh/echo-flow/src-tauri && cargo check 2>&1 | head -20`
Expected: No errors (just warnings about unused variants)

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/transcribe/error.rs
git commit -m "$(cat <<'EOF'
feat(diarization): add error types for speaker embedding

Add DiarizerLoad, DiarizerInference, FbankCompute error variants
to support the upcoming speaker diarization module.
EOF
)"
```

---

## Task 2: Implement Log Mel Filterbank (Fbank) Feature Extraction

**Files:**
- Create: `src-tauri/src/transcribe/fbank.rs`

- [ ] **Step 1: Write fbank feature extraction module**

```rust
// src-tauri/src/transcribe/fbank.rs
// Log mel filterbank feature extraction for speaker embedding models
// Based on WeSpeaker/3D-Speaker preprocessing pipeline

const PI: f32 = std::f32::consts::PI;

/// Fbank configuration matching WeSpeaker defaults
#[derive(Debug, Clone, Copy)]
pub struct FbankConfig {
    /// Sample rate in Hz (default: 16000)
    pub sample_rate: u32,
    /// Frame length in ms (default: 25)
    pub frame_length_ms: u32,
    /// Frame shift in ms (default: 10)
    pub frame_shift_ms: u32,
    /// Number of mel filterbanks (default: 80)
    pub num_mel_bins: usize,
    /// Preemphasis coefficient (default: 0.97)
    pub preemphasis: f32,
    /// Window type (default: hamming)
    pub window: WindowType,
}

#[derive(Debug, Clone, Copy, Default)]
pub enum WindowType {
    #[default]
    Hamming,
    Hanning,
}

impl Default for FbankConfig {
    fn default() -> Self {
        Self {
            sample_rate: 16_000,
            frame_length_ms: 25,
            frame_shift_ms: 10,
            num_mel_bins: 80,
            preemphasis: 0.97,
            window: WindowType::Hamming,
        }
    }
}

impl FbankConfig {
    /// Frame length in samples
    pub fn frame_length_samples(&self) -> usize {
        (self.frame_length_ms as usize * self.sample_rate as usize) / 1000
    }

    /// Frame shift in samples
    pub fn frame_shift_samples(&self) -> usize {
        (self.frame_shift_ms as usize * self.sample_rate as usize) / 1000
    }
}

/// Compute log mel filterbank features from audio samples
///
/// Returns shape [num_frames, num_mel_bins] with CMN applied
pub fn compute_fbank(samples: &[f32], config: &FbankConfig) -> Vec<Vec<f32>> {
    let frame_len = config.frame_length_samples();
    let frame_shift = config.frame_shift_samples();
    let num_frames = if samples.len() < frame_len {
        0
    } else {
        1 + (samples.len() - frame_len) / frame_shift
    };

    if num_frames == 0 {
        return Vec::new();
    }

    // Precompute window
    let window = match config.window {
        WindowType::Hamming => hamming_window(frame_len),
        WindowType::Hanning => hanning_window(frame_len),
    };

    // Precompute mel filterbank matrix
    let mel_fb = mel_filterbank(
        config.num_mel_bins,
        frame_len,
        config.sample_rate,
        20.0,  // fmin
        config.sample_rate as f32 / 2.0,  // fmax
    );

    let mut features = Vec::with_capacity(num_frames);

    for frame_idx in 0..num_frames {
        let start = frame_idx * frame_shift;
        let end = (start + frame_len).min(samples.len());

        // Extract and preemphasize frame
        let mut frame = Vec::with_capacity(frame_len);
        for i in 0..frame_len {
            let idx = start + i;
            let sample = if idx < end {
                samples[idx]
            } else {
                0.0  // Zero-padding for last frame
            };
            // Apply preemphasis: s[n] - preemphasis * s[n-1]
            let preemphasized = if i == 0 {
                sample
            } else {
                let prev_idx = start + i - 1;
                let prev_sample = if prev_idx < end { samples[prev_idx] } else { 0.0 };
                sample - config.preemphasis * prev_sample
            };
            frame.push(preemphasized * window[i]);
        }

        // Compute power spectrum using DFT (magnitude squared)
        let power_spectrum = power_spectrum_dft(&frame);

        // Apply mel filterbank
        let mel_energies: Vec<f32> = mel_fb
            .iter()
            .map(|filter| {
                let energy: f32 = power_spectrum
                    .iter()
                    .zip(filter.iter())
                    .map(|(p, f)| p * f)
                    .sum();
                // Floor to avoid log(0)
                (energy + 1e-10).ln()
            })
            .collect();

        features.push(mel_energies);
    }

    // Apply CMN (Cepstral Mean Normalization) - subtract mean per bin
    if !features.is_empty() {
        let num_bins = features[0].len();
        let mut means = vec![0.0_f32; num_bins];
        
        for frame in &features {
            for (i, &val) in frame.iter().enumerate() {
                means[i] += val;
            }
        }
        
        let num_frames_f = features.len() as f32;
        for mean in &mut means {
            *mean /= num_frames_f;
        }
        
        for frame in &mut features {
            for (i, val) in frame.iter_mut().enumerate() {
                *val -= means[i];
            }
        }
    }

    features
}

/// Hamming window: 0.54 - 0.46 * cos(2*pi*n/(N-1))
fn hamming_window(length: usize) -> Vec<f32> {
    (0..length)
        .map(|n| 0.54 - 0.46 * (2.0 * PI * n as f32 / (length - 1) as f32).cos())
        .collect()
}

/// Hanning window: 0.5 * (1 - cos(2*pi*n/(N-1)))
fn hanning_window(length: usize) -> Vec<f32> {
    (0..length)
        .map(|n| 0.5 * (1.0 - (2.0 * PI * n as f32 / (length - 1) as f32).cos()))
        .collect()
}

/// Compute power spectrum using DFT (magnitude squared of FFT)
/// For real input, we only need N/2+1 bins
fn power_spectrum_dft(frame: &[f32]) -> Vec<f32> {
    let n = frame.len();
    let num_bins = n / 2 + 1;
    let mut spectrum = vec![0.0_f32; num_bins];

    for k in 0..num_bins {
        let mut real = 0.0_f32;
        let mut imag = 0.0_f32;
        for (t, &sample) in frame.iter().enumerate() {
            let angle = -2.0 * PI * k as f32 * t as f32 / n as f32;
            real += sample * angle.cos();
            imag += sample * angle.sin();
        }
        spectrum[k] = real * real + imag * imag;
    }

    // Scale by N^2 for Parseval's theorem
    let scale = 1.0 / (n as f32 * n as f32);
    for val in &mut spectrum {
        *val *= scale;
    }

    spectrum
}

/// Create mel filterbank matrix [num_mel_bins, num_fft_bins]
fn mel_filterbank(
    num_mel_bins: usize,
    fft_length: usize,
    sample_rate: u32,
    fmin: f32,
    fmax: f32,
) -> Vec<Vec<f32>> {
    let num_fft_bins = fft_length / 2 + 1;
    let fft_bin_width = sample_rate as f32 / fft_length as f32;

    // Mel scale conversion
    let hz_to_mel = |hz: f32| -> f32 { 1125.0 * (1.0 + hz / 700.0).ln() };
    let mel_to_hz = |mel: f32| -> f32 { 700.0 * ((mel / 1125.0).exp() - 1.0) };

    let mel_min = hz_to_mel(fmin);
    let mel_max = hz_to_mel(fmax);
    let mel_step = (mel_max - mel_min) / (num_mel_bins + 1) as f32;

    // Mel band edges
    let mel_edges: Vec<f32> = (0..=num_mel_bins + 1)
        .map(|i| mel_min + i as f32 * mel_step)
        .collect();
    let hz_edges: Vec<f32> = mel_edges.iter().map(|&m| mel_to_hz(m)).collect();
    let bin_edges: Vec<usize> = hz_edges
        .iter()
        .map(|&hz| (hz / fft_bin_width).floor() as usize)
        .collect();

    // Build triangular filters
    let mut filterbank = Vec::with_capacity(num_mel_bins);
    for i in 0..num_mel_bins {
        let left = bin_edges[i];
        let center = bin_edges[i + 1];
        let right = bin_edges[i + 2];

        let mut filter = vec![0.0_f32; num_fft_bins];

        // Rising edge
        for b in left..center.min(num_fft_bins) {
            if center > left {
                filter[b] = (b - left) as f32 / (center - left) as f32;
            }
        }

        // Falling edge
        for b in center..right.min(num_fft_bins) {
            if right > center {
                filter[b] = (right - b) as f32 / (right - center) as f32;
            }
        }

        filterbank.push(filter);
    }

    filterbank
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fbank_config_defaults() {
        let config = FbankConfig::default();
        assert_eq!(config.sample_rate, 16_000);
        assert_eq!(config.frame_length_samples(), 400);  // 25ms * 16kHz
        assert_eq!(config.frame_shift_samples(), 160);   // 10ms * 16kHz
        assert_eq!(config.num_mel_bins, 80);
    }

    #[test]
    fn test_fbank_empty_audio() {
        let config = FbankConfig::default();
        let features = compute_fbank(&[], &config);
        assert!(features.is_empty());
    }

    #[test]
    fn test_fbank_short_audio() {
        let config = FbankConfig::default();
        // Less than one frame
        let samples = vec![0.0; 100];
        let features = compute_fbank(&samples, &config);
        assert!(features.is_empty());
    }

    #[test]
    fn test_fbank_one_frame() {
        let config = FbankConfig::default();
        // Exactly one frame
        let samples = vec![0.1; 400];
        let features = compute_fbank(&samples, &config);
        assert_eq!(features.len(), 1);
        assert_eq!(features[0].len(), 80);
    }

    #[test]
    fn test_fbank_multiple_frames() {
        let config = FbankConfig::default();
        // 2 seconds of audio = 32000 samples
        // Expected frames: 1 + (32000 - 400) / 160 = 198
        let samples = vec![0.1; 32_000];
        let features = compute_fbank(&samples, &config);
        assert_eq!(features.len(), 198);
        assert_eq!(features[0].len(), 80);
    }

    #[test]
    fn test_cmn_removes_mean() {
        let config = FbankConfig::default();
        let samples: Vec<f32> = (0..32_000).map(|i| (i as f32 * 0.001).sin()).collect();
        let features = compute_fbank(&samples, &config);
        
        // Check that mean is approximately zero for each bin
        if !features.is_empty() {
            let num_bins = features[0].len();
            for bin in 0..num_bins {
                let mean: f32 = features.iter().map(|f| f[bin]).sum::<f32>() / features.len() as f32;
                assert!(mean.abs() < 0.01, "Bin {} mean {} should be near zero", bin, mean);
            }
        }
    }
}
```

- [ ] **Step 2: Run tests to verify fbank implementation**

Run: `cd /Users/xuziyang/code/github/xzygh/echo-flow/src-tauri && cargo test fbank -- --nocapture 2>&1`
Expected: All 6 tests pass

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/transcribe/fbank.rs
git commit -m "$(cat <<'EOF'
feat(diarization): add log mel filterbank feature extraction

Implement compute_fbank() for speaker embedding preprocessing:
- 80-dim log mel filterbank with CMN
- Hamming/Hanning window support
- Preemphasis (0.97)
- Matches WeSpeaker/3D-Speaker defaults (25ms frame, 10ms shift)
EOF
)"
```

---

## Task 3: Implement Speaker Embedding Extractor

**Files:**
- Create: `src-tauri/src/transcribe/diarizer.rs`

- [ ] **Step 1: Write diarizer module with speaker embedding extraction**

```rust
// src-tauri/src/transcribe/diarizer.rs
// Speaker embedding extraction and clustering for diarization

use std::collections::HashMap;
use std::fmt;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use ort::session::{builder::GraphOptimizationLevel, Session};
use ort::value::Tensor;

use super::audio::SAMPLE_RATE;
use super::error::SubtitleError;
use super::fbank::{compute_fbank, FbankConfig};
use super::types::AudioSamples;

const DEFAULT_EMBEDDING_MODEL: &str = "models/voxceleb_CAM++.onnx";
const EMBEDDING_DIM: usize = 192;

/// Speaker ID type
pub type SpeakerId = usize;

/// Speaker embedding vector
pub type Embedding = Vec<f32>;

/// Diarization result for a segment
#[derive(Debug, Clone, PartialEq)]
pub struct SpeakerSegment {
    pub start_sample: usize,
    pub end_sample: usize,
    pub speaker: SpeakerId,
}

/// Speaker turn with timing
#[derive(Debug, Clone, PartialEq)]
pub struct SpeakerTurn {
    pub start_ms: u64,
    pub end_ms: u64,
    pub speaker: SpeakerId,
}

#[derive(Clone)]
pub struct Diarizer {
    config: Arc<DiarizerConfig>,
    models: Arc<Mutex<Option<DiarizerModels>>>,
}

impl fmt::Debug for Diarizer {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("Diarizer")
            .field("model_path", &self.config.model_path)
            .finish_non_exhaustive()
    }
}

#[derive(Debug, Clone)]
pub struct DiarizerConfig {
    pub model_path: PathBuf,
    /// Cosine similarity threshold for clustering (default: 0.4)
    pub cluster_threshold: f32,
    /// Minimum cluster size (default: 4)
    pub min_cluster_size: usize,
}

struct DiarizerModels {
    session: Session,
}

impl Default for Diarizer {
    fn default() -> Self {
        Self::new()
    }
}

impl Default for DiarizerConfig {
    fn default() -> Self {
        let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let home = std::env::var("HOME").unwrap_or_default();
        let cache_models = PathBuf::from(format!("{}/.cache/echo-flow/models", home));

        let model_path = if cache_models.join("voxceleb_CAM++.onnx").exists() {
            cache_models.join("voxceleb_CAM++.onnx")
        } else {
            manifest_dir.join(DEFAULT_EMBEDDING_MODEL)
        };

        Self {
            model_path,
            cluster_threshold: 0.4,
            min_cluster_size: 4,
        }
    }
}

impl Diarizer {
    pub fn new() -> Self {
        Self::with_config(DiarizerConfig::default())
    }

    pub fn with_config(config: DiarizerConfig) -> Self {
        Self {
            config: Arc::new(config),
            models: Arc::new(Mutex::new(None)),
        }
    }

    /// Perform speaker diarization on audio
    /// Returns speaker assignments for each VAD segment
    pub fn diarize(
        &self,
        audio: &AudioSamples,
        vad_segments: &[super::vad::VoiceSegment],
    ) -> Result<Vec<SpeakerSegment>, SubtitleError> {
        if vad_segments.is_empty() {
            return Ok(Vec::new());
        }

        // Load model if needed
        let mut models_guard = self
            .models
            .lock()
            .map_err(|e| SubtitleError::DiarizerInference(e.to_string()))?;
        if models_guard.is_none() {
            *models_guard = Some(load_embedding_model(&self.config.model_path)?);
        }
        let models = models_guard
            .as_ref()
            .expect("embedding model should be initialized");

        // Extract embeddings for each segment
        let embeddings: Vec<(usize, Embedding)> = vad_segments
            .iter()
            .enumerate()
            .filter_map(|(idx, seg)| {
                let start = seg.start_sample.min(audio.samples.len());
                let end = seg.end_sample.min(audio.samples.len());
                if end <= start {
                    return None;
                }
                let segment_audio = &audio.samples[start..end];
                let embedding = extract_embedding(segment_audio, models).ok()?;
                Some((idx, embedding))
            })
            .collect();

        if embeddings.is_empty() {
            // No valid embeddings, assign all to speaker 0
            return Ok(vad_segments
                .iter()
                .enumerate()
                .map(|(idx, seg)| SpeakerSegment {
                    start_sample: seg.start_sample,
                    end_sample: seg.end_sample,
                    speaker: 0,
                })
                .collect());
        }

        // Cluster embeddings
        let labels = cluster_embeddings(
            &embeddings,
            self.config.cluster_threshold,
            self.config.min_cluster_size,
        );

        // Build speaker segments
        let result: Vec<SpeakerSegment> = vad_segments
            .iter()
            .enumerate()
            .map(|(idx, seg)| SpeakerSegment {
                start_sample: seg.start_sample,
                end_sample: seg.end_sample,
                speaker: labels.get(&idx).copied().unwrap_or(0),
            })
            .collect();

        Ok(result)
    }
}

fn load_embedding_model(path: &Path) -> Result<DiarizerModels, SubtitleError> {
    let builder = Session::builder().map_err(|e| {
        SubtitleError::DiarizerLoad(format!("failed to create ORT session builder: {}", e))
    })?;
    let session = builder
        .with_optimization_level(GraphOptimizationLevel::All)
        .map_err(|e| SubtitleError::DiarizerLoad(e.to_string()))?
        .commit_from_file(path)
        .map_err(|e| SubtitleError::DiarizerLoad(e.to_string()))?;

    Ok(DiarizerModels { session })
}

/// Extract speaker embedding from audio segment
fn extract_embedding(samples: &[f32], models: &DiarizerModels) -> Result<Embedding, SubtitleError> {
    // Compute fbank features
    let config = FbankConfig::default();
    let features = compute_fbank(samples, &config);

    if features.is_empty() {
        return Err(SubtitleError::DiarizerInference(
            "no fbank features computed".to_string(),
        ));
    }

    let num_frames = features.len();
    let num_bins = features[0].len();

    // Flatten features to [1, T, 80] tensor
    let flat: Vec<f32> = features.iter().flatten().copied().collect();

    let input = Tensor::<f32>::from_array(([1, num_frames, num_bins], flat))
        .map_err(|e| SubtitleError::DiarizerInference(e.to_string()))?;

    // Run inference
    let outputs = models
        .session
        .run(ort::inputs!["feats" => input])
        .map_err(|e| SubtitleError::DiarizerInference(e.to_string()))?;

    // Extract embedding from output
    let (_, embedding_data) = outputs["embs"]
        .try_extract_tensor::<f32>()
        .map_err(|e| SubtitleError::DiarizerInference(e.to_string()))?;

    let embedding: Vec<f32> = embedding_data.to_vec();

    // Normalize embedding
    let norm: f32 = embedding.iter().map(|x| x * x).sum::<f32>().sqrt();
    let normalized: Vec<f32> = if norm > 1e-10 {
        embedding.iter().map(|x| x / norm).collect()
    } else {
        embedding
    };

    Ok(normalized)
}

/// Cluster embeddings using agglomerative clustering with cosine distance
/// Returns map from segment index to speaker label
fn cluster_embeddings(
    embeddings: &[(usize, Embedding)],
    threshold: f32,
    min_cluster_size: usize,
) -> HashMap<usize, SpeakerId> {
    let n = embeddings.len();
    if n == 0 {
        return HashMap::new();
    }

    if n == 1 {
        let mut labels = HashMap::new();
        labels.insert(embeddings[0].0, 0);
        return labels;
    }

    // Compute pairwise cosine similarity matrix
    let mut similarity = vec![vec![0.0_f32; n]; n];
    for i in 0..n {
        similarity[i][i] = 1.0;
        for j in (i + 1)..n {
            let sim = cosine_similarity(&embeddings[i].1, &embeddings[j].1);
            similarity[i][j] = sim;
            similarity[j][i] = sim;
        }
    }

    // Agglomerative clustering with average linkage
    // Use cosine distance = 1 - similarity
    let distance_threshold = 1.0 - threshold;  // Convert similarity threshold to distance

    let labels = agglomerative_clustering(&similarity, distance_threshold);

    // Post-process: reassign small clusters
    let labels = reassign_small_clusters(&labels, &embeddings, min_cluster_size);

    // Build result map
    labels
        .into_iter()
        .enumerate()
        .map(|(i, label)| (embeddings[i].0, label))
        .collect()
}

/// Cosine similarity between two vectors
fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    let dot: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
    let norm_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let norm_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();
    if norm_a > 1e-10 && norm_b > 1e-10 {
        dot / (norm_a * norm_b)
    } else {
        0.0
    }
}

/// Agglomerative clustering with average linkage
/// Returns cluster labels for each point
fn agglomerative_clustering(similarity: &[Vec<f32>], distance_threshold: f32) -> Vec<usize> {
    let n = similarity.len();
    if n == 0 {
        return Vec::new();
    }

    // Initialize: each point is its own cluster
    let mut cluster_labels: Vec<usize> = (0..n).collect();
    let mut cluster_members: Vec<Vec<usize>> = (0..n).map(|i| vec![i]).collect();
    let mut active_clusters: Vec<usize> = (0..n).collect();

    // Compute initial distance matrix (1 - similarity)
    let mut distances: Vec<Vec<f32>> = similarity
        .iter()
        .map(|row| row.iter().map(|&s| 1.0 - s).collect())
        .collect();

    // Iteratively merge closest clusters
    while active_clusters.len() > 1 {
        // Find minimum distance pair
        let mut min_dist = f32::INFINITY;
        let mut merge_i = 0;
        let mut merge_j = 0;

        for (i_idx, &ci) in active_clusters.iter().enumerate() {
            for &cj in active_clusters.iter().skip(i_idx + 1) {
                if distances[ci][cj] < min_dist {
                    min_dist = distances[ci][cj];
                    merge_i = ci;
                    merge_j = cj;
                }
            }
        }

        // Stop if minimum distance exceeds threshold
        if min_dist > distance_threshold {
            break;
        }

        // Merge cluster j into cluster i
        // Update all members of cluster j to have label i
        for &member in &cluster_members[merge_j] {
            cluster_labels[member] = merge_i;
        }
        cluster_members[merge_i].extend(cluster_members[merge_j].drain(..));

        // Update distances using average linkage (Lance-Williams formula)
        let ni = cluster_members[merge_i].len() as f32;
        for &ck in &active_clusters {
            if ck == merge_i || ck == merge_j {
                continue;
            }
            let nj = 0.0;  // cluster j is being merged
            let nk = cluster_members[ck].len() as f32;
            // Average linkage: d(i∪j, k) = (ni * d(i,k) + nj * d(j,k)) / (ni + nj)
            // But nj is now 0 since we moved all members, so:
            // d(i∪j, k) = (ni * d(i,k) + old_nj * d(j,k)) / (ni + old_nj)
            let old_nj = cluster_members[merge_i].len() as f32 - ni;
            let new_dist = if ni + old_nj > 0.0 {
                (ni * distances[merge_i][ck] + old_nj * distances[merge_j][ck]) / (ni + old_nj)
            } else {
                distances[merge_i][ck]
            };
            distances[merge_i][ck] = new_dist;
            distances[ck][merge_i] = new_dist;
        }

        // Remove cluster j from active list
        active_clusters.retain(|&c| c != merge_j);
    }

    // Relabel to consecutive integers
    let mut label_map: HashMap<usize, usize> = HashMap::new();
    let mut next_label = 0;
    for label in &cluster_labels {
        if !label_map.contains_key(label) {
            label_map.insert(*label, next_label);
            next_label += 1;
        }
    }

    cluster_labels
        .iter()
        .map(|l| *label_map.get(l).unwrap_or(&0))
        .collect()
}

/// Reassign small clusters to nearest large cluster
fn reassign_small_clusters(
    labels: &[usize],
    embeddings: &[(usize, Embedding)],
    min_size: usize,
) -> Vec<usize> {
    let n = labels.len();
    if n == 0 {
        return Vec::new();
    }

    // Count cluster sizes
    let mut cluster_sizes: HashMap<usize, usize> = HashMap::new();
    for &label in labels {
        *cluster_sizes.entry(label).or_insert(0) += 1;
    }

    // Find large clusters
    let large_clusters: Vec<usize> = cluster_sizes
        .iter()
        .filter(|(_, &size)| size >= min_size)
        .map(|(&label, _)| label)
        .collect();

    if large_clusters.is_empty() {
        // All clusters are small, keep as is
        return labels.to_vec();
    }

    // Compute centroids for large clusters
    let mut centroids: HashMap<usize, Vec<f32>> = HashMap::new();
    for &label in &large_clusters {
        centroids.insert(label, vec![0.0; EMBEDDING_DIM]);
    }

    for (i, &label) in labels.iter().enumerate() {
        if let Some(centroid) = centroids.get_mut(&label) {
            for (j, &val) in embeddings[i].1.iter().enumerate() {
                centroid[j] += val;
            }
        }
    }

    for (&label, centroid) in centroids.iter_mut() {
        let size = cluster_sizes[&label] as f32;
        for val in centroid.iter_mut() {
            *val /= size;
        }
    }

    // Reassign small cluster members to nearest large cluster
    let mut result = labels.to_vec();
    for i in 0..n {
        let label = labels[i];
        if cluster_sizes[&label] < min_size {
            // Find nearest large cluster
            let mut best_label = large_clusters[0];
            let mut best_sim = -1.0_f32;

            for &large_label in &large_clusters {
                let centroid = &centroids[&large_label];
                let sim = cosine_similarity(&embeddings[i].1, centroid);
                if sim > best_sim {
                    best_sim = sim;
                    best_label = large_label;
                }
            }
            result[i] = best_label;
        }
    }

    // Relabel to consecutive integers
    let mut label_map: HashMap<usize, usize> = HashMap::new();
    let mut next_label = 0;
    for &label in &result {
        if !label_map.contains_key(&label) {
            label_map.insert(label, next_label);
            next_label += 1;
        }
    }

    result
        .iter()
        .map(|l| *label_map.get(l).unwrap_or(&0))
        .collect()
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd /Users/xuziyang/code/github/xzygh/echo-flow/src-tauri && cargo check 2>&1 | head -30`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/transcribe/diarizer.rs
git commit -m "$(cat <<'EOF'
feat(diarization): add speaker embedding extractor and clustering

Implement Diarizer module:
- Load WeSpeaker CAM++ ONNX model
- Extract 192-dim speaker embeddings via fbank features
- Agglomerative clustering with average linkage
- Small cluster reassignment to nearest large cluster
- Configurable similarity threshold (default 0.4)
EOF
)"
```

---

## Task 4: Add Speaker Fields to Types

**Files:**
- Modify: `src-tauri/src/transcribe/types.rs`

- [ ] **Step 1: Add speaker_id to TranscriptSegment and Subtitle**

```rust
// In types.rs, modify TranscriptSegment:

/// 转写片段（内部使用）
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TranscriptSegment {
    pub id: usize,
    pub start_ms: u64,
    pub end_ms: u64,
    pub text: String,
    /// Speaker ID (0 = first speaker, 1 = second, etc.)
    #[serde(default)]
    pub speaker_id: usize,
}

// Modify Subtitle:

/// 字幕条目
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Subtitle {
    pub index: usize,
    pub start_ms: u64,
    pub end_ms: u64,
    pub text: String,
    /// Speaker ID
    #[serde(default)]
    pub speaker_id: usize,
}

// Modify FrontendTranscriptSegment:

/// 前端转写片段格式
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FrontendTranscriptSegment {
    pub id: i64,
    pub en: String,
    pub start_ms: i64,
    pub end_ms: i64,
    /// 词级时间戳（可选）
    #[serde(default)]
    pub words: Vec<WordToken>,
    /// Speaker ID (0 = first speaker, 1 = second, etc.)
    #[serde(default)]
    pub speaker_id: i64,
}
```

- [ ] **Step 2: Update existing code to set default speaker_id**

The existing code creates TranscriptSegment and Subtitle without speaker_id. With `#[serde(default)]`, deserialization will use 0. For construction, we need to add `speaker_id: 0` to existing constructors.

In `asr.rs`, update the TranscriptSegment construction:

```rust
// In asr.rs, append_whisper_segment function, change:
transcript_segments.push(TranscriptSegment {
    id: transcript_segments.len(),
    start_ms: chunk_start_ms,
    end_ms: chunk_end_ms,
    text: full_text,
    speaker_id: 0,  // Will be updated by diarizer
});
```

In `aligner.rs`, update the Subtitle construction:

```rust
// In aligner.rs, align function, change:
subtitles.push(Subtitle {
    index: subtitles.len() + 1,
    start_ms: sentence.start_ms.unwrap_or(fallback.0),
    end_ms: sentence.end_ms.unwrap_or(fallback.1),
    text: sentence.text,
    speaker_id: segment.speaker_id,  // Propagate from segment
});
```

- [ ] **Step 3: Verify compilation**

Run: `cd /Users/xuziyang/code/github/xzygh/echo-flow/src-tauri && cargo check 2>&1 | head -30`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/transcribe/types.rs src-tauri/src/transcribe/asr.rs src-tauri/src/transcribe/aligner.rs
git commit -m "$(cat <<'EOF'
feat(diarization): add speaker_id to transcript and subtitle types

Add speaker_id field to:
- TranscriptSegment (internal)
- Subtitle (internal)
- FrontendTranscriptSegment (frontend API)

Propagate speaker_id from segment to subtitle in aligner.
Default to speaker 0 for backward compatibility.
EOF
)"
```

---

## Task 5: Integrate Diarizer into Pipeline

**Files:**
- Modify: `src-tauri/src/transcribe/mod.rs`
- Modify: `src-tauri/src/transcribe/asr.rs`

- [ ] **Step 1: Add diarizer and fbank modules to mod.rs**

```rust
// In mod.rs, add to module declarations:
mod diarizer;
mod fbank;

// Re-export diarizer types:
pub use diarizer::{Diarizer, DiarizerConfig, SpeakerId, SpeakerSegment, SpeakerTurn};
```

- [ ] **Step 2: Update SubtitlePipeline to include diarizer**

```rust
// In mod.rs, update SubtitlePipeline:

use diarizer::Diarizer;

/// SubtitlePipeline - 完整的字幕生成 pipeline
#[derive(Debug, Default, Clone)]
pub struct SubtitlePipeline {
    audio: Audio,
    asr: Asr,
    aligner: Aligner,
    diarizer: Diarizer,
}

impl SubtitlePipeline {
    pub fn with_config(
        whisper_model_path: PathBuf,
        vad_model_path: PathBuf,
        align_model_path: PathBuf,
        align_vocab_path: PathBuf,
        embedding_model_path: PathBuf,
    ) -> Self {
        Self {
            audio: Audio::new(),
            asr: Asr::with_config(AsrConfig {
                vad_model_path,
                whisper_model_path,
                chunk_size_secs: 30.0,
                vad_threshold: 0.5,
            }),
            aligner: Aligner::with_config(AlignerConfig {
                model_path: align_model_path,
                vocab_path: align_vocab_path,
            }),
            diarizer: Diarizer::with_config(DiarizerConfig {
                model_path: embedding_model_path,
                cluster_threshold: 0.4,
                min_cluster_size: 4,
            }),
        }
    }
    
    // ... rest of implementation
}
```

- [ ] **Step 3: Update process_with_progress to use diarizer**

This requires modifying the ASR to return VAD segments, then running diarizer, then updating segments with speaker labels.

The flow becomes:
1. Load audio
2. Run VAD to get voice segments
3. Run diarizer on VAD segments to get speaker labels
4. Run Whisper on each VAD segment (with speaker label)
5. Run alignment
6. Return subtitles with speaker info

This is a significant refactor of `asr.rs`. Let's modify `asr.rs` to expose VAD segments:

```rust
// In asr.rs, add a new method that returns VAD segments:

impl Asr {
    /// Detect voice segments without transcription
    pub fn detect_voice_segments(
        &self,
        audio: &AudioSamples,
    ) -> Result<Vec<super::vad::VoiceSegment>, SubtitleError> {
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

        Ok(voice_segments)
    }

    /// Transcribe specific voice segments
    pub fn transcribe_segments(
        &self,
        audio: &AudioSamples,
        voice_segments: &[super::vad::VoiceSegment],
        speaker_labels: &[usize],  // Parallel to voice_segments
    ) -> Result<Transcript, SubtitleError> {
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

        let chunks = merge_voice_segments(
            voice_segments,
            audio.sample_rate,
            self.config.chunk_size_secs,
            audio.samples.len(),
        );

        if chunks.is_empty() {
            return Ok(Transcript {
                language: None,
                segments: Vec::new(),
            });
        }

        // Map chunks to speaker labels (use first segment's speaker)
        let mut transcript_segments = Vec::new();
        for (chunk_idx, chunk) in chunks.iter().enumerate() {
            let samples = &audio.samples[chunk.start_sample..chunk.end_sample];
            
            // Find speaker for this chunk (majority vote from overlapping segments)
            let chunk_start_ms = sample_to_ms(chunk.start_sample, audio.sample_rate);
            let chunk_end_ms = chunk_start_ms + samples_to_ms(samples.len(), audio.sample_rate);
            
            let speaker_id = find_majority_speaker(
                voice_segments,
                speaker_labels,
                chunk.start_sample,
                chunk.end_sample,
            );

            append_whisper_segment_with_speaker(
                &models.whisper,
                samples,
                chunk_start_ms,
                audio.sample_rate,
                &mut transcript_segments,
                speaker_id,
            )?;
        }

        Ok(Transcript {
            language: Some(DEFAULT_LANGUAGE.to_owned()),
            segments: transcript_segments,
        })
    }
}

fn find_majority_speaker(
    voice_segments: &[super::vad::VoiceSegment],
    speaker_labels: &[usize],
    chunk_start: usize,
    chunk_end: usize,
) -> usize {
    use std::collections::HashMap;
    
    let mut speaker_duration: HashMap<usize, usize> = HashMap::new();
    
    for (i, seg) in voice_segments.iter().enumerate() {
        let overlap_start = seg.start_sample.max(chunk_start);
        let overlap_end = seg.end_sample.min(chunk_end);
        if overlap_end > overlap_start {
            let duration = overlap_end - overlap_start;
            *speaker_duration.entry(speaker_labels[i]).or_insert(0) += duration;
        }
    }
    
    speaker_duration
        .into_iter()
        .max_by_key(|(_, d)| *d)
        .map(|(s, _)| s)
        .unwrap_or(0)
}

fn append_whisper_segment_with_speaker(
    whisper: &WhisperContext,
    samples: &[f32],
    chunk_start_ms: u64,
    audio_sample_rate: u32,
    transcript_segments: &mut Vec<TranscriptSegment>,
    speaker_id: usize,
) -> Result<(), SubtitleError> {
    // Same as append_whisper_segment but with speaker_id
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
    params.set_no_timestamps(true);
    params.set_single_segment(true);

    let mut state = whisper
        .create_state()
        .map_err(|error| SubtitleError::WhisperInference(error.to_string()))?;
    state
        .full(params, samples)
        .map_err(|error| SubtitleError::WhisperInference(error.to_string()))?;

    let mut texts: Vec<String> = Vec::new();
    for segment in state.as_iter() {
        let text = segment
            .to_str_lossy()
            .map_err(|error| SubtitleError::WhisperInference(error.to_string()))?
            .trim()
            .to_owned();
        if !text.is_empty() {
            texts.push(text);
        }
    }

    if texts.is_empty() {
        return Ok(());
    }

    let full_text = texts.join(" ");
    let chunk_end_ms = chunk_start_ms + samples_to_ms(samples.len(), audio_sample_rate);
    transcript_segments.push(TranscriptSegment {
        id: transcript_segments.len(),
        start_ms: chunk_start_ms,
        end_ms: chunk_end_ms,
        text: full_text,
        speaker_id,
    });

    Ok(())
}
```

- [ ] **Step 4: Update mod.rs process_with_progress**

```rust
// In mod.rs, update process_with_progress:

pub fn process_with_progress<F>(&self, input: &Path, mut progress: F) -> Result<ProcessingResult, SubtitleError>
where
    F: FnMut(&str, f32),
{
    progress("Loading audio", 0.0);
    let audio = self.audio.load(input)?;
    progress("Audio loaded", 10.0);

    progress("Detecting voice segments", 10.0);
    let voice_segments = self.asr.detect_voice_segments(&audio)?;
    progress("Voice detection complete", 20.0);

    progress("Identifying speakers", 20.0);
    let speaker_segments = self.diarizer.diarize(&audio, &voice_segments)?;
    let speaker_labels: Vec<usize> = speaker_segments.iter().map(|s| s.speaker).collect();
    let num_speakers = speaker_labels.iter().max().map(|&m| m + 1).unwrap_or(1);
    progress(&format!("Found {} speaker(s)", num_speakers), 30.0);

    progress("Transcribing audio", 30.0);
    let transcript = self.asr.transcribe_segments(&audio, &voice_segments, &speaker_labels)?;
    progress("Transcription complete", 60.0);

    progress("Aligning with Wav2Vec2", 60.0);
    let subtitles = self.aligner.align(&audio, &transcript)?;
    progress("Alignment complete", 100.0);

    Ok(ProcessingResult {
        audio,
        transcript,
        subtitles,
    })
}
```

- [ ] **Step 5: Update transcribe_audio command to resolve embedding model path**

```rust
// In mod.rs, transcribe_audio function, add embedding model resolution:

    // Speaker embedding model path
    let embedding_model = resolve_model_path(None, &[
        &format!("{}/voxceleb_CAM++.onnx", cache_models),
        "./models/voxceleb_CAM++.onnx",
    ])?;

    // Update pipeline creation:
    let pipeline = SubtitlePipeline::with_config(
        whisper_model,
        vad_model,
        align_model,
        align_vocab,
        embedding_model,
    );
```

- [ ] **Step 6: Update FrontendTranscriptSegment construction to include speaker_id**

```rust
// In mod.rs, in the transcribe_audio spawn closure:
let segments: Vec<FrontendTranscriptSegment> = result.subtitles.iter().map(|s| FrontendTranscriptSegment {
    id: s.index as i64,
    en: s.text.clone(),
    start_ms: s.start_ms as i64,
    end_ms: s.end_ms as i64,
    words: Vec::new(),
    speaker_id: s.speaker_id as i64,
}).collect();
```

- [ ] **Step 7: Verify compilation**

Run: `cd /Users/xuziyang/code/github/xzygh/echo-flow/src-tauri && cargo check 2>&1 | head -50`
Expected: No errors

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/transcribe/mod.rs src-tauri/src/transcribe/asr.rs
git commit -m "$(cat <<'EOF'
feat(diarization): integrate speaker diarization into pipeline

Pipeline flow updated:
1. VAD detects voice segments
2. Diarizer extracts embeddings and clusters by speaker
3. Whisper transcribes each segment with speaker label
4. Aligner propagates speaker info to subtitles

New progress stages: "Identifying speakers", "Found N speaker(s)"
EOF
)"
```

---

## Task 6: Update Frontend Types

**Files:**
- Modify: `src/stores/useTranscriptStore.ts`

- [ ] **Step 1: Add speaker_id to frontend types**

```typescript
// In useTranscriptStore.ts, update interfaces:

export interface Sentence {
  id: number
  en: string
  status: 'saved' | 'new' | 'changed' | 'editing'
  dirty: boolean
  issues: string[]
  start_ms?: number
  end_ms?: number
  speaker_id?: number  // Speaker label (0, 1, 2, ...)
}

export interface SubtitleEntry {
  id: number
  en: string
  start_ms?: number
  end_ms?: number
  speaker_id?: number
}

export interface TranscriptSegment {
  id: number
  en: string
  start_ms: number
  end_ms: number
  words?: WordToken[]
  speaker_id?: number
}

// Update applyTranscribeDone to extract speaker_id:
function applyTranscribeDone(event: TranscribeDoneEvent) {
  const isCurrent = isCurrentTranscribeTarget(event.job_id, event.audio_path)
  console.info('[transcribe] apply done', {
    jobId: event.job_id,
    audioPath: event.audio_path,
    isCurrent,
    incomingSegments: event.segments.length,
    currentAudioPath: currentAudioPath.value,
    activeTranscribeJobId: activeTranscribeJobId.value,
  })
  if (!isCurrent) return

  sentences.value = event.segments.map((seg, idx) => ({
    id: seg.id ?? idx + 1,
    en: seg.en,
    status: 'saved' as const,
    dirty: false,
    issues: [],
    start_ms: seg.start_ms,
    end_ms: seg.end_ms,
    speaker_id: seg.speaker_id ?? 0,
  }))
  // ... rest unchanged
}
```

- [ ] **Step 2: Verify TypeScript compilation**

Run: `cd /Users/xuziyang/code/github/xzygh/echo-flow && npm run type-check 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/stores/useTranscriptStore.ts
git commit -m "$(cat <<'EOF'
feat(diarization): add speaker_id to frontend transcript types

Add speaker_id field to Sentence, SubtitleEntry, TranscriptSegment.
Extract speaker_id from backend response in applyTranscribeDone.
EOF
)"
```

---

## Task 7: Display Speaker Labels in UI

**Files:**
- Modify: `src/components/listening/SubtitleCard.vue`
- Modify: `src/components/shadowing/ScriptFlowItem.vue`

- [ ] **Step 1: Add speaker label display to SubtitleCard.vue**

```vue
<!-- In SubtitleCard.vue, add speaker indicator after the index badge -->

<script setup lang="ts">
// ... existing imports

// Add speaker color mapping
const speakerColors = [
  'bg-blue-500',   // Speaker 0: Blue
  'bg-emerald-500', // Speaker 1: Green
  'bg-amber-500',   // Speaker 2: Amber
  'bg-rose-500',    // Speaker 3: Rose
  'bg-violet-500',  // Speaker 4: Violet
]

const speakerColor = computed(() => {
  const id = props.item.speaker_id ?? 0
  return speakerColors[id % speakerColors.length]
})

const speakerLabel = computed(() => {
  const id = props.item.speaker_id ?? 0
  return `Speaker ${String.fromCharCode(65 + id)}`  // A, B, C, ...
})
</script>

<template>
  <!-- In the normal sentence display section, add speaker indicator -->
  <div v-if="!isEditing" class="flex items-start gap-2.5">
    <div class="flex items-center gap-1.5 pt-0.5 flex-shrink-0">
      <!-- Speaker indicator -->
      <div v-if="item.speaker_id !== undefined"
           class="w-2.5 h-2.5 rounded-full mr-1"
           :class="speakerColor"
           :title="speakerLabel"></div>
      <span class="text-[10px] font-bold uppercase tracking-[0.16em]"
            :class="app.theme === 'dark' ? 'text-zinc-500' : 'text-slate-400'">
        {{ String(index + 1).padStart(2, '0') }}
      </span>
      <!-- ... rest unchanged -->
    </div>
    <!-- ... rest unchanged -->
  </div>
</template>
```

- [ ] **Step 2: Add speaker label display to ScriptFlowItem.vue**

```vue
<!-- In ScriptFlowItem.vue, add speaker indicator -->

<script setup lang="ts">
// ... existing imports

const speakerColors = [
  'bg-blue-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-violet-500',
]

const speakerColor = computed(() => {
  const id = props.item.speaker_id ?? 0
  return speakerColors[id % speakerColors.length]
})
</script>

<template>
  <div @click="emit('click', index)"
       @mouseenter="isHovered = true"
       @mouseleave="isHovered = false"
       class="p-3 rounded-lg border cursor-pointer transition-all group flex gap-3 items-start"
       :class="itemClass">

    <!-- Status Icon with speaker color -->
    <div class="mt-0.5">
      <div class="w-2 h-2 rounded-full mt-1.5"
           :class="isActive
              ? (app.theme === 'dark' ? 'bg-brand-500 animate-pulse' : 'bg-black animate-pulse')
              : speakerColor"></div>
    </div>
    <!-- ... rest unchanged -->
  </div>
</template>
```

- [ ] **Step 3: Verify compilation**

Run: `cd /Users/xuziyang/code/github/xzygh/echo-flow && npm run type-check 2>&1 | head -20`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/components/listening/SubtitleCard.vue src/components/shadowing/ScriptFlowItem.vue
git commit -m "$(cat <<'EOF'
feat(diarization): display speaker labels in subtitle cards

Add colored speaker indicators:
- Speaker A: Blue
- Speaker B: Green
- Speaker C: Amber
- Speaker D: Rose
- Speaker E+: Violet (cycles)

Show in both SubtitleCard and ScriptFlowItem components.
EOF
)"
```

---

## Task 8: Download Speaker Embedding Model

**Files:**
- Create download script or documentation

- [ ] **Step 1: Add model download instructions to README or setup**

Create a simple download script or add to setup documentation:

```bash
# Download WeSpeaker CAM++ ONNX model (~29MB)
mkdir -p ~/.cache/echo-flow/models
curl -L -o ~/.cache/echo-flow/models/voxceleb_CAM++.onnx \
  "https://huggingface.co/Wespeaker/wespeaker-voxceleb-campplus/resolve/main/voxceleb_CAM++.onnx?download=true"
```

Or add to the app's model resolution logic to auto-download if missing.

- [ ] **Step 2: Test with a multi-speaker audio file**

Run the app with a dialogue audio file and verify:
1. Progress shows "Identifying speakers" and "Found N speaker(s)"
2. Subtitles have colored speaker indicators
3. Different speakers have different colors

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(diarization): complete speaker diarization implementation

Speaker diarization now works end-to-end:
- VAD segments → speaker embeddings → clustering → labeled subtitles
- UI shows colored speaker indicators
- Supports unlimited speakers with color cycling

Model: WeSpeaker CAM++ (29MB, 192-dim embeddings)
Clustering: Agglomerative with average linkage, threshold 0.4
EOF
)"
```

---

## Self-Review Checklist

1. **Spec coverage:**
   - ✅ Speaker embedding extraction (Task 3)
   - ✅ Agglomerative clustering (Task 3)
   - ✅ Pipeline integration (Task 5)
   - ✅ Frontend types (Task 6)
   - ✅ UI display (Task 7)

2. **Placeholder scan:**
   - No TBD/TODO found
   - All code steps have actual implementation

3. **Type consistency:**
   - `speaker_id: usize` in Rust backend
   - `speaker_id: number` in TypeScript frontend
   - `speaker_id: i64` in frontend API types (consistent with other IDs)

---

## Execution Options

**Plan complete and saved to `docs/superpowers/plans/2026-05-26-speaker-diarization.md`.**

**Two execution options:**

1. **Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

2. **Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
