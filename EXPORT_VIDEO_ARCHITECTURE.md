# Arsitektur & Logika Export Video Visualizer Studio

Dokumen ini mendokumentasikan secara rinci arsitektur, pipeline data, dan logika export video visualizer (`VideoExporter` & `render.worker.ts`). Dokumen ini disusun sebagai acuan teknis untuk eksperimen optimasi performa, latensi, dan efisiensi memori berikutnya.

---

## 1. Ikhtisar Alur Ekspor (End-to-End Pipeline)

```
[Main Thread: UI / Exporter]
  │
  ├─ 1. Rebuild Merged Audio (jika belum ada)
  ├─ 2. Pre-extract Video Frames (HTMLVideoElement -> ImageBitmap[], max 20s @ 24fps)
  ├─ 3. Siapkan Font Buffers (Google Fonts / Custom TTF)
  ├─ 4. Zero-Copy Pack: flatFrequencyBuffer (Uint8Array, ~18.9MB) & audioRawData (Float32Array)
  │
  ▼ postMessage(START_RENDER, transferables)
[Web Worker: render.worker.ts]
  │
  ├─ 5. Inisialisasi OffscreenCanvas (desynchronized: true, alpha: false)
  ├─ 6. Output Mediabunny (Mp4OutputFormat, 'fastStart: in-memory')
  ├─ 7. VideoEncoder Hardware (WebCodecs AVC / H.264)
  │     └─ LatencyMode: 'quality' (macOS VideoToolbox) / 'realtime' (Windows)
  │     └─ ondequeue Backpressure clamp: max 16 (macOS) / 8 (Windows)
  ├─ 8. [CONCURRENT TASK] Jalankan AAC Audio Encoder di background sejak frame 0
  ├─ 9. Render Frame Loop (0 .. totalFrames):
  │     ├─ Background (Static / Video Frame via ImageBitmap)
  │     ├─ Video & Image Overlays (Transform, Beat scale, Chroma key)
  │     ├─ Text Overlays & Tracklist (Offscreen pre-cached canvas)
  │     ├─ Particle System + Spectrum (O(1) flat frequency buffer read)
  │     ├─ Lyrics Engine (Karaoke/Typewriter sync)
  │     ├─ Dynamic Light Watermark (jika Free edition)
  │     └─ new VideoFrame(canvas) -> videoEncoder.encode() -> videoSource.add()
  │
  ├─ 10. videoEncoder.flush() & videoEncoder.close()
  ├─ 11. await audioEncodingPromise (sudah selesai di background, latensi 0ms)
  ├─ 12. output.finalize() -> target.buffer (ArrayBuffer MP4)
  │
  ▼ postMessage(COMPLETE, [target.buffer])
[Main Thread: Exporter & Native Disk Stream]
  │
  └─ 13. Download Blob / Tauri invoke('save_video_chunk') 4MB streamed to disk
```

---

## 2. Rincian Komponen

### A. Main Thread (`src/features/export/exporter.svelte.ts`)
Tanggung jawab:
1. **Validasi Audio & Ekstraksi Channel**:
   - Memastikan `projectStore.audioBuffer` siap.
   - Mengambil PCM `Float32Array` dari setiap channel audio (`audioRawData`) dan mendaftarkannya ke array `transferables` (zero-copy memory transfer).
2. **Pre-ekstraksi Video Overlay & Background Video (`extractFramesFromVideo`)**:
   - Menggunakan hardware-accelerated `HTMLVideoElement` di main thread untuk men-decode video stiker/latar.
   - **Background Video**: Dibatasi resolusi **540p** ($960 \times 540$), durasi loop **8 detik** pada **16 FPS** (~128 frame). Menghemat VRAM dari 4 GB menjadi hanya $\sim 250\text{ MB}$ tanpa perbedaan kualitas visual yang tampak pada latar ambient.
   - **Video Overlay (Stickers/Chroma)**: Dibatasi resolusi **720p** ($1280 \times 720$), durasi loop **8 detik** pada **20 FPS** (~160 frame) menjaga ketajaman grafis stiker.
   - Frame disimpan sebagai `ImageBitmap[]` dan dipindahkan ke Worker via `transferables`.
3. **Zero-Copy Flat Frequency Buffer**:
   - Mengirim `projectStore.flatFrequencyBuffer` (berukuran ~18.9 MB untuk 30 menit audio) langsung ke Worker tanpa melewati `$state.snapshot()` agar tidak terjadi memory cloning ratusan ribu array.
