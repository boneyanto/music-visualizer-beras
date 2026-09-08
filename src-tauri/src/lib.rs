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

#[cfg(target_os = "windows")]
fn find_chrome_executable() -> Option<std::path::PathBuf> {
  let candidates = [
    // Standard 64-bit Chrome
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    // 32-bit Chrome on 64-bit Windows
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
  ];

  for path_str in candidates {
    let p = std::path::PathBuf::from(path_str);
    if p.exists() {
      return Some(p);
    }
  }

  // Check Local AppData (per-user Chrome installation)
  if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
    let per_user = std::path::PathBuf::from(local_app_data).join(r"Google\Chrome\Application\chrome.exe");
    if per_user.exists() {
      return Some(per_user);
    }
  }

  None
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
    .setup(|#[allow(unused_variables)] app| {
      #[cfg(target_os = "windows")]
      {
        if let Some(chrome_path) = find_chrome_executable() {
          if let Some(main_window) = app.get_webview_window("main") {
            if let Ok(url) = main_window.url() {
              let url_str = url.to_string();
              let app_handle = app.handle().clone();

              // Hide the restricted WebView2 window immediately
              let _ = main_window.hide();

              // Setup dedicated profile directory in %LOCALAPPDATA%\BerasVisualizer\ChromeProfile
              let profile_dir = std::env::var("LOCALAPPDATA")
                .map(|p| format!(r"{}\BerasVisualizer\ChromeProfile", p))
                .unwrap_or_else(|_| r"C:\Temp\BerasVisualizerProfile".to_string());

              // Launch Google Chrome in dedicated native app mode (--app)
              std::thread::spawn(move || {
                let status = std::process::Command::new(chrome_path)
                  .args([
                    &format!("--app={}", url_str),
                    &format!("--user-data-dir={}", profile_dir),
                    "--window-size=1400,880",
                    "--ignore-gpu-blocklist",
                    "--enable-gpu-rasterization",
                    "--enable-zero-copy",
                  ])
                  .status();

                // When user closes the Chrome app window, terminate Tauri process cleanly
                match status {
                  Ok(_) => {
                    app_handle.exit(0);
                  }
                  Err(_) => {
                    // If Chrome failed to launch, restore the WebView2 window as fallback
                    if let Some(w) = app_handle.get_webview_window("main") {
                      let _ = w.show();
                      let _ = w.set_focus();
                    }
                  }
                }
              });
            }
          }
        }
      }

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

