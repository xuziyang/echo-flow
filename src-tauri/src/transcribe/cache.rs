use std::fs::{self, File};
use std::io::{self, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use super::types::{AudioSamples, CacheSubtitleEntry, FrontendTranscriptSegment, Subtitle};
use super::writer;

pub const CACHE_SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone)]
pub struct TranscriptionCachePaths {
    pub entry_dir: PathBuf,
    pub audio_wav: PathBuf,
    pub subtitles_srt: PathBuf,
    pub subtitles_meta_json: PathBuf,
    pub metadata_json: PathBuf,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranscriptionCacheMetadata {
    pub schema_version: u32,
    pub source_name: String,
    pub source_size: u64,
    pub source_hash: String,
    pub whisper_model: String,
    pub vad_model: String,
    pub align_model: String,
    pub align_vocab: String,
    pub created_at_unix_secs: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CachedSubtitleMetadata {
    pub schema_version: u32,
    pub sentences: Vec<CacheSubtitleEntry>,
}

pub fn sha256_file(path: &Path) -> io::Result<String> {
    let file = File::open(path)?;
    let mut reader = BufReader::new(file);
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];

    loop {
        let read = reader.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }

    Ok(hex_lower(&hasher.finalize()))
}

pub fn model_identity(path: &Path) -> io::Result<String> {
    let metadata = fs::metadata(path)?;
    let modified_secs = metadata
        .modified()
        .ok()
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_secs())
        .unwrap_or(0);
    let name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("model");

    Ok(format!("{}-{}-{}", name, metadata.len(), modified_secs))
}

pub fn cache_key(
    source_hash: &str,
    whisper_identity: &str,
    vad_identity: &str,
    align_identity: &str,
    vocab_identity: &str,
) -> String {
    let raw = format!(
        "v{}:{}:{}:{}:{}:{}",
        CACHE_SCHEMA_VERSION,
        source_hash,
        whisper_identity,
        vad_identity,
        align_identity,
        vocab_identity
    );
    let mut hasher = Sha256::new();
    hasher.update(raw.as_bytes());
    format!(
        "v{}-{}",
        CACHE_SCHEMA_VERSION,
        hex_lower(&hasher.finalize())
    )
}

pub fn cache_paths(base_dir: &Path, key: &str) -> TranscriptionCachePaths {
    let entry_dir = base_dir.join("transcripts").join(key);
    TranscriptionCachePaths {
        audio_wav: entry_dir.join("audio.wav"),
        subtitles_srt: entry_dir.join("subtitles.srt"),
        subtitles_meta_json: entry_dir.join("subtitles.meta.json"),
        metadata_json: entry_dir.join("metadata.json"),
        entry_dir,
    }
}

pub fn read_cached_segments(
    paths: &TranscriptionCachePaths,
) -> io::Result<Vec<FrontendTranscriptSegment>> {
    if paths.subtitles_meta_json.exists() {
        match read_cached_subtitle_metadata(&paths.subtitles_meta_json) {
            Ok(segments) => return Ok(segments),
            Err(error) => {
                log::warn!(
                    "Ignoring invalid cached subtitle metadata at {}: {}",
                    paths.subtitles_meta_json.display(),
                    error
                );
            }
        }
    }

    let content = fs::read_to_string(&paths.subtitles_srt)?;
    parse_srt_segments(&content)
}

pub fn write_cache_entry(
    paths: &TranscriptionCachePaths,
    audio: &AudioSamples,
    subtitles: &[Subtitle],
    metadata: &TranscriptionCacheMetadata,
) -> io::Result<()> {
    fs::create_dir_all(&paths.entry_dir)?;

    let audio_tmp = paths.entry_dir.join("audio.wav.tmp");
    let subtitles_tmp = paths.entry_dir.join("subtitles.srt.tmp");
    let subtitles_meta_tmp = paths.entry_dir.join("subtitles.meta.json.tmp");
    let metadata_tmp = paths.entry_dir.join("metadata.json.tmp");

    write_audio_wav(&audio_tmp, audio)?;
    write_subtitles_srt(&subtitles_tmp, subtitles)?;
    write_subtitles_meta_json(&subtitles_meta_tmp, &entries_from_subtitles(subtitles))?;
    write_metadata_json(&metadata_tmp, metadata)?;

    rename_replace(&audio_tmp, &paths.audio_wav)?;
    rename_replace(&subtitles_tmp, &paths.subtitles_srt)?;
    rename_replace(&subtitles_meta_tmp, &paths.subtitles_meta_json)?;
    rename_replace(&metadata_tmp, &paths.metadata_json)?;

    Ok(())
}

