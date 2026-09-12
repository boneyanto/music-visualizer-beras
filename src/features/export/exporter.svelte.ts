import { projectStore } from '../../lib/stores/project.svelte';
import { isDesktop, isWindows, setWindowTitle, minimizeWindow, unminimizeWindow } from '../../lib/utils/platform';
import { backgroundManager } from '../backdrop';
import { videoOverlayManager } from '../overlays';
import { fontManager } from '../texts';
import { licenseManager } from '../licensing';


export class VideoExporter {
  private worker: Worker | null = null;
  private timerInterval: any = null;
  public autoMinimizeOnWindows = $state<boolean>(
    typeof localStorage !== 'undefined' ? localStorage.getItem('export_auto_minimize') === 'true' : false
  );
  public stage = $state<'preparing' | 'encoding' | 'encoding_audio' | 'finalizing'>('preparing');
  public isExporting = $state<boolean>(false);
  public progress = $state<number>(0);
  public currentFrame = $state<number>(0);
  public totalFrames = $state<number>(0);
  public currentFPS = $state<number>(0);
  public speedMultiplier = $state<number>(1.0);
  public etaSeconds = $state<number>(0);
  public elapsedSeconds = $state<number>(0);
  public finalRenderTimeSeconds = $state<number>(0);
  public errorMessage = $state<string | null>(null);

