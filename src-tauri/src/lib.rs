use std::fs::OpenOptions;
use std::io::Write;
use tauri::Manager;
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};

mod license;

#[tauri::command]
fn save_video_chunk(
  app: tauri::AppHandle, 
  filename: String, 
  base64_chunk: Option<String>, 
  bytes_chunk: Option<Vec<u8>>, 
  is_first: bool, 
  is_last: bool
) -> Result<String, String> {
  let download_dir = app.path().download_dir().map_err(|e| e.to_string())?;
  let file_path = download_dir.join(&filename);

  let mut file = if is_first {
    OpenOptions::new().create(true).write(true).truncate(true).open(&file_path)
  } else {
    OpenOptions::new().create(true).append(true).open(&file_path)
  }.map_err(|e| e.to_string())?;

  let bytes = if let Some(b) = bytes_chunk {
    b
  } else if let Some(b64) = base64_chunk {
    BASE64.decode(b64.as_bytes()).map_err(|e| e.to_string())?
  } else {
    return Err("No video chunk data provided".to_string());
  };

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

#[tauri::command]
fn save_text_file(app: tauri::AppHandle, filename: String, content: String) -> Result<String, String> {
  let download_dir = app.path().download_dir().map_err(|e| e.to_string())?;
  let file_path = download_dir.join(&filename);

  let mut file = OpenOptions::new()
    .create(true)
    .write(true)
    .truncate(true)
    .open(&file_path)
    .map_err(|e| e.to_string())?;

  file.write_all(content.as_bytes()).map_err(|e| e.to_string())?;

  #[cfg(target_os = "macos")]
  {
    let _ = std::process::Command::new("open").arg("-R").arg(&file_path).spawn();
  }

  #[cfg(target_os = "windows")]
  {
    let _ = std::process::Command::new("explorer").arg(format!("/select,\"{}\"", file_path.to_string_lossy())).spawn();
  }

  Ok(file_path.to_string_lossy().to_string())
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
  // First try the cross-platform `open` crate
  if open::that(&url).is_ok() {
    return Ok(());
  }

  // Fallback to direct OS CLI commands
  #[cfg(target_os = "macos")]
  {
    let _ = std::process::Command::new("open").arg(&url).spawn().map_err(|e| e.to_string())?;
  }

  #[cfg(target_os = "windows")]
  {
    let _ = std::process::Command::new("cmd").args(["/c", "start", &url]).spawn().map_err(|e| e.to_string())?;
  }

  #[cfg(target_os = "linux")]
  {
    let _ = std::process::Command::new("xdg-open").arg(&url).spawn().map_err(|e| e.to_string())?;
  }

  Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  #[cfg(target_os = "windows")]
  {
    // Force enable full GPU rasterization, D3D11 backend, hardware video encode/decode, and bypass driver blocklist on Windows WebView2
    std::env::set_var(
      "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
      "--ignore-gpu-blocklist --enable-gpu-rasterization --enable-accelerated-video-encode --enable-accelerated-video-decode --use-angle=d3d11 --force_high_performance_gpu --enable-zero-copy"
    );
  }

  #[cfg(not(debug_assertions))]
  license::apply_anti_debugging();

  tauri::Builder::default()
    .plugin(tauri_plugin_log::Builder::default().build())
    .plugin(tauri_plugin_opener::init())
    .invoke_handler(tauri::generate_handler![
      save_video_chunk,
      save_text_file,
      open_external_url,
      license::get_license_info,
      license::activate_license
    ])
    .setup(|_app| {
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