pub fn write_cached_subtitles(
    paths: &TranscriptionCachePaths,
    entries: &[CacheSubtitleEntry],
) -> io::Result<()> {
    fs::create_dir_all(&paths.entry_dir)?;
    let subtitles_tmp = paths.entry_dir.join("subtitles.srt.tmp");
    let subtitles_meta_tmp = paths.entry_dir.join("subtitles.meta.json.tmp");
    let subtitles = subtitles_from_entries(entries);

    write_subtitles_srt(&subtitles_tmp, &subtitles)?;
    write_subtitles_meta_json(&subtitles_meta_tmp, entries)?;
    rename_replace(&subtitles_tmp, &paths.subtitles_srt)?;
    rename_replace(&subtitles_meta_tmp, &paths.subtitles_meta_json)?;

    Ok(())
}

pub fn source_size(path: &Path) -> io::Result<u64> {
    Ok(fs::metadata(path)?.len())
}

pub fn source_name(path: &Path) -> String {
    path.file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("unknown")
        .to_owned()
}

pub fn unix_now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}

pub fn write_audio_wav(path: &Path, audio: &AudioSamples) -> io::Result<()> {
    let bits_per_sample = 16_u16;
    let bytes_per_sample = bits_per_sample / 8;
    let block_align = audio.channels * bytes_per_sample;
    let data_size = audio.samples.len() as u32 * bytes_per_sample as u32;
    let buffer_size = 44 + data_size;

    let mut file = File::create(path)?;
    file.write_all(b"RIFF")?;
    file.write_all(&(buffer_size - 8).to_le_bytes())?;
    file.write_all(b"WAVE")?;
    file.write_all(b"fmt ")?;
    file.write_all(&16_u32.to_le_bytes())?;
    file.write_all(&1_u16.to_le_bytes())?;
    file.write_all(&audio.channels.to_le_bytes())?;
    file.write_all(&audio.sample_rate.to_le_bytes())?;
    file.write_all(&(audio.sample_rate * block_align as u32).to_le_bytes())?;
    file.write_all(&block_align.to_le_bytes())?;
    file.write_all(&bits_per_sample.to_le_bytes())?;
    file.write_all(b"data")?;
    file.write_all(&data_size.to_le_bytes())?;

    for sample in &audio.samples {
        let clamped = sample.clamp(-1.0, 1.0);
        let int16 = if clamped < 0.0 {
            (clamped * 32768.0) as i16
        } else {
            (clamped * 32767.0) as i16
        };
        file.write_all(&int16.to_le_bytes())?;
    }

    Ok(())
}

fn write_subtitles_srt(path: &Path, subtitles: &[Subtitle]) -> io::Result<()> {
    let file = File::create(path)?;
    writer::write_srt(subtitles, file)
}

fn write_metadata_json(path: &Path, metadata: &TranscriptionCacheMetadata) -> io::Result<()> {
    let bytes = serde_json::to_vec_pretty(metadata)
        .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;
    fs::write(path, bytes)
}

fn write_subtitles_meta_json(path: &Path, entries: &[CacheSubtitleEntry]) -> io::Result<()> {
    let metadata = CachedSubtitleMetadata {
        schema_version: CACHE_SCHEMA_VERSION,
        sentences: entries.to_vec(),
    };
    let bytes = serde_json::to_vec_pretty(&metadata)
        .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;
    fs::write(path, bytes)
}

