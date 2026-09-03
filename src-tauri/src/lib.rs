use std::fs::OpenOptions;
use std::io::Write;
use tauri::Manager;
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};

#[tauri::command]
fn save_video_chunk(app: tauri::AppHandle, filename: String, base64_chunk: String, is_first: bool, is_last: bool) -> Result<String, String> {
  let download_dir = app.path().download_dir().map_err(|e| e.to_string())?;
  let file_path = download_dir.join(&filename);

  let mut file = if is_first {
    OpenOptions::new().create(true).write(true).truncate(true).open(&file_path)
  } else {
    OpenOptions::new().create(true).append(true).open(&file_path)
  }.map_err(|e| e.to_string())?;

  let bytes = BASE64.decode(base64_chunk.as_bytes()).map_err(|e| e.to_string())?;
  file.write_all(&bytes).map_err(|e| e.to_string())?;

  if is_last {
    #[cfg(target_os = "macos")]
    {
      let _ = std::process::Command::new("open").arg("-R").arg(&file_path).spawn();
    }

    #[cfg(target_os = "windows")]
    {
      let _ = std::process::Command::new("explorer").arg(format!("/select,\"{}\"", file_path.to_string_lossy())).spawn();
    }
  }

  Ok(file_path.to_string_lossy().to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_log::Builder::default().build())
    .invoke_handler(tauri::generate_handler![save_video_chunk])
    .setup(|_app| {
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
