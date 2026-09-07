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

fn get_license_file_path(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_data_dir().ok().map(|p| p.join(".beras_license.dat"))
}

pub fn save_license(app: &AppHandle, key: &str) -> Result<(), String> {
    let path = get_license_file_path(app).ok_or("Cannot resolve app data directory")?;
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    // Simple XOR masking for persisted license key
    let bytes = key.trim().as_bytes();
    let masked: Vec<u8> = bytes.iter().map(|b| b ^ 0x3b).collect();
    fs::write(path, masked).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn load_saved_license(app: &AppHandle) -> Option<String> {
    let path = get_license_file_path(app)?;
    if !path.exists() {
        return None;
    }
    if let Ok(bytes) = fs::read(path) {
        let unmasked: Vec<u8> = bytes.iter().map(|b| b ^ 0x3b).collect();
        if let Ok(str_key) = String::from_utf8(unmasked) {
            return Some(str_key.trim().to_string());
        }
    }
    None
}

#[derive(serde::Serialize)]
pub struct LicenseInfo {
    pub hwid: String,
    pub is_licensed: bool,
    pub license_key: Option<String>,
}

#[tauri::command]
pub fn get_license_info(app: AppHandle) -> LicenseInfo {
    let hwid = generate_formatted_hwid();
    let saved = load_saved_license(&app);
    let is_licensed = match &saved {
        Some(k) => verify_license_key(k),
        None => false,
    };

    LicenseInfo {
        hwid,
        is_licensed,
        license_key: if is_licensed { saved } else { None },
    }
}

#[tauri::command]
pub fn activate_license(app: AppHandle, key: String) -> Result<LicenseInfo, String> {
    let clean_key = key.trim().to_uppercase();
    if verify_license_key(&clean_key) {
        save_license(&app, &clean_key)?;
        let hwid = generate_formatted_hwid();
        Ok(LicenseInfo {
            hwid,
            is_licensed: true,
            license_key: Some(clean_key),
        })
    } else {
        Err("Serial Key tidak valid untuk HWID perangkat ini!".to_string())
    }
}
