# 🌾 Panduan Cara Membuat Lisensi (Beras Visualizer)

Dokumen ini berisi panduan cepat cara men-generate **Serial Key PRO** untuk pembeli, giveaway, atau tester tanpa perlu meminta kode HWID dari pengguna.

---

## 🚀 Perintah Cepat (Jalankan di Terminal Proyek)

Gunakan perintah di bawah ini dari folder utama proyek:

### 1. Untuk Pembeli (Berdasarkan Email):
```bash
cargo run --manifest-path tools/license_generator/Cargo.toml -- "budi@gmail.com"
```

### 2. Untuk Pemenang Giveaway / Tester (Berdasarkan Username):
```bash
cargo run --manifest-path tools/license_generator/Cargo.toml -- "@juara_giveaway"
```

---

## 📋 Contoh Output di Terminal:
```text
=================================================
 Lisensi Beras Visualizer Berhasil Dibuat
=================================================
 Pemilik / Identitas : budi@gmail.com
 Serial Key          : PRO-tv1tuVwHw/MkoBaI/qDD200+GAPeCgWF9uo5+kWWa0jL8Ts2cWLlXKVc2IBKHmeTxN2/3vdAAsIphGznorICCg==
=================================================
Kirimkan pasangan (Email/Username) dan (Serial Key) ke user.
```

---

## ✉️ Format Pesan yang Dikirimkan ke Pembeli / Pemenang:

Salin dan kirimkan format pesan berikut ke Telegram / WhatsApp pembeli:

> Halo! Terima kasih telah membeli / memenangkan lisensi **Beras Visualizer PRO**.
>
> Berikut adalah data lisensi resmi Anda:
> - **Email / Username Terdaftar:** `budi@gmail.com`
> - **Serial Key:** `PRO-tv1tuVwHw/MkoBaI/qDD200+GAPeCgWF9uo5+kWWa0jL8Ts2cWLlXKVc2IBKHmeTxN2/3vdAAsIphGznorICCg==`
>
> **Cara Aktivasi di Aplikasi:**
> 1. Buka aplikasi Beras Visualizer.
> 2. Klik tombol **Free Edition / Lisensi** di pojok kanan atas.
> 3. Masukkan Email/Username dan Serial Key di atas, lalu klik **"Aktivasi Sekarang"**.
> 4. Watermark akan otomatis hilang selamanya (PRO Lifetime).

---

## 🔒 Keamanan & Ketentuan Master Key:
- Kunci privat rahasia Anda disimpan secara lokal di file `.beras_master_key.json`.
- File ini **sudah otomatis diabaikan oleh `.gitignore`**, sehingga **TIDAK AKAN BOCOR** ke publik atau GitHub saat Anda melakukan `git push`.
- Jangan hapus file `.beras_master_key.json`. Jika ingin membuat cadangan, simpan salinan file tersebut di tempat aman (Flashdisk / Google Drive pribadi Anda).

---

## 🌐 Cara Melihat Siapa Saja yang Sedang Aktif (Dashboard Admin):
Buka link ini di browser Anda:
```text
https://beras-license-server.beras-license-server.workers.dev/api/admin/users?secret=fc3c9e8687b247d8a29f8c08f0d4df0c
```
- Anda bisa melihat siapa saja yang sedang online (indikator hijau).
- Terdapat tombol **"Reset Device"** jika suatu saat pembeli meminta izin memindahkan lisensi ke laptop baru.
