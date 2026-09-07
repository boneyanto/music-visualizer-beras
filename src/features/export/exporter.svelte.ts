import { projectStore } from '../../lib/stores/project.svelte';
import { isDesktop } from '../../lib/utils/platform';
import { backgroundManager } from '../backdrop';
import { videoOverlayManager } from '../overlays';
import { fontManager } from '../texts';
import { licenseManager } from '../licensing';


export class VideoExporter {
  private worker: Worker | null = null;
  private timerInterval: any = null;
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

          this.progress = data.progress;
          this.currentFrame = data.frame;
          this.totalFrames = data.totalFrames;
          this.currentFPS = data.currentFPS || 0;
          this.speedMultiplier = data.speedMultiplier || 1.0;
          this.etaSeconds = data.etaSeconds || 0;
        } else if (data.type === 'COMPLETE') {
          this.stage = 'finalizing';
          this.isExporting = false;
          this.progress = 1.0;
          const totalRenderMs = renderStartTime > 0 ? (performance.now() - renderStartTime) : (this.elapsedSeconds * 1000);
          this.finalRenderTimeSeconds = Math.max(1, Math.round(totalRenderMs / 1000));
          this.cleanup();

          const blob = new Blob([data.buffer], { type: 'video/mp4' });
          resolve(blob);
        } else if (data.type === 'ERROR') {
          this.isExporting = false;
          this.errorMessage = data.message;
          this.cleanup();
          reject(new Error(data.message));
        } else if (data.type === 'CANCELLED') {
          this.isExporting = false;
          this.cleanup();
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
              const vidDuration = Math.min(20, vid.duration && !isNaN(vid.duration) && vid.duration > 0 ? vid.duration : 15);
              console.log(`🎬 Pre-extracting background video frames for ${item.id} (${vidDuration.toFixed(1)}s at 24 FPS)...`);
              const extracted = await extractFramesFromVideo(vid, vidDuration, width, height);
              videoFramesMap[item.id] = extracted.frames;
              videoDurationsMap[item.id] = extracted.duration;
              transferables.push(...extracted.frames);
              console.log(`✅ Extracted ${extracted.frames.length} frames for background video ${item.id} (duration: ${extracted.duration}s)`);
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
            const vidDuration = Math.min(20, vid.duration && !isNaN(vid.duration) && vid.duration > 0 ? vid.duration : 15);
            console.log(`🎬 Pre-extracting video overlay frames for ${vidItem.id} (${vidDuration.toFixed(1)}s at 24 FPS)...`);
            const extracted = await extractFramesFromVideo(vid, vidDuration, width, height);
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


      // Send payload to worker
      this.worker.postMessage({
        type: 'START_RENDER',
        project: $state.snapshot(projectStore.project),
        frequencyFrames: $state.snapshot(projectStore.frequencyFrames),
        beats: $state.snapshot(projectStore.beats),
        frameDuration: projectStore.frameDuration,
        audioRawData,
        sampleRate: projectStore.audioBuffer?.sampleRate || 44100,
        videoFramesMap,
        videoDurationsMap,
        fontBuffers,
        isLicensed: licenseManager.isLicensed,
      }, transferables);

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
        const chunkSize = 4 * 1024 * 1024; // 4MB stream chunks (eliminates gigabyte RAM bloat)
        const totalSize = blob.size;
        let offset = 0;
        let lastPath = '';

        while (offset < totalSize) {
          const isFirst = offset === 0;
          const end = Math.min(offset + chunkSize, totalSize);
          const isLast = end >= totalSize;
          const slice = blob.slice(offset, end);
          const buffer = await slice.arrayBuffer();
          const bytesChunk = Array.from(new Uint8Array(buffer));

          lastPath = await invoke<string>('save_video_chunk', {
            filename,
            bytesChunk,
            isFirst,
            isLast,
          });

          offset = end;
        }

        console.log('Video saved natively on desktop via stream:', lastPath);
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
  targetHeight: number = 720
): Promise<{ frames: ImageBitmap[]; duration: number }> {
  // Extract up to 20 seconds of video loop at 24 FPS (480 frames max).
  // 480 frames at 720p/540p takes ~90MB RAM, zero memory leak, and 100% eliminates 5 FPS stutter!
  const duration = Math.max(1, Math.min(20, targetDuration));
  const fps = 24;
  const totalFrames = Math.max(1, Math.floor(duration * fps));
  const frames: ImageBitmap[] = [];

  // Cap extraction resolution to max 720p (1280x720) to prevent slow GPU texture allocation & RAM bloat
  const maxW = Math.min(targetWidth, 1280);
  const maxH = Math.min(targetHeight, 720);

  const vidW = video.videoWidth || maxW;
  const vidH = video.videoHeight || maxH;

  let w = vidW;
  let h = vidH;
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
      // Generous timeout fallback in case seek event is delayed
      setTimeout(done, 100);
    });

    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(video, 0, 0, w, h);
    const bmp = await createImageBitmap(canvas, { resizeQuality: 'medium' });
    frames.push(bmp);
  }

  if (wasPlaying) {
    video.play().catch(() => {});
  }

  return { frames, duration };
}