fn read_cached_subtitle_metadata(path: &Path) -> io::Result<Vec<FrontendTranscriptSegment>> {
    let bytes = fs::read(path)?;
    let metadata = serde_json::from_slice::<CachedSubtitleMetadata>(&bytes)
        .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))?;
    if metadata.sentences.is_empty() {
        return Ok(Vec::new());
    }

    let mut segments = Vec::with_capacity(metadata.sentences.len());
    for entry in metadata.sentences {
        let start_ms = entry.start_ms.ok_or_else(|| {
            io::Error::new(
                io::ErrorKind::InvalidData,
                "cached subtitle metadata missing start_ms",
            )
        })?;
        let end_ms = entry.end_ms.ok_or_else(|| {
            io::Error::new(
                io::ErrorKind::InvalidData,
                "cached subtitle metadata missing end_ms",
            )
        })?;
        if entry.id <= 0 || entry.en.trim().is_empty() || end_ms <= start_ms {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "cached subtitle metadata contains invalid sentence",
            ));
        }

        segments.push(FrontendTranscriptSegment {
            id: entry.id,
            en: entry.en,
            start_ms,
            end_ms,
            words: Vec::new(),
        });
    }

    Ok(segments)
}

fn entries_from_subtitles(subtitles: &[Subtitle]) -> Vec<CacheSubtitleEntry> {
    subtitles
        .iter()
        .map(|subtitle| CacheSubtitleEntry {
            id: subtitle.index as i64,
            en: subtitle.text.clone(),
            start_ms: Some(subtitle.start_ms as i64),
            end_ms: Some(subtitle.end_ms as i64),
        })
        .collect()
}

fn subtitles_from_entries(entries: &[CacheSubtitleEntry]) -> Vec<Subtitle> {
    entries
        .iter()
        .enumerate()
        .map(|(index, entry)| {
            let fallback_start_ms = index as u64 * 5_000 + 1_000;
            let start_ms = entry
                .start_ms
                .filter(|value| *value >= 0)
                .map(|value| value as u64)
                .unwrap_or(fallback_start_ms);
            let end_ms = entry
                .end_ms
                .filter(|value| *value > start_ms as i64)
                .map(|value| value as u64)
                .unwrap_or(start_ms + 500);
            Subtitle {
                index: index + 1,
                start_ms,
                end_ms,
                text: entry.en.clone(),
            }
        })
        .collect()
}

fn rename_replace(from: &Path, to: &Path) -> io::Result<()> {
    if to.exists() {
        fs::remove_file(to)?;
    }
    fs::rename(from, to)
}

fn parse_srt_segments(content: &str) -> io::Result<Vec<FrontendTranscriptSegment>> {
    let normalized = content.replace("\r\n", "\n").replace('\r', "\n");
    let trimmed = normalized.trim();
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }

    let mut segments = Vec::new();
    for block in trimmed.split("\n\n") {
        let lines = block
            .lines()
            .map(str::trim_end)
            .filter(|line| !line.trim().is_empty())
            .collect::<Vec<_>>();
        if lines.len() < 3 {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "cached SRT block has fewer than 3 lines",
            ));
        }

        let timing_line = lines[1];
        let (start, end) = timing_line.split_once("-->").ok_or_else(|| {
            io::Error::new(
                io::ErrorKind::InvalidData,
                "cached SRT block is missing timing separator",
            )
        })?;
        let start_ms = parse_srt_time(start).ok_or_else(|| {
            io::Error::new(
                io::ErrorKind::InvalidData,
                "cached SRT has invalid start time",
            )
        })?;
        let end_ms = parse_srt_time(end).ok_or_else(|| {
            io::Error::new(
                io::ErrorKind::InvalidData,
                "cached SRT has invalid end time",
            )
        })?;
        let text = lines[2..].join("\n").trim().to_owned();
        if text.is_empty() {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "cached SRT block has empty text",
            ));
        }

        segments.push(FrontendTranscriptSegment {
            id: segments.len() as i64 + 1,
            en: text,
            start_ms: start_ms as i64,
            end_ms: end_ms as i64,
            words: Vec::new(),
        });
    }

    Ok(segments)
}

fn parse_srt_time(value: &str) -> Option<u64> {
    let (hms, millis) = value.trim().split_once(',')?;
    let parts = hms.split(':').collect::<Vec<_>>();
    if parts.len() != 3 {
        return None;
    }

    let hours = parts[0].parse::<u64>().ok()?;
    let minutes = parts[1].parse::<u64>().ok()?;
    let seconds = parts[2].parse::<u64>().ok()?;
    let millis = millis.trim().parse::<u64>().ok()?;

    Some(((hours * 60 + minutes) * 60 + seconds) * 1_000 + millis)
}

