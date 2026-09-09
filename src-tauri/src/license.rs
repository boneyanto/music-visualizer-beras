use std::fs;
use std::path::PathBuf;
use std::process::Command;
use hmac::{Hmac, Mac};
use sha2::{Sha256, Digest};
use tauri::{AppHandle, Manager};

type HmacSha256 = Hmac<Sha256>;

// Obfuscated compile-time secret key seed
// XOR-masked so static string analysis (e.g. `strings binary`) cannot reveal it directly
const MASKED_SECRET: [u8; 32] = [
    0xde ^ 0x5a, 0xad ^ 0xa5, 0xbe ^ 0x3c, 0xef ^ 0x7e,
    0x42 ^ 0x11, 0x99 ^ 0x22, 0x88 ^ 0x33, 0x77 ^ 0x44,
    0x66 ^ 0x55, 0x55 ^ 0x66, 0x44 ^ 0x77, 0x33 ^ 0x88,
    0x22 ^ 0x99, 0x11 ^ 0xaa, 0x00 ^ 0xbb, 0xff ^ 0xcc,
    0x13 ^ 0xd1, 0x37 ^ 0xe2, 0x79 ^ 0xf3, 0xac ^ 0x04,
    0xbd ^ 0x15, 0xce ^ 0x26, 0xdf ^ 0x37, 0xea ^ 0x48,
    0xfb ^ 0x59, 0x0c ^ 0x6a, 0x1d ^ 0x7b, 0x2e ^ 0x8c,
    0x3f ^ 0x9d, 0x40 ^ 0xae, 0x51 ^ 0xbf, 0x62 ^ 0xc0,
];

const XOR_KEY: [u8; 32] = [
    0x5a, 0xa5, 0x3c, 0x7e, 0x11, 0x22, 0x33, 0x44,
    0x55, 0x66, 0x77, 0x88, 0x99, 0xaa, 0xbb, 0xcc,
    0xd1, 0xe2, 0xf3, 0x04, 0x15, 0x26, 0x37, 0x48,
    0x59, 0x6a, 0x7b, 0x8c, 0x9d, 0xae, 0xbf, 0xc0,
];

fn get_unmasked_secret() -> [u8; 32] {
    let mut secret = [0u8; 32];
    for i in 0..32 {
        secret[i] = MASKED_SECRET[i] ^ XOR_KEY[i];
    }
    secret
}

/// Anti-reverse-engineering: Anti-debugging protection on macOS
#[cfg(target_os = "macos")]
pub fn apply_anti_debugging() {
    // PT_DENY_ATTACH (ptrace request 31) halts debugger attachment
    extern "C" {
        fn ptrace(request: i32, pid: i32, addr: *mut u8, data: i32) -> i32;
    }
    unsafe {
        ptrace(31, 0, std::ptr::null_mut(), 0);
    }
}

#[cfg(not(target_os = "macos"))]
pub fn apply_anti_debugging() {}