4. **Streaming Native Save ke Disk (`save_video_chunk`)**:
   - Pada aplikasi desktop Tauri, MP4 tidak disimpan sekaligus dalam 1 payload JSON IPC raksasa (yang bisa memicu OOM).
   - MP4 di-slice menjadi chunk 4MB (`blob.slice()`), lalu dikirim bertahap ke Rust (`save_video_chunk`) yang langsung melakukan append stream ke file disk.

---

### B. Background Web Worker (`src/lib/workers/render.worker.ts`)
Tanggung jawab:
1. **OffscreenCanvas & 2D Context**:
   - `alpha: false`, `desynchronized: true`, `imageSmoothingQuality: 'high'`.
   - Mengeliminasi overhead alpha compositing browser.
2. **WebCodecs VideoEncoder**:
   - Deteksi otomatis codec profile AVC (High `avc1.640033` -> Main `avc1.4d002a` -> Baseline `avc1.42e01f`) dengan `isConfigSupported`.
   - Backpressure non-blocking via `videoEncoder.ondequeue` dengan ambang batas adaptif:
     - macOS: `maxQueue = 16`, `threshold = 6`, `latencyMode: 'quality'`.
     - Windows: `maxQueue = 8`, `threshold = 3`, `latencyMode: 'realtime'`.
3. **Concurrent AAC Audio Encoding (Pipelined)**:
   - Dijalankan via `@mediabunny/aac-encoder` secara non-blocking bersamaan dengan render video frame.
   - Menggunakan buffer planar 16384 sample per panggilan `AudioSample` untuk memotong async microtask overhead.
   - Selesai pada beberapa detik pertama render video, menghilangkan waktu tunggu post-render sama sekali.
4. **Drawing Layers**:
   - `drawBackground()`: Menampilkan Image/Video Bitmap dengan mode cover/contain dan beat reactivity.
   - `drawVideoOverlays()`: Transformasi, rotasi, scaling, dan fallback chroma key.
   - `ParticleSystem`: Partikel reaktif terhadap beat audio.
   - `SpectrumRenderer`: Membaca data frekuensi dari `flatFrequencyBuffer` secara O(1) tanpa clone heap.
   - `LyricRenderer`: Sinkronisasi lirik kata demi kata.
   - `drawDynamicWatermark()`: Watermark hemat GPU (hanya jika mode Free).
5. **Mediabunny Muxer (`Output`)**:
   - Format: `Mp4OutputFormat({ fastStart: 'in-memory' })`.
   - Menghasilkan MP4 valid dengan atom `moov` di awal file (fast-start).

---

## 3. Titik Kritis Performa (Performance Hotspots) & Safeguards

| Aspek | Strategi Saat Ini | Dampak Performa |
|---|---|---|
| **Penyimpanan Frekuensi FFT** | Single linear `Uint8Array` (128 bin/frame) | Menghemat ~75% RAM, heap naik <20MB untuk 12 lagu |
| **Pipelining Audio** | Concurrent Promise sejak awal render | Waktu tunggu pasca-render turun dari 10-20s menjadi <1s |
| **GPU Backpressure** | `ondequeue` threshold clamp | Mencegah memory crash GPU VRAM & menstabilkan speed di 7x–9x |
| **Chroma Key Allocation** | Reusable `OffscreenCanvas` with headroom | Mengeliminasi ribuan alokasi canvas per detik di Windows WebView2 |
| **Transfer Worker** | `transferables: [buffer1, buffer2, ...]` | Zero serialization overhead saat memulai proses render |

---

## 4. Peluang Eksperimen Optimasi Berikutnya (Future Experiments)

1. **Hardware WebCodecs VideoFrame Direct Extraction**:
   - Eksperimen memanfaatkan WebCodecs `VideoDecoder` langsung di Web Worker untuk background video, menghindari proses pre-extraction `extractFramesFromVideo` di main thread.
2. **Direct Disk Stream Muxing via Mediabunny StreamTarget / Tauri Shared Memory**:
   - Menulis langsung byte MP4 ke disk selama proses render berlangsung (streaming chunked target), sehingga Worker tidak perlu menyimpan seluruh file MP4 di RAM sebelum dikirim ke main thread.
3. **WebGPU Shader-Based Spectrum & Chroma Key**:
   - Memindahkan kalkulasi visualizer FFT dan chroma-keying green screen ke WebGPU fragment shader (compute pass) untuk melipatgandakan kecepatan di resolusi 4K (3840x2160).
4. **Dynamic Bitrate Scaling Berdasarkan Kompleksitas Scene**:
   - Menyesuaikan bitrate H.264 secara dinamis per scene untuk memperkecil ukuran file output tanpa mengorbankan ketajaman spektrum.
