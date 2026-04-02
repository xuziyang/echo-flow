// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![greet])
        .setup(|app| {
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
