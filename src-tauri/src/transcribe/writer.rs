use std::io::{self, Write};

use super::types::Subtitle;

pub fn write_srt<W: Write>(subtitles: &[Subtitle], mut writer: W) -> io::Result<()> {
    for subtitle in subtitles {
        writeln!(writer, "{}", subtitle.index)?;
        writeln!(
            writer,
            "{} --> {}",
            format_timestamp(subtitle.start_ms),
            format_timestamp(subtitle.end_ms)
        )?;
        writeln!(writer, "{}", subtitle.text)?;
        writeln!(writer)?;
    }

    Ok(())
}

pub fn to_srt(subtitles: &[Subtitle]) -> io::Result<String> {
    let mut buffer = Vec::new();
    write_srt(subtitles, &mut buffer)?;
    String::from_utf8(buffer).map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))
}

pub fn format_timestamp(ms: u64) -> String {
    let hours = ms / 3_600_000;
    let minutes = (ms % 3_600_000) / 60_000;
    let seconds = (ms % 60_000) / 1_000;
    let millis = ms % 1_000;

    format!("{hours:02}:{minutes:02}:{seconds:02},{millis:03}")
}
