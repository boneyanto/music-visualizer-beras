import { projectStore } from '../stores/project.svelte';
import { isDesktop } from '../utils/platform';
import { backgroundManager } from './background.svelte';
import { videoOverlayManager } from './videoOverlay.svelte';
import { fontManager } from '../services/fontManager';

export class VideoExporter {
  private worker: Worker | null = null;
  private timerInterval: any = null;
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
      this.progress = 0;
      this.currentFrame = 0;
      this.totalFrames = 0;
      this.currentFPS = 0;
      this.speedMultiplier = 1.0;
      this.etaSeconds = 0;
      this.elapsedSeconds = 0;
      this.finalRenderTimeSeconds = 0;
      this.errorMessage = null;

      const startTime = performance.now();
      if (this.timerInterval) clearInterval(this.timerInterval);
      this.timerInterval = setInterval(() => {
        if (this.isExporting) {
          this.elapsedSeconds = Math.floor((performance.now() - startTime) / 1000);
        }
      }, 500);

      // Instantiate Web Worker with Vite URL resolution
      this.worker = new Worker(
        new URL('../workers/render.worker.ts', import.meta.url),
        { type: 'module' }
      );

      this.worker.onmessage = (e: MessageEvent) => {
        const data = e.data;

        if (data.type === 'PROGRESS') {
          this.progress = data.progress;
          this.currentFrame = data.frame;
          this.totalFrames = data.totalFrames;
          this.currentFPS = data.currentFPS || 0;
          this.speedMultiplier = data.speedMultiplier || 1.0;
          this.etaSeconds = data.etaSeconds || 0;
        } else if (data.type === 'COMPLETE') {
          this.isExporting = false;
          this.progress = 1.0;
          this.finalRenderTimeSeconds = Math.floor((performance.now() - startTime) / 1000);
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
              console.log(`🎬 Pre-extracting background video frames for ${item.id}...`);
              const frames = await extractFramesFromVideo(vid, 24, 15, width, height);
              videoFramesMap[item.id] = frames;
              transferables.push(...frames);
              console.log(`✅ Extracted ${frames.length} frames for background video ${item.id}`);
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
            console.log(`🎬 Pre-extracting video overlay frames for ${vidItem.id}...`);
            const frames = await extractFramesFromVideo(vid, 24, 15, width, height);
            videoFramesMap[vidItem.id] = frames;
            transferables.push(...frames);
            console.log(`✅ Extracted ${frames.length} frames for overlay video ${vidItem.id}`);
          }
        }
      }

      // Collect custom fonts for Web Worker
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
        fontBuffers,
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

          // Efficient small-chunk base64 conversion without huge array allocations
          let binary = '';
          const bytes = new Uint8Array(buffer);
          const len = bytes.byteLength;
          const subChunkSize = 0x8000;
          for (let i = 0; i < len; i += subChunkSize) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + subChunkSize, len)) as any);
          }
          const base64Chunk = btoa(binary);

          lastPath = await invoke<string>('save_video_chunk', {
            filename,
            base64Chunk,
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
 * Pre-extract video frames using hardware-accelerated HTMLVideoElement on main thread.
 * Caps to max 15s at 24fps (360 frames max) to keep RAM ultra-cool and prevent swap.
 */
async function extractFramesFromVideo(
  video: HTMLVideoElement,
  fps: number = 24,
  maxDuration: number = 15,
  targetWidth: number = 1280,
  targetHeight: number = 720
): Promise<ImageBitmap[]> {
  const duration = Math.min(video.duration || maxDuration, maxDuration);
  const totalFrames = Math.max(1, Math.floor(duration * fps));
  const frames: ImageBitmap[] = [];

  const vidW = video.videoWidth || targetWidth;
  const vidH = video.videoHeight || targetHeight;

  // Scale down if larger than target to save memory while keeping HD crispness
  let w = vidW;
  let h = vidH;
  if (w > targetWidth || h > targetHeight) {
    const scale = Math.min(targetWidth / w, targetHeight / h);
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return frames;

  const wasPlaying = !video.paused;
  video.pause();

  for (let i = 0; i < totalFrames; i++) {
    const t = (i / totalFrames) * duration;
    video.currentTime = t;

    await new Promise<void>((resolve) => {
      const onSeeked = () => {
        video.removeEventListener('seeked', onSeeked);
        resolve();
      };
      video.addEventListener('seeked', onSeeked, { once: true });
      setTimeout(resolve, 60);
    });

    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(video, 0, 0, w, h);
    const bmp = await createImageBitmap(canvas, { resizeQuality: 'high' });
    frames.push(bmp);
  }

  if (wasPlaying) {
    video.play().catch(() => {});
  }

  return frames;
}

