# 🎵 Music Visualizer Studio (Beras Visualizer)

Aplikasi visualizer musik & generator video desktop modern berbasis **Tauri v2 + Svelte 5** dengan arsitektur rendering **Hardware Acceleration** langsung di perangkat Anda. Mampu mengekspor video musik resolusi tinggi (720p & 1080p FHD 60 FPS) dengan kecepatan hingga **7x - 8x realtime** (~30 detik untuk video 4 menit), ukuran aplikasi ultra-ringan (~3.6 MB), dan pemakaian RAM yang dingin & efisien.

---

## 📥 Download Aplikasi Desktop (Untuk Pengguna Langsung)

Bagi Anda yang hanya ingin menggunakan aplikasi untuk membuat video visualizer musik, **TIDAK PERLU menginstal Node.js, Python, atau tools pemrograman apa pun**. Cukup download installer resmi siap pakai:

👉 **[Download Rilis Terbaru (v1.6.1)](https://github.com/boneyanto/music-visualizer-beras/releases/latest)**

* 🍏 **macOS:** Download file `.dmg` (Apple Silicon M1/M2/M3/M4 & Intel). Buka dan drag ke folder `Applications`.
* 🪟 **Windows:** Download file `.exe` atau `.msi` (Windows 10 / 11). Jalankan installer dan aplikasi siap digunakan.

---

## ✨ Fitur Utama

- ⚡ **Ultra-Fast Hardware Render (7x - 8x Speed):**
  - Rendering video 1080p FHD & 720p 60 FPS menggunakan Web Worker & `OffscreenCanvas`.
  - Durasi render lagu 4 menit: **cuma ~30 - 32 detik**!
  - RAM ultra-lean dengan alokasi buffer efisien dan pembersihan memori otomatis.
  - Streaming penyimpanan video langsung ke disk lokal (`~/Downloads`) tanpa lonjakan swap.

- 📦 **Sistem Proyek Desktop (.beras & .bvp):**
  - **Paket Proyek Lengkap (`.beras`)**: Mengemas file project beserta seluruh aset binary asli (lagu audio, video background, gambar overlay) ke dalam 1 file mandiri. 100% portabel dan anti-hilang.
  - **Preset Styling (`.bvp`)**: Menyimpan styling visualizer saja (ringan < 50 KB) untuk dijadikan template lagu lain.
  - **New Project**: Reset cepat untuk memulai proyek visualizer baru yang bersih.

- 📊 **Dynamic Audio Spectrum Analyzer:**
  - Visualisasi spektrum frekuensi audio real-time dengan Web Audio API.
  - Pilihan gaya visual: *Circular*, *Bars*, *Waveform*, dan *Radial-Bars*.
  - Beat sensitivity, warna kustom, dan gradien dinamis.

- 🎬 **Video Background & Overlay Support:**
  - Dukungan background video loop sinematik dengan sinkronisasi beat audio.
  - Video sticker overlay dengan Chroma Key (green screen removal), blend modes, dan scaling otomatis.

- ✨ **Interactive Particle Engine:**
  - Berbagai preset partikel: `Bokeh Glow`, `Confetti`, `Snow`, `Beat Sparks`, dan `Floating Dust`.
  - Reaktif mengikuti dentuman beat musik (*beat sensitivity & pulse*).

- 🎙️ **Smart AI Lyrics Transcription (Groq Whisper):**
  - Transkripsi lirik otomatis dengan timestamp presisi tinggi via Groq Whisper Cloud API.
  - Pembuatan animasi lirik karaoke sinkron per kata.
  - Dukungan impor/ekspor file subtitle (`.srt`, `.vtt`, `.lrc`).

- 📑 **Playlist & Tracklist Studio:**
  - Gabungkan beberapa lagu MP3/WAV menjadi satu visualizer panjang (mix/album).
  - Generator poster & overlay tracklist otomatis dengan pilihan font kustom.

---

## 🛠️ Tech Stack

- **Desktop Framework:** [Tauri v2](https://tauri.app/) (Rust + Native Webview, ukuran binary hanya ~3.6 MB)
- **Frontend Framework:** [Svelte 5](https://svelte.dev/) (menggunakan Runes: `$state`, `$derived`, `$props`)
- **Language:** [TypeScript](https://www.typescriptlang.org/) & [Rust](https://www.rust-lang.org/)
- **Bundler:** [Vite](https://vitejs.dev/)
- **Styling:** [Tailwind CSS v4](https://tailwindcss.com/)
- **Video/Audio Muxing:** [Mediabunny](https://github.com/Vanilagy/mediabunny) & [@mediabunny/aac-encoder](https://www.npmjs.com/package/@mediabunny/aac-encoder)
- **Project Packaging:** [fflate](https://github.com/101arrowz/fflate) (Zero-CPU zip archiving)
- **Local Storage:** [Dexie.js](https://dexie.org/) (IndexedDB)

---

## 💻 Panduan Pengembang (Developer Guide)

> Bagian ini **hanya untuk programmer/developer** yang ingin memodifikasi source code atau berkontribusi.

### Prasyarat Pengembang
- **Node.js:** v18+ atau v22+
- **Rust:** Versi stable (`rustup default stable`)
- **OS Tools:**
  - macOS: Xcode Command Line Tools (`xcode-select --install`)
  - Windows: Visual Studio C++ Build Tools (C++ Desktop Development)

### Menjalankan Mode Pengembangan (Dev Mode)

1. Clone repositori:
```bash
git clone https://github.com/boneyanto/music-visualizer-beras.git
cd music-visualizer-beras
```

2. Pasang dependensi:
```bash
npm install
```

3. Jalankan aplikasi desktop dalam mode development:
```bash
npm run desktop:dev
```

4. Build aplikasi desktop:
```bash
npm run desktop:build
```
Hasil installer akan tersedia di:
- macOS: `src-tauri/target/release/bundle/dmg/`
- Windows: `src-tauri/target/release/bundle/msi/` dan `bundle/nsis/`

---

## 📄 Lisensi
MIT License. Bebas digunakan untuk keperluan personal maupun komersial.