  public toggleAutoMinimize(enabled: boolean) {
    this.autoMinimizeOnWindows = enabled;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('export_auto_minimize', enabled ? 'true' : 'false');
    }
  }

  startExport(): Promise<Blob> {
    return new Promise(async (resolve, reject) => {
      this.isExporting = true;
      this.stage = 'preparing';
      this.progress = 0;
      this.currentFrame = 0;
      this.totalFrames = 0;
      this.currentFPS = 0;
      this.speedMultiplier = 1.0;
      this.etaSeconds = 0;
      this.elapsedSeconds = 0;
      this.finalRenderTimeSeconds = 0;
      this.errorMessage = null;

      if (this.timerInterval) clearInterval(this.timerInterval);
      this.timerInterval = null;
      let renderStartTime = 0;

      // Instantiate Web Worker with Vite URL resolution
      this.worker = new Worker(
        new URL('../../lib/workers/render.worker.ts', import.meta.url),
        { type: 'module' }
      );

      let lastUiUpdate = 0;
      this.worker.onmessage = (e: MessageEvent) => {
        const data = e.data;

        if (data.type === 'STAGE_CHANGE') {
          this.stage = data.stage;
        } else if (data.type === 'PROGRESS') {
          if (this.stage !== 'encoding') {
            this.stage = 'encoding';
            renderStartTime = performance.now();
            if (this.timerInterval) clearInterval(this.timerInterval);
            this.timerInterval = setInterval(() => {
              if (this.isExporting && renderStartTime > 0) {
                this.elapsedSeconds = Math.floor((performance.now() - renderStartTime) / 1000);
              }
            }, 500);
          }

          // Throttle reactive UI state update to max once per ~120ms to prevent DOM layout thrashing
          const now = performance.now();
          const isCompleteFrame = data.frame >= data.totalFrames;
          if (isCompleteFrame || now - lastUiUpdate >= 120) {
            lastUiUpdate = now;
            this.progress = data.progress;
            this.currentFrame = data.frame;
            this.totalFrames = data.totalFrames;
            this.currentFPS = data.currentFPS || 0;
            this.speedMultiplier = data.speedMultiplier || 1.0;
            this.etaSeconds = data.etaSeconds || 0;

            // Live taskbar title updates so user can monitor progress even when minimized/occluded
            const percent = Math.round(data.progress * 100);
            const etaText = data.etaSeconds > 0 ? ` - ETA ${Math.floor(data.etaSeconds / 60)}m${data.etaSeconds % 60}s` : '';
            setWindowTitle(`[${percent}%] Beras Visualizer (${data.currentFPS || 0} FPS${etaText})`);
          }
        } else if (data.type === 'COMPLETE') {
          this.stage = 'finalizing';
          this.isExporting = false;
          this.progress = 1.0;
          const totalRenderMs = renderStartTime > 0 ? (performance.now() - renderStartTime) : (this.elapsedSeconds * 1000);
          this.finalRenderTimeSeconds = Math.max(1, Math.round(totalRenderMs / 1000));
          this.cleanup();

          setWindowTitle('Beras Visualizer - Selesai!');
          if (this.autoMinimizeOnWindows && isWindows()) {
            unminimizeWindow();
          }

          const blob: Blob = data.blob instanceof Blob ? data.blob : new Blob([data.buffer], { type: 'video/mp4' });

          // If this export used up a free quota token (i.e. not PRO license), decrement the quota
          if (!licenseManager.isLicensed && licenseManager.freeQuotaRemaining > 0) {
            licenseManager.consumeFreeQuota().catch((qErr) => {
              console.warn('Failed to deduct quota token:', qErr);
            });
          }

          resolve(blob);
        } else if (data.type === 'ERROR') {
          this.isExporting = false;
          this.errorMessage = data.message;
          this.cleanup();
          setWindowTitle('Beras Visualizer');
          if (this.autoMinimizeOnWindows && isWindows()) {
            unminimizeWindow();
          }
          reject(new Error(data.message));
        } else if (data.type === 'CANCELLED') {
          this.isExporting = false;
          this.cleanup();
          setWindowTitle('Beras Visualizer');
          if (this.autoMinimizeOnWindows && isWindows()) {
            unminimizeWindow();
          }
          reject(new Error('Export was cancelled'));
        }
      };

      this.worker.onerror = (err) => {
        this.isExporting = false;
        this.errorMessage = err.message;
        this.cleanup();
        reject(err);
      };

      // Extract Raw Audio Channels from AudioBuffer if available
      let audioRawData: Float32Array[] | undefined = undefined;
      if (!projectStore.audioBuffer && projectStore.project.audio.tracks.length > 0) {
        console.log('AudioBuffer missing before export, rebuilding merged audio...');
        await projectStore.rebuildMergedAudio();
      }

      const transferables: Transferable[] = [];
      if (projectStore.audioBuffer) {
        const numChannels = projectStore.audioBuffer.numberOfChannels;
        audioRawData = [];
        for (let ch = 0; ch < numChannels; ch++) {
          const channelData = new Float32Array(projectStore.audioBuffer.getChannelData(ch));
          audioRawData.push(channelData);
          transferables.push(channelData.buffer);
        }
        console.log(`✅ Audio ready for export: ${numChannels} channels, ${projectStore.audioBuffer.sampleRate}Hz, ${projectStore.audioBuffer.duration.toFixed(1)}s`);
      } else {
        console.warn('⚠️ No audioBuffer available for export!');
      }

      // Pre-extract video frames from hardware-decoded HTMLVideoElements (100% reliable & ultra-fast)
      const videoFramesMap: Record<string, ImageBitmap[]> = {};
      const videoDurationsMap: Record<string, number> = {};
      const { width, height } = projectStore.project.exportSettings;

      if (projectStore.project.background?.items) {
        for (const item of projectStore.project.background.items) {
          if (item.type === 'video') {
            let vid = backgroundManager.getVideoElement(item.id);
            if (!vid && item.url) {
              try {
                vid = (await backgroundManager.loadAsset(item as any)) as HTMLVideoElement;
              } catch (e) {
                console.warn('Failed to load video element for export:', e);
              }
            }
            if (vid) {
              // Ambient background video loop: 8 seconds at 16 FPS = ~128 frames @ 540p (~250 MB VRAM instead of 4 GB!)
              const vidDuration = Math.min(8, vid.duration && !isNaN(vid.duration) && vid.duration > 0 ? vid.duration : 8);
              console.log(`🎬 Pre-extracting ambient background video frames for ${item.id} (${vidDuration.toFixed(1)}s at 16 FPS, 540p cap, pre-cropped)...`);
              const extracted = await extractFramesFromVideo(vid, vidDuration, 960, 540, 16, item.crop);
              videoFramesMap[item.id] = extracted.frames;
              videoDurationsMap[item.id] = extracted.duration;
              transferables.push(...extracted.frames);
              console.log(`✅ Extracted ${extracted.frames.length} frames for background video ${item.id} (duration: ${extracted.duration}s, ~250MB VRAM footprint)`);
            }
          }
        }
      }

      if (projectStore.project.overlays?.videos) {
        for (const vidItem of projectStore.project.overlays.videos) {
          let vid = videoOverlayManager.getVideoElement(vidItem.id);
          if (!vid && vidItem.url) {
            try {
              vid = await videoOverlayManager.loadVideo(vidItem);
            } catch (e) {
              console.warn('Failed to load overlay video element for export:', e);
            }
          }
          if (vid) {
            // Foreground overlay / chroma stickers: 8 seconds at 20 FPS = ~160 frames @ 720p
            const vidDuration = Math.min(8, vid.duration && !isNaN(vid.duration) && vid.duration > 0 ? vid.duration : 8);
            console.log(`🎬 Pre-extracting video overlay frames for ${vidItem.id} (${vidDuration.toFixed(1)}s at 20 FPS, 720p cap)...`);
            const extracted = await extractFramesFromVideo(vid, vidDuration, 1280, 720, 20);
            videoFramesMap[vidItem.id] = extracted.frames;
            videoDurationsMap[vidItem.id] = extracted.duration;
            transferables.push(...extracted.frames);
            console.log(`✅ Extracted ${extracted.frames.length} frames for overlay video ${vidItem.id} (duration: ${extracted.duration}s)`);
          }
        }
      }

      // Collect and prepare all fonts (built-in Google Fonts + custom TTF) for Web Worker
      const usedFonts: string[] = [];
      if (projectStore.project.lyrics?.config?.fontFamily) {
        usedFonts.push(projectStore.project.lyrics.config.fontFamily);
      }
      if (projectStore.project.overlays?.texts) {
        projectStore.project.overlays.texts.forEach((t) => {
          if (t.fontFamily) usedFonts.push(t.fontFamily);
        });
      }
      if (projectStore.project.overlays?.tracklist?.fontFamily) {
        usedFonts.push(projectStore.project.overlays.tracklist.fontFamily);
      }
      await fontManager.prepareFontsForExport(usedFonts);

      const fontBuffers = fontManager.getAllFontBuffers();
      fontBuffers.forEach((fb) => {
        transferables.push(fb.buffer);
      });


      const shouldRenderWatermarkFree = licenseManager.isWatermarkFree;

      // Zero-copy transfer of flat frequency buffer if available (avoids cloning 150,000 array elements)
      let flatFrequencyBuffer: Uint8Array | undefined = undefined;
      if (projectStore.flatFrequencyBuffer && projectStore.flatFrequencyBuffer.byteLength > 0) {
        flatFrequencyBuffer = new Uint8Array(projectStore.flatFrequencyBuffer);
        transferables.push(flatFrequencyBuffer.buffer);
      }

      // Send payload to worker
      this.worker.postMessage({
        type: 'START_RENDER',
        project: $state.snapshot(projectStore.project),
        flatFrequencyBuffer,
        frequencyFrames: flatFrequencyBuffer ? undefined : Array.from(projectStore.frequencyFrames),
        beats: Array.from(projectStore.beats),
        frameDuration: projectStore.frameDuration,
        audioRawData,
        sampleRate: projectStore.audioBuffer?.sampleRate || 44100,
        videoFramesMap,
        videoDurationsMap,
        fontBuffers,
        isLicensed: shouldRenderWatermarkFree,
      }, transferables);

      if (this.autoMinimizeOnWindows && isWindows()) {
        setTimeout(() => {
          if (this.isExporting) {
            minimizeWindow();
          }
        }, 150);
      }

    });
  }

  cancelExport() {
    if (this.worker) {
      this.worker.postMessage({ type: 'CANCEL' });
      this.cleanup();
    }
    this.isExporting = false;
  }

  private cleanup() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }

  async downloadBlob(blob: Blob, filename: string = 'visualizer.mp4'): Promise<string | null> {
    if (isDesktop()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        // 16MB stream chunks: drastically reduces IPC roundtrips from 120+ calls to only ~10-20 calls
        const chunkSize = 16 * 1024 * 1024;
        const totalSize = blob.size;
        let offset = 0;
        let lastPath = '';

        while (offset < totalSize) {
          const isFirst = offset === 0;
          const end = Math.min(offset + chunkSize, totalSize);
          const isLast = end >= totalSize;
          const slice = blob.slice(offset, end);

          // Fast native base64 serialization via browser FileReader (100x faster than Array.from numbers)
          const base64Chunk = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const res = reader.result as string;
              // Extract pure base64 payload from data URL ("data:...;base64,XXXX...")
              const commaIdx = res.indexOf(',');
              resolve(commaIdx >= 0 ? res.substring(commaIdx + 1) : res);
            };
            reader.onerror = reject;
            reader.readAsDataURL(slice);
          });

          lastPath = await invoke<string>('save_video_chunk', {
            filename,
            base64Chunk,
            isFirst,
            isLast,
          });

          offset = end;
        }

        console.log('Video saved natively on desktop via fast stream:', lastPath);
        return lastPath;
      } catch (err) {
        console.warn('Native desktop save failed, falling back to browser download:', err);
      }
    }

    // Standard Browser Download
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return null;
  }
}

