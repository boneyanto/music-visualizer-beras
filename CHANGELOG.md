# Changelog

Semua perubahan dan catatan rilis pada proyek **Beras Visualizer** dicatat dalam dokumen ini.

---

## [v3.1.6] - 2026-09-11

### 🚀 Optimasi Performa Editor Windows (Realtime Playback & Particles)
- **Eliminasi Lag Parah saat Editing & Playback**:
  - Memisahkan audio hardware clock berpresisi tinggi (`audioEngine.getCurrentTime()`) dari Svelte reactivity cycle di `PreviewCanvas.svelte`.
  - Membatasi (*throttling*) pembaruan reactive state `projectStore.currentTime` untuk DOM UI (timer counter & timeline playhead) ke ~15 FPS (66ms). Ini memangkas 75% beban re-render DOM berlebih di Windows WebView2/Chromium.
- **Canvas Draw-Call Batching untuk Partikel**:
  - Mengimplementasikan batching single-path pada preset partikel (`renderFloatingDust`, `renderSnow`, `renderSparkles`, `renderBurst`, `renderSparks`), memangkas ratusan draw calls per frame menjadi 1 call per layer partikel pada driver GPU ANGLE/Direct3D.
  - Memperbaiki redundant re-initialization effect pada multi-spectrum panel.
- **Integritas Export Render**:
  - Pipeline export hardware-accelerated WebCodecs tidak disentuh, menjamin kecepatan ekspor tetap stabil di **7x-9x**.

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