/// Retrieve raw unique machine hardware ID
fn get_raw_hwid() -> String {

    #[cfg(target_os = "macos")]
    {
        if let Ok(output) = Command::new("ioreg")
            .args(["-d2", "-c", "IOPlatformExpertDevice"])
            .output()
        {
            let text = String::from_utf8_lossy(&output.stdout);
            for line in text.lines() {
                if line.contains("IOPlatformUUID") {
                    if let Some(uuid) = line.split('=').nth(1) {
                        return uuid.trim().trim_matches('"').to_string();
                    }
                }
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        if let Ok(output) = Command::new("reg")
            .args(["query", r"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Cryptography", "/v", "MachineGuid"])
            .output()
        {
            let text = String::from_utf8_lossy(&output.stdout);
            for line in text.lines() {
                if line.contains("MachineGuid") {
                    let parts: Vec<&str> = line.split_whitespace().collect();
                    if parts.len() >= 3 {
                        return parts[2].to_string();
                    }
                }
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        if let Ok(machine_id) = fs::read_to_string("/etc/machine-id") {
            return machine_id.trim().to_string();
        }
    }

    // Fallback if hardware query is blocked
    "BERAS-GENERIC-DEFAULT-UUID".to_string()
}

/// Generate formatted HWID (e.g. BERAS-A1B2-C3D4-E5F6)
pub fn generate_formatted_hwid() -> String {
    let raw = get_raw_hwid();
    let mut hasher = Sha256::new();
    hasher.update(b"BERAS_VISUALIZER_SALT_2026_");
    hasher.update(raw.as_bytes());
    let hash = hasher.finalize();
    let hex_str = format!("{:02X}{:02X}{:02X}{:02X}{:02X}{:02X}{:02X}{:02X}", 
        hash[0], hash[1], hash[2], hash[3], 
        hash[4], hash[5], hash[6], hash[7]
    );

    format!(
        "BERAS-{}-{}-{}-{}",
        &hex_str[0..4],
        &hex_str[4..8],
        &hex_str[8..12],
        &hex_str[12..16]
    )
}

/// Computes the valid license key for a given HWID
pub fn compute_license_key_for_hwid(hwid: &str) -> String {
    let secret = get_unmasked_secret();
    let mut mac = HmacSha256::new_from_slice(&secret).expect("HMAC can take key of any size");
    mac.update(hwid.as_bytes());
    let result = mac.finalize();
    let bytes = result.into_bytes();

    // Format into a 20-character license key: PRO-XXXX-XXXX-XXXX-XXXX
    let hex_sig = format!(
        "{:02X}{:02X}{:02X}{:02X}{:02X}{:02X}{:02X}{:02X}",
        bytes[0], bytes[1], bytes[2], bytes[3],
        bytes[4], bytes[5], bytes[6], bytes[7]
    );

    format!(
        "PRO-{}-{}-{}-{}",
        &hex_sig[0..4],
        &hex_sig[4..8],
        &hex_sig[8..12],
        &hex_sig[12..16]
    )
}

/// Verify if a license key is valid for this machine
pub fn verify_license_key(key: &str) -> bool {
    let clean_key = key.trim().to_uppercase();
    if !clean_key.starts_with("PRO-") {
        return false;
    }

    let hwid = generate_formatted_hwid();
    let expected = compute_license_key_for_hwid(&hwid);
    clean_key == expected
}

fn get_primary_license_file_path(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_data_dir().ok().map(|p| p.join(".beras_license.dat"))
}

/// Computes deterministic ghost anchor file paths based on HWID hash.
/// These paths lie in neutral user system directories outside the app's bundle/app-data folder,
/// ensuring that clean uninstallation tools (e.g. AppCleaner / Trash) cannot purge them.
fn get_ghost_anchor_paths(hwid: &str) -> Vec<PathBuf> {
    let mut paths = Vec::new();

    // Derive deterministic obfuscated filename from HWID hash
    let mut hasher = Sha256::new();
    hasher.update(b"GHOST_ANCHOR_SALT_V1_");
    hasher.update(hwid.as_bytes());
    let h = hasher.finalize();
    let file_tag = format!(".sys_hw_{:02x}{:02x}.cfg", h[0], h[1]);

    // Anchor 1: ~/.config or ~/.cache
    if let Some(home) = std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")) {
        let home_path = PathBuf::from(home);
        
        #[cfg(target_os = "macos")]
        {
            // macOS neutral locations: ~/Library/Preferences or ~/.config
            paths.push(home_path.join(".config").join(&file_tag));
            paths.push(home_path.join("Library").join("Preferences").join(&file_tag));
        }

        #[cfg(target_os = "windows")]
        {
            // Windows neutral location: %APPDATA%\Microsoft or %LOCALAPPDATA%
            if let Some(local_app_data) = std::env::var_os("LOCALAPPDATA") {
                paths.push(PathBuf::from(local_app_data).join("Microsoft").join(&file_tag));
            }
            paths.push(home_path.join(".config").join(&file_tag));
        }

        #[cfg(target_os = "linux")]
        {
            paths.push(home_path.join(".config").join(&file_tag));
            paths.push(home_path.join(".local").join("share").join(&file_tag));
        }
    }

    paths
}

#[derive(serde::Serialize, serde::Deserialize, Default, Clone, Debug)]
struct StoredLicensePayload {
    license_key: Option<String>,
    #[serde(default = "default_quota")]
    free_quota: u32,
    #[serde(default)]
    quota_initialized: bool,
}

fn default_quota() -> u32 {
    3
}

fn parse_masked_payload(bytes: &[u8]) -> Option<StoredLicensePayload> {
    let unmasked: Vec<u8> = bytes.iter().map(|b| b ^ 0x3b).collect();
    if let Ok(json_str) = String::from_utf8(unmasked) {
        if let Ok(payload) = serde_json::from_str::<StoredLicensePayload>(&json_str) {
            return Some(payload);
        }
        let trimmed = json_str.trim().to_string();
        if trimmed.starts_with("PRO-") {
            return Some(StoredLicensePayload {
                license_key: Some(trimmed),
                free_quota: 3,
                quota_initialized: true,
            });
        }
    }
    None
}

fn load_stored_payload(app: &AppHandle, hwid: &str) -> StoredLicensePayload {
    // 1. Gather all candidate files: primary location + all ghost anchors
    let mut candidate_payloads: Vec<StoredLicensePayload> = Vec::new();

    if let Some(primary_path) = get_primary_license_file_path(app) {
        if primary_path.exists() {
            if let Ok(bytes) = fs::read(&primary_path) {
                if let Some(p) = parse_masked_payload(&bytes) {
                    candidate_payloads.push(p);
                }
            }
        }
    }

    for ghost_path in get_ghost_anchor_paths(hwid) {
        if ghost_path.exists() {
            if let Ok(bytes) = fs::read(&ghost_path) {
                if let Some(p) = parse_masked_payload(&bytes) {
                    candidate_payloads.push(p);
                }
            }
        }
    }

    // 2. If candidates exist, select the most authoritative state:
    // - If any contains a valid license_key, preserve it.
    // - If any has already consumed quota (free_quota < 3 or quota_initialized == true),
    //   take the MINIMUM free_quota so an uninstaller cannot reset a decremented quota back to 3!
    if !candidate_payloads.is_empty() {
        let mut best_key: Option<String> = None;
        let mut min_quota: u32 = 3;
        let mut was_initialized = false;

        for p in &candidate_payloads {
            if p.license_key.is_some() && best_key.is_none() {
                best_key = p.license_key.clone();
            }
            if p.quota_initialized || p.free_quota < 3 {
                was_initialized = true;
                if p.free_quota < min_quota {
                    min_quota = p.free_quota;
                }
            }
        }

        let reconciled = StoredLicensePayload {
            license_key: best_key,
            free_quota: if was_initialized { min_quota } else { 3 },
            quota_initialized: true,
        };

        // Self-heal: ensure all anchors and primary path are in sync with reconciled state
        let _ = save_stored_payload(app, hwid, &reconciled);
        return reconciled;
    }

    // Fresh installation on this hardware
    let initial = StoredLicensePayload {
        license_key: None,
        free_quota: 3,
        quota_initialized: true,
    };
    let _ = save_stored_payload(app, hwid, &initial);
    initial
}

fn save_stored_payload(app: &AppHandle, hwid: &str, payload: &StoredLicensePayload) -> Result<(), String> {
    let json_str = serde_json::to_string(payload).map_err(|e| e.to_string())?;
    let masked: Vec<u8> = json_str.as_bytes().iter().map(|b| b ^ 0x3b).collect();

    // 1. Write to primary app data directory
    if let Some(primary_path) = get_primary_license_file_path(app) {
        if let Some(parent) = primary_path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let _ = fs::write(&primary_path, &masked);
    }

    // 2. Mirror across all ghost anchor paths across the OS
    for ghost_path in get_ghost_anchor_paths(hwid) {
        if let Some(parent) = ghost_path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let _ = fs::write(&ghost_path, &masked);
    }

    Ok(())
}

#[derive(serde::Serialize, Clone)]
pub struct LicenseInfo {
    pub hwid: String,
    pub is_licensed: bool,
    pub license_key: Option<String>,
    pub free_quota_remaining: u32,
}

#[tauri::command]
pub fn get_license_info(app: AppHandle) -> LicenseInfo {
    let hwid = generate_formatted_hwid();
    let payload = load_stored_payload(&app, &hwid);
    let is_licensed = match &payload.license_key {
        Some(k) => verify_license_key(k),
        None => false,
    };

    LicenseInfo {
        hwid,
        is_licensed,
        license_key: if is_licensed { payload.license_key } else { None },
        free_quota_remaining: payload.free_quota,
    }
}

#[tauri::command]
pub fn consume_free_export_quota(app: AppHandle) -> Result<LicenseInfo, String> {
    let hwid = generate_formatted_hwid();
    let mut payload = load_stored_payload(&app, &hwid);
    if payload.free_quota > 0 {
        payload.free_quota -= 1;
        save_stored_payload(&app, &hwid, &payload)?;
    }
    Ok(get_license_info(app))
}

#[tauri::command]
pub fn activate_license(app: AppHandle, key: String) -> Result<LicenseInfo, String> {
    let clean_key = key.trim().to_uppercase();
    if verify_license_key(&clean_key) {
        let hwid = generate_formatted_hwid();
        let mut payload = load_stored_payload(&app, &hwid);
        payload.license_key = Some(clean_key);
        save_stored_payload(&app, &hwid, &payload)?;
        Ok(get_license_info(app))
    } else {
        Err("Serial Key tidak valid untuk HWID perangkat ini!".to_string())
    }
}

