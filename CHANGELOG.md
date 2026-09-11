# Changelog

Semua perubahan dan catatan rilis pada proyek **Beras Visualizer** dicatat dalam dokumen ini.

---

## [v3.1.6] - 2026-09-11

### ✨ Fitur Baru & Pembaruan
- **Sistem Lisensi Ed25519 Cryptographic Signature**:
  - Pengguna tidak lagi diminta atau diwajibkan menyalin Hardware ID (HWID), menghilangkan skeptisme dan kecurigaan pelacakan perangkat.
  - Aktivasi kini menggunakan pasangan identitas terdaftar (**Email / Username**) dan **Serial Key Ed25519**.
  - Modal lisensi diperbarui dengan antarmuka yang lebih ramah, informatif, dan menampilkan lencana status kepemilikan terverifikasi.
- **Generator Lisensi Mandiri (CLI)**:
  - Menyediakan binary generator lokal (`license_generator`) untuk menerbitkan serial key kapan pun untuk giveaway, tester, maupun pembeli.
- **Keamanan & Ketahanan Kunci**:
  - Kunci publik tertanam di dalam aplikasi secara aman.
  - Mekanisme *ghost anchor storage* tetap aktif untuk menjaga status lisensi dari pembersihan cache / uninstaller pihak ketiga.
  - File master key privat otomatis diproteksi dalam `.gitignore`.
- **Single-Device Lock & Real-Time Tracking (Cloudflare Worker)**:
  - Integrasi Cloudflare Worker untuk mengunci lisensi ke 1 perangkat secara otomatis dan senyap tanpa mengganggu user.
  - Live heartbeat untuk melacak user yang sedang aktif serta dashboard admin untuk memantau penggunaan lisensi.

### ⚡ Performa
- Kecepatan render video tetap berada pada performa tinggi **7x-9x** dengan konsumsi VRAM yang stabil dan efisien.

---

## [v3.1.5] - 2026-09-08
- Fix lag saat memilih partikel dan spektrum di Windows.

## [v3.1.4] - 2026-09-07
- Zero-Overhead Render Shutter, fix VRAM leak, dan boost native Windows 7x-9x.

## [v3.1.3] - 2026-09-07
- Fix gradual VRAM leak dan stabilisasi performa render.

## [v3.1.2] - 2026-09-07
- Efisiensi render berkecepatan tinggi (render 45 menit dalam 6 menit).

## [v3.1.1] - 2026-09-06
- Versi benchmark render tercepat dan paling hemat VRAM.