fn hex_lower(bytes: &[u8]) -> String {
    let mut output = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        use std::fmt::Write as _;
        let _ = write!(&mut output, "{byte:02x}");
    }
    output
}

#[cfg(test)]
mod tests {
    use super::*;

    fn unique_temp_path(name: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("echo-flow-cache-test-{name}-{nanos}"))
    }

    #[test]
    fn cache_key_is_stable_for_same_inputs() {
        let first = cache_key("abc", "whisper-a", "vad-a", "align-a", "vocab-a");
        let second = cache_key("abc", "whisper-a", "vad-a", "align-a", "vocab-a");

        assert_eq!(first, second);
    }

    #[test]
    fn cache_key_changes_for_different_whisper_model() {
        let first = cache_key("abc", "whisper-a", "vad-a", "align-a", "vocab-a");
        let second = cache_key("abc", "whisper-b", "vad-a", "align-a", "vocab-a");

        assert_ne!(first, second);
    }

    #[test]
    fn writes_16khz_mono_wav() {
        let path = unique_temp_path("audio.wav");
        let audio = AudioSamples {
            sample_rate: 16_000,
            channels: 1,
            samples: vec![-1.0, 0.0, 1.0],
            source_path: "/tmp/source.mp3".to_owned(),
        };

        write_audio_wav(&path, &audio).unwrap();
        let bytes = fs::read(&path).unwrap();

        assert_eq!(&bytes[0..4], b"RIFF");
        assert_eq!(&bytes[8..12], b"WAVE");
        assert_eq!(u16::from_le_bytes([bytes[22], bytes[23]]), 1);
        assert_eq!(
            u32::from_le_bytes([bytes[24], bytes[25], bytes[26], bytes[27]]),
            16_000
        );
        assert_eq!(u16::from_le_bytes([bytes[34], bytes[35]]), 16);

        let _ = fs::remove_file(path);
    }

    #[test]
    fn parses_cached_srt_to_frontend_segments() {
        let content = "1\n00:00:01,000 --> 00:00:02,500\nHello.\n\n2\n00:00:03,000 --> 00:00:04,000\nWorld.\n\n";

        let segments = parse_srt_segments(content).unwrap();

        assert_eq!(segments.len(), 2);
        assert_eq!(segments[0].en, "Hello.");
        assert_eq!(segments[0].start_ms, 1000);
        assert_eq!(segments[1].end_ms, 4000);
    }

    #[test]
    fn writes_cached_subtitle_metadata_with_stable_ids() {
        let base = unique_temp_path("cache-meta");
        let paths = cache_paths(&base, "entry");
        let entries = vec![
            CacheSubtitleEntry {
                id: 7,
                en: "Hello.".to_owned(),
                start_ms: Some(1000),
                end_ms: Some(2500),
            },
            CacheSubtitleEntry {
                id: 12,
                en: "World.".to_owned(),
                start_ms: Some(3000),
                end_ms: Some(4000),
            },
        ];

        write_cached_subtitles(&paths, &entries).unwrap();

        assert!(paths.subtitles_srt.exists());
        assert!(paths.subtitles_meta_json.exists());
        let segments = read_cached_segments(&paths).unwrap();
        assert_eq!(segments[0].id, 7);
        assert_eq!(segments[1].id, 12);

        let _ = fs::remove_dir_all(base);
    }

    #[test]
    fn read_cached_segments_falls_back_to_srt_without_metadata() {
        let base = unique_temp_path("cache-srt-fallback");
        let paths = cache_paths(&base, "entry");
        fs::create_dir_all(&paths.entry_dir).unwrap();
        fs::write(
            &paths.subtitles_srt,
            "1\n00:00:01,000 --> 00:00:02,500\nHello.\n\n",
        )
        .unwrap();

        let segments = read_cached_segments(&paths).unwrap();

        assert_eq!(segments.len(), 1);
        assert_eq!(segments[0].id, 1);
        assert_eq!(segments[0].en, "Hello.");

        let _ = fs::remove_dir_all(base);
    }
}