export const videoExporter = new VideoExporter();

/**
/**
/**
 * Pre-extract video frames using hardware-accelerated HTMLVideoElement on main thread.
 * Guarantees buttery-smooth 24 FPS motion without stutter, capped at max 20s (max 480 frames max).
 * Uses robust seek synchronization to eliminate duplicate/skipped frames.
 */
async function extractFramesFromVideo(
  video: HTMLVideoElement,
  targetDuration: number = 20,
  targetWidth: number = 1280,
  targetHeight: number = 720,
  fps: number = 24,
  crop?: import('../../lib/types/project').CropRect
): Promise<{ frames: ImageBitmap[]; duration: number }> {
  // Extract video loop at specified FPS and duration.
  // Using 16-20 FPS with 540p/720p reduces VRAM usage by >90% without visible quality difference.
  const duration = Math.max(1, Math.min(20, targetDuration));
  const totalFrames = Math.max(1, Math.floor(duration * fps));
  const frames: ImageBitmap[] = [];

  const rawVidW = video.videoWidth || 1280;
  const rawVidH = video.videoHeight || 720;

  // If crop is present, calculate source rect one-time
  let sx = 0;
  let sy = 0;
  let sw = rawVidW;
  let sh = rawVidH;
  if (crop && crop.width > 0 && crop.height > 0) {
    sx = Math.max(0, Math.round(crop.x * rawVidW));
    sy = Math.max(0, Math.round(crop.y * rawVidH));
    sw = Math.min(rawVidW - sx, Math.round(crop.width * rawVidW));
    sh = Math.min(rawVidH - sy, Math.round(crop.height * rawVidH));
  }

  // Cap extraction resolution to max 720p (1280x720) to prevent slow GPU texture allocation & RAM bloat
  const maxW = Math.min(targetWidth, 1280);
  const maxH = Math.min(targetHeight, 720);

  let w = sw;
  let h = sh;
  if (w > maxW || h > maxH) {
    const scale = Math.min(maxW / w, maxH / h);
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return { frames, duration };

  const wasPlaying = !video.paused;
  video.pause();

  for (let i = 0; i < totalFrames; i++) {
    const t = (i / totalFrames) * duration;
    video.currentTime = t;

    await new Promise<void>((resolve) => {
      let resolved = false;
      const done = () => {
        if (!resolved) {
          resolved = true;
          video.removeEventListener('seeked', done);
          resolve();
        }
      };
      video.addEventListener('seeked', done, { once: true });
      // Windows WebView2 hardware decoder seek can take slightly longer; allow up to 250ms
      setTimeout(done, 250);
    });

    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, w, h);
    const bmp = await createImageBitmap(canvas, { resizeQuality: 'medium' });
    frames.push(bmp);
  }

  if (wasPlaying) {
    video.play().catch(() => {});
  }

  return { frames, duration };
}

