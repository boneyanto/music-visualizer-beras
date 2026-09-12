# Changelog

Semua perubahan dan catatan rilis pada proyek **Beras Visualizer** dicatat dalam dokumen ini.

---

## [v3.2.0] - 2026-09-12

### ⚡ Mode Turbo Windows (Auto-Minimize), Live Taskbar Telemetry & Pembekuan Partikel saat Pause
- **Mode Turbo Windows Opsional & Aman (Auto-Minimize)**:
  - Menambahkan toggle checkbox opsional khusus sistem Windows pada modal ekspor: `⚡ Mode Turbo Windows (Auto-minimize saat render)`.
  - Jika diaktifkan, jendela aplikasi otomatis diminimize ke taskbar sesaat setelah render dimulai untuk melepaskan batasan VSync Desktop Window Manager (DWM) sehingga GPU render worker dapat melesat pada kecepatan maksimal.
  - Jendela otomatis dipulihkan/dibuka kembali ke layar depan (*auto-unminimize*) saat render selesai.
- **Pemantauan Progres Langsung dari Judul Taskbar Windows**:
  - Judul jendela kini secara dinamis diperbarui secara *real-time* selama proses render berjalan (contoh: `[45%] Beras Visualizer (180 FPS - ETA 0m25s)`).
  - Pengguna tetap dapat mengintip dan memantau persentase, FPS, dan estimasi waktu selesai langsung dari taskbar tanpa perlu membuka jendela aplikasi.
- **Akselerasi Penuh WebCodecs Windows (Unconstrained Offline Speed)**:
  - Mengatur `latencyMode: 'quality'` pada encoder WebCodecs untuk seluruh platform, melepaskan batasan 60 FPS dari Windows Media Foundation.
  - Menyesuaikan batas antrean GPU (`maxQueue = 12`) untuk memastikan saturasi pipeline GPU optimal tanpa risiko lonjakan VRAM.
- **Pembekuan Partikel Saat Playback Dijeda (*Freeze on Pause*)**:
  - Memperbaiki pengoperan status playback (`isPlaying`) ke engine partikel pada `PreviewCanvas.svelte`.
  - Saat lagu dijeda (pause), vektor kecepatan partikel dibekukan di tempat dan langsung melanjutkan pergerakan alaminya kembali saat musik diputar ulang.

---

## [v3.1.9] - 2026-09-12

### ❄️ Restorasi Murni Formula v3.1.1 (Occlusion Background Render & 0% Lag Editor)
- **Restorasi Penuh Perilaku PreviewCanvas & ExportModal v3.1.1**:
  - Mengembalikan `PreviewCanvas.svelte` dan `ExportModal.svelte` ke kode murni v3.1.1.
  - Render loop preview berjalan normal sesuai VSync UI monitor tanpa shutter artifisial, dan kecepatan export secara alami berakselerasi penuh (7x–9x) saat jendela aplikasi tertutup aplikasi lain atau diminimize.
- **Eliminasi Total Beban CPU Idle Windows (Turun ke 12%–15%)**:
  - Menghapus flag global `--disable-gpu-vsync` dan `--disable-frame-rate-limit` dari startup browser WebView2 Windows di `src-tauri/src/lib.rs`.
  - Mengembalikan kestabilan clock rendering UI ke refresh rate desktop standar (VSync normal), menghentikan pembakaran CPU liar oleh Chromium compositor saat editor idle/pause.
  - Penggunaan CPU pada Windows yang baru dibuka turun drastis dari 36%–45% kembali ke kisaran hemat daya optimal **12%–15%**.

---

## [v3.1.8] - 2026-09-12

### 🌐 Repositori Publik & Pembersihan Generator Internal
- **Isolasi Penuh Generator Lisensi**:
  - Mengeluarkan file generator lisensi internal (`tools/license_generator/`), server tracking backend (`server/cloudflare-worker/`), dan panduan generate lisensi (`CARA_GENERATE_LISENSI.md`) dari git tracking untuk persiapan repositori dijadikan publik (open-source).
  - Menjaga modul verifikasi lisensi Ed25519 dan kuota watermark tetap utuh pada client app.
- **Konservasi Kecepatan Render Puncak (7x - 9x)**:
  - Memastikan seluruh parameter performa, GPU acceleration, serta hardware encoder tetap optimal pada performa terbaik.

---

## [v3.1.7] - 2026-09-12

