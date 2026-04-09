// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod audio;
mod transcribe;

use log::info;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            audio::open_audio_file,
            audio::load_subtitle_file,
            audio::save_subtitle_file,
            audio::start_playback,
            audio::pause_playback,
            audio::resume_playback,
            audio::stop_playback,
            audio::seek_playback,
            audio::set_playback_volume,
            audio::get_playback_state,
            audio::save_recording,
            transcribe::transcribe_audio,
        ])
        .setup(|app| {
            info!("echo-flow starting...");
            let mut builder =
                tauri::WebviewWindowBuilder::from_config(app.handle(), &app.config().app.windows[0])?;
            #[cfg(target_os = "macos")]
            {
                builder = builder.title_bar_style(tauri::TitleBarStyle::Overlay);
            }
            builder.build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

