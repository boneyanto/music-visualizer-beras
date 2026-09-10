use std::env;
use std::fs;
use ed25519_dalek::{SigningKey, Signer, VerifyingKey};
use rand_core::OsRng;
use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;

const KEYPAIR_FILE: &str = ".beras_master_key.json";

#[derive(serde::Serialize, serde::Deserialize)]
struct KeypairStore {
    private_key_base64: String,
    public_key_base64: String,
    public_key_rust_bytes: Vec<u8>,
}

fn load_or_create_keypair() -> SigningKey {
    if let Ok(content) = fs::read_to_string(KEYPAIR_FILE) {
        if let Ok(store) = serde_json::from_str::<KeypairStore>(&content) {
            if let Ok(bytes) = BASE64.decode(&store.private_key_base64) {
                if bytes.len() == 32 {
                    let mut key_bytes = [0u8; 32];
                    key_bytes.copy_from_slice(&bytes);
                    return SigningKey::from_bytes(&key_bytes);
                }
            }
        }
    }

    // Generate new keypair
    println!("Master keypair belum ada. Membuat keypair Ed25519 baru...");
    let mut csprng = OsRng;
    let signing_key = SigningKey::generate(&mut csprng);
    let verifying_key: VerifyingKey = signing_key.verifying_key();

    let priv_b64 = BASE64.encode(signing_key.to_bytes());
    let pub_b64 = BASE64.encode(verifying_key.to_bytes());
    let pub_bytes = verifying_key.to_bytes().to_vec();

    let store = KeypairStore {
        private_key_base64: priv_b64.clone(),
        public_key_base64: pub_b64.clone(),
        public_key_rust_bytes: pub_bytes.clone(),
    };

    let json = serde_json::to_string_pretty(&store).unwrap();
    fs::write(KEYPAIR_FILE, json).expect("Gagal menyimpan master keypair");
    println!("Keypair baru tersimpan di {}", KEYPAIR_FILE);
    println!("PUBLIC KEY BYTES FOR RUST APP: {:?}", pub_bytes);
    println!("PUBLIC KEY BASE64: {}", pub_b64);
    signing_key
}

fn sign_license(signing_key: &SigningKey, identity: &str) -> String {
    let clean_id = identity.trim().to_lowercase();
    let message = format!("BERAS_PRO_LICENSE:{}", clean_id);
    let signature = signing_key.sign(message.as_bytes());
    let sig_bytes = signature.to_bytes();
    
    let b64_sig = BASE64.encode(sig_bytes);
    format!("PRO-{}", b64_sig)
}

fn main() {
    let args: Vec<String> = env::args().collect();
    let signing_key = load_or_create_keypair();
    let verifying_key = signing_key.verifying_key();

    if args.len() < 2 {
        println!("=== Beras Visualizer - License Generator (Ed25519) ===");
        println!("Public Key Base64: {}", BASE64.encode(verifying_key.to_bytes()));
        println!("Public Key Rust Array: {:?}", verifying_key.to_bytes());
        println!();
        println!("Usage: cargo run --bin license_generator -- <email_atau_username>");
        println!("Contoh:");
        println!("  cargo run --bin license_generator -- \"budi@gmail.com\"");
        println!("  cargo run --bin license_generator -- \"@juara_giveaway\"");
        return;
    }

    let identity = &args[1];
    let key = sign_license(&signing_key, identity);

    println!("=================================================");
    println!(" Lisensi Beras Visualizer Berhasil Dibuat");
    println!("=================================================");
    println!(" Pemilik / Identitas : {}", identity.trim());
    println!(" Serial Key          : {}", key);
    println!("=================================================");
    println!("Kirimkan pasangan (Email/Username) dan (Serial Key) ke user.");
}
