# 🎵 Music Visualizer Studio

Aplikasi visualizer musik & generator video berbasis web modern dengan arsitektur rendering **WebCodecs hardware acceleration** langsung di browser. Mampu mengekspor video musik resolusi tinggi (720p & 1080p 60 FPS) dengan kecepatan hingga **4x - 6x realtime** tanpa membebani server dan 100% aman dari masalah Out-Of-Memory (OOM).

---

## ✨ Fitur Utama

- 🚀 **Ultra-Fast WebCodecs Hardware Export:**
  - Rendering video 1080p & 720p 60 FPS langsung di browser client menggunakan Web Worker & `OffscreenCanvas`.
  - Backpressure reaktif berbasis event `ondequeue` untuk saturasi GPU maksimal tanpa *stalling*.
  - Pemrosesan video MP4 & AAC audio muxing didukung oleh **Mediabunny**.
  - Waktu render lagu 4 menit: **~57 detik (720p)** dan **~99 detik (1080p)**.

- 📊 **Dynamic Audio Spectrum Analyzer:**
  - Visualisasi spektrum frekuensi audio real-time dengan Web Audio API.
  - Pilihan gaya visual: *Circular*, *Bars*, *Waveform*, dan *Radial-Bars*.
  - Warna kustom, gradien dinamis, dan beat sensitivity.

- ✨ **Interactive Particle Engine:**
  - Berbagai preset partikel: `Bokeh Glow`, `Confetti`, `Snow`, `Beat Sparks`, dan `Floating Dust`.
  - Reaktif mengikuti dentuman beat musik (*beat sensitivity & pulse*).
  - Dioptimasi tanpa `shadowBlur` berat untuk menjaga FPS render tetap stabil.

- 🎙️ **Smart AI Lyrics Transcription (Groq Whisper):**
  - Transkripsi lirik otomatis dengan timestamp presisi tinggi via Groq Whisper Cloud API.
  - Pembuatan animasi lirik karaoke sinkron per kata.
  - Dukungan impor/ekspor file subtitle (.srt / .vtt / .lrc).

- 🎨 **Multi-Layer Overlay Studio:**
  - Tambahkan teks, watermark gambar, playlist tracklist, dan logo.
  - Animasi teks: *pulse-beat*, *floating*, *shimmer*, *glow-pulse*, dan *typewriter*.
  - Slideshow gambar background dengan efek *crossfade transition* otomatis.

- 💾 **Local Offline Storage:**
  - Manajemen proyek visualizer tersimpan lokal di browser via **Dexie (IndexedDB)**.

---

## 🛠️ Tech Stack

- **Framework:** [Svelte 5](https://svelte.dev/) (menggunakan Runes: `$state`, `$derived`, `$props`)
- **Language:** [TypeScript](https://www.typescriptlang.org/)
- **Bundler / Dev Server:** [Vite](https://vitejs.dev/)
- **Styling:** [Tailwind CSS v4](https://tailwindcss.com/)
- **Video & Audio Encoding:** [WebCodecs API](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API) & [Mediabunny](https://github.com/Vanilagy/mediabunny)
- **Icons:** [Lucide Svelte](https://lucide.dev/)
- **Database:** [Dexie.js](https://dexie.org/)

---

## 🚀 Memulai (Getting Started)

### Prasyarat
- Node.js 18+ atau 20+
- Browser modern yang mendukung WebCodecs (Google Chrome, Microsoft Edge, Brave, atau browser berbasis Chromium lainnya)

### Instalasi

1. Clone repositori:
```bash
git clone https://github.com/boneyanto/music-visualizer-beras.git
cd music-visualizer-beras
```

2. Pasang dependensi:
```bash
npm install
```

3. Jalankan server pengembangan (Dev Mode):
```bash
npm run dev
```
Buka browser dan akses alamat `http://localhost:5173`.

4. Build untuk produksi:
```bash
npm run build
```

---

## ⚙️ Arsitektur Render & Optimasi

Visualizer ini menggunakan arsitektur rendering video modern:
1. **Separation of Concerns:** Seluruh proses decoding, canvas drawing, video encoding, dan audio multiplexing berjalan di dalam **Web Worker** mandiri (`render.worker.ts`), sehingga UI utama tetap mulus dan responsif.
2. **Backpressure Terpadu:** Loop frame kanvas dikontrol secara presisi dengan event `videoEncoder.ondequeue` untuk mencegah frame mentah menumpuk di memori (menjaga konsumsi RAM stabil di kisaran 50–100 MB).
3. **Hardware Acceleration:** Menggunakan encoder AVC/H.264 level hardware bawaan GPU perangkat (`prefer-hardware`) dengan mode `quality` untuk memaksimalkan throughput kompresi.

---

## 📄 Lisensi

Proyek ini dilisensikan di bawah [MIT License](LICENSE).