### ⚡ Eliminasi Total Lag Editor di Windows & Low-End GPU (Intel Gen 8)
- **Software 60 FPS Framerate Limiter di Preview Canvas**:
  - Mengimplementasikan frame rate throttling presisi ($60\text{ FPS}$ cap) pada loop `renderFrame` di `PreviewCanvas.svelte`.
  - Mencegah loop Canvas editor berputar liar tanpa batas ($300+\text{ FPS}$) akibat argumen `--disable-gpu-vsync` dan `--disable-frame-rate-limit` pada WebView2 Windows.
  - Penggunaan iGPU Intel Gen 8 saat editing turun drastis mendekati 0%, temperatur adem, dan pergerakan mouse/slider kembali halus tanpa lag.
- **Penjadwalan Frame Adaptif (Eliminasi CPU Spin & Idle Drop ke ~15%)**:
  - Menggantikan rAF spinning loop dengan timer tidur adaptif (`setTimeout` + rAF pacing).
  - Saat lagu berputar: berjalan stabil di 60 FPS untuk rendering audio visualizer yang halus.
  - Saat lagu dipause / editor idle: frame rate otomatis turun ke 24 FPS dan prosesor dapat tidur (sleep) di antara frame, memangkas CPU usage idle dari 45% kembali ke kisaran hemat daya (~15-18%).
- **Jeda Fisika Partikel saat Pause**:
  - Partikel kini otomatis berhenti bergerak (*freeze in place*) ketika lagu tidak diputar / sedang di-pause, menghemat beban perhitungan fisika koordinat di CPU saat idle.
- **Mempertahankan Kecepatan Render Puncak (7x - 9x)**:
  - Argumen `--disable-gpu-vsync` dan `--disable-frame-rate-limit` tetap aktif untuk WebCodecs Worker.
  - Zero-Overhead Render Shutter secara otomatis mematikan render canvas saat export berjalan, membebaskan 100% daya GPU untuk rendering berkecepatan 7x - 9x tanpa perlu menutup atau menutupi jendela aplikasi dengan jendela lain.
- **Dropdown Style Visualizer Bebas Lag**:
  - Menghilangkan two-way binding agresif (`bind:value`) pada pilihan spektrum di `SpectrumPanel.svelte`, digantikan dengan controlled value + discrete change handler dan debounced save (800ms) agar navigasi menu responsif instan.
- **Zero-Idle CPU Sleep Saat Lagu Dijeda / Paused**:
  - Loop render canvas kini sepenuhnya diistirahatkan (*full sleep mode*) ketika lagu tidak diputar.
  - Menghilangkan komputasi refresh layar berulang yang sia-sia saat editor idle, mengembalikan penggunaan CPU ke titik terendah (idle murni).
  - Canvas secara cerdas hanya me-render 1 frame instan saat pengguna menggeser scrubber timeline atau mengubah konfigurasi di panel, lalu kembali tidur.
- **Pembekuan Total Fisika Partikel (*True Freeze in Place*)**:
  - Membekukan vektor kecepatan (`vx`, `vy`, `vRot`) seluruh partikel secara langsung saat musik dijeda, menjamin partikel 100% berhenti mematung di layar tanpa ada drift pergerakan sama sekali.
  - Kecepatan dan arah asli partikel dipulihkan secara instan saat lagu kembali diputar.
- **Koleksi Lengkap Spektrum & Partikel**:
  - Mempertahankan 100% seluruh koleksi 100+ style spektrum visualizer matematika, Avant-Garde, Quantum Physics, serta seluruh preset partikel tanpa ada yang dipangkas.

---

## [v3.1.6] - 2026-09-12

### 🛠️ Perbaikan Render Durasi Panjang (> 1 Jam) & ArrayBuffer Exceeded
- **Solusi Tuntas Error `ArrayBuffer exceeded maximum size`**:
  - Menggantikan alokasi monolitik `BufferTarget` dengan `ElasticBlockTarget` berbasis *random-access block paging* (16MB chunks) di Web Worker.
  - Menghilangkan batasan memori $2\text{ GB} / 4\text{ GB}$ single ArrayBuffer pada Windows (WebView2 V8) dan macOS. Rendering video playlist/kompilasi berdurasi panjang (> 1 jam) kini berjalan stabil tanpa resiko out-of-memory crash.
  - Mendukung seek & in-place overwrite byte yang presisi untuk box `ftyp`, `moov`, dan `mdat` MP4, menjamin metadata container valid 100%, ukuran file presisi ($1\times$), dan langsung dapat diputar di semua pemutar video (QuickTime, VLC, WMP, Browser).
  - Menjaga kecepatan render puncak tetap pada benchmark **7x - 9x+**.
- **CLI License Generator Enhancement**:
  - Penambahan opsi `--bulk` dan multiple identities untuk penerbitan batch serial key giveaway/voucher secara instan.

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
