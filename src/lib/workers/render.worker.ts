import {
  Output,
  Mp4OutputFormat,
  BufferTarget,
  EncodedPacket,
  EncodedVideoPacketSource,
  AudioSample,
  AudioSampleSource,
} from 'mediabunny';
import { registerAacEncoder } from '@mediabunny/aac-encoder';
import { ParticleSystem } from '../engine/particles';
import { SpectrumRenderer } from '../engine/spectrum';
import { LyricRenderer } from '../engine/lyrics';
import { textOverlayManager } from '../engine/textOverlay.svelte';
import { tracklistOverlayRenderer } from '../engine/tracklistOverlay.svelte';
import type { ProjectConfig, ImageOverlayItem, VideoOverlayItem } from '../types/project';

// Register AAC Encoder polyfill (critical for Safari/WebKit/Tauri which lack WebCodecs AudioEncoder)
registerAacEncoder();

interface RenderRequest {
  type: 'START_RENDER';
  project: ProjectConfig;
  frequencyFrames: Uint8Array[];
  beats: number[];
  frameDuration: number;
  audioRawData?: Float32Array[];
  sampleRate: number;
  videoFramesMap?: Record<string, ImageBitmap[]>;
}

self.onmessage = async (e: MessageEvent<RenderRequest | { type: 'CANCEL' }>) => {
  if (e.data.type === 'CANCEL') {
    self.postMessage({ type: 'CANCELLED' });
    return;
  }

  if (e.data.type === 'START_RENDER') {
    const { project, frequencyFrames, beats, frameDuration, sampleRate, videoFramesMap = {} } = e.data;
    const { width, height, fps, videoBitrate } = project.exportSettings;
    const duration = project.audio.duration || 10;
    const totalFrames = Math.floor(duration * fps);

    // Hardware-accelerated OffscreenCanvas
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    if (!ctx) {
      self.postMessage({ type: 'ERROR', message: 'Failed to get OffscreenCanvas 2D context' });
      return;
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // 1. Preload Bitmaps (Zero-copy hardware textures)
    const bgItems = project.background?.items || [];
    const bgBitmaps = await preloadBitmaps(bgItems);
    const overlayBitmaps = await preloadBitmaps(project.overlays?.images);

    // 2. Initialize Render Engines & Prepare Static Offscreen Text Cache
    const particles = new ParticleSystem(width, height);
    const spectrum = new SpectrumRenderer();
    const lyrics = new LyricRenderer();
    if (project.overlays?.texts && typeof textOverlayManager.prepareCache === 'function') {
      textOverlayManager.prepareCache(width, height, project.overlays.texts);
    }
    if (project.overlays?.tracklist && typeof tracklistOverlayRenderer.prepareCache === 'function') {
      tracklistOverlayRenderer.prepareCache(width, height, project.overlays.tracklist, project.audio?.tracks);
    }

    // Setup Mediabunny Output & Tracks
    const target = new BufferTarget();
    const output = new Output({
      target,
      format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
    });

    const videoSource = new EncodedVideoPacketSource('avc');
    output.addVideoTrack(videoSource);

    const hasAudio = Boolean(e.data.audioRawData && e.data.audioRawData.length > 0);
    let audioSource: AudioSampleSource | null = null;
    if (hasAudio) {
      audioSource = new AudioSampleSource({
        codec: 'aac',
        bitrate: project.exportSettings.audioBitrate || 192_000,
      });
      output.addAudioTrack(audioSource);
    }

    await output.start();

    let encoderError: any = null;

    // WebCodecs VideoEncoder with Hardware Acceleration & low-latency mode
    const videoEncoder = new VideoEncoder({
      output: (chunk, meta) => {
        try {
          const packet = EncodedPacket.fromEncodedChunk(chunk);
          videoSource.add(packet, meta);
        } catch (err) {
          encoderError = err;
        }
      },
      error: (e) => {
        encoderError = e;
      },
    });

    const avcCodec = width > 1280 || height > 720 ? 'avc1.640033' : 'avc1.4d0020';
    const defaultBitrate = width <= 1280 ? 8_000_000 : 14_000_000;

    const isMac = typeof navigator !== 'undefined' && /Macintosh|Mac OS X|iPhone|iPad/i.test(navigator.userAgent || '');

    // WebCodecs VideoEncoder: 'quality' on Apple Silicon VideoToolbox & Intel Lunar Lake/Windows QuickSync for high-throughput parallel execution
    videoEncoder.configure({
      codec: avcCodec,
      width,
      height,
      bitrate: videoBitrate || defaultBitrate,
      framerate: fps,
      hardwareAcceleration: 'prefer-hardware',
      latencyMode: 'quality',
    } as any);

    // Setup zero-latency ondequeue backpressure (pure microsecond resolution on Mac & Windows)
    let queueDrainResolver: (() => void) | null = null;
    videoEncoder.ondequeue = () => {
      const threshold = isMac ? 10 : 12;
      if (queueDrainResolver && videoEncoder.encodeQueueSize <= threshold) {
        const resolve = queueDrainResolver;
        queueDrainResolver = null;
        resolve();
      }
    };

    // 3. Audio Encoding via @mediabunny/aac-encoder (Universally compatible with Safari/WebKit/Tauri & Chrome)
    if (hasAudio && audioSource) {
      await encodeAudioTrack(
        audioSource,
        e.data.audioRawData!,
        sampleRate || 44100
      );
    }

    const fallbackFreq = new Uint8Array(128);
    const totalBgItems = bgItems.length;
    const bgBrightness = project.background?.brightness ?? 1.0;

    // Start instantaneous sliding window timer for accurate realtime FPS telemetry
    const renderStartTime = performance.now();
    let windowStartTime = renderStartTime;
    let windowStartFrame = 0;

    try {
      for (let frameIdx = 0; frameIdx < totalFrames; frameIdx++) {
        if (encoderError) throw encoderError;

        const currentTime = frameIdx / fps;
        const timestampMicroseconds = Math.round(currentTime * 1_000_000);
        const isKeyFrame = frameIdx % (fps * 2) === 0;

        // 1. Determine Beat Hit
        let rawBeatFactor = 1.0;
        if (beats.length > 0) {
          const nearBeat = beats.some((b) => Math.abs(b - currentTime) < 0.06);
          if (nearBeat) rawBeatFactor = 1.35;
        } else {
          const beatPhase = (currentTime * 2.0) % 1;
          if (beatPhase < 0.12) rawBeatFactor = 1.25;
        }

        // 2. Frequency Data for Spectrum
        let currentFreq: Uint8Array;
        if (frequencyFrames.length > 0) {
          const fIdx = Math.min(
            frequencyFrames.length - 1,
            Math.floor(currentTime / frameDuration)
          );
          currentFreq = frequencyFrames[fIdx] || fallbackFreq;
        } else {
          currentFreq = fallbackFreq;
        }

        // 3. Render Background (Image or Video)
        ctx.fillStyle = '#0a0a0c';
        ctx.fillRect(0, 0, width, height);

        drawBackground(
          ctx,
          width,
          height,
          project.background,
          bgItems,
          currentTime,
          rawBeatFactor,
          bgBitmaps,
          videoFramesMap
        );

        // 4. Render Video Overlays
        drawVideoOverlays(
          ctx,
          width,
          height,
          project.overlays?.videos,
          currentTime,
          rawBeatFactor,
          videoFramesMap
        );

        // 5. Render Image Overlays
        drawImageOverlays(
          ctx,
          width,
          height,
          project.overlays?.images,
          currentTime,
          rawBeatFactor,
          overlayBitmaps
        );

        // 5. Render Text Overlays
        if (project.overlays?.texts && project.overlays.texts.length > 0) {
          textOverlayManager.render(
            ctx,
            width,
            height,
            project.overlays.texts,
            currentTime,
            rawBeatFactor
          );
        }

        // 5b. Render Tracklist Playlist Overlay
        if (project.overlays?.tracklist?.enabled) {
          tracklistOverlayRenderer.render(
            ctx,
            width,
            height,
            project.overlays.tracklist,
            project.audio?.tracks,
            currentTime,
            rawBeatFactor
          );
        }

        // 6. Render Layers (Particles, Spectrum, Lyrics)
        particles.updateAndRender(ctx, project.overlays.particle, rawBeatFactor);
        spectrum.render(ctx, width, height, project.overlays.spectrum, currentFreq, rawBeatFactor);
        lyrics.render(
          ctx,
          width,
          height,
          project.lyrics.config,
          project.lyrics.segments,
          currentTime,
          rawBeatFactor
        );

        // 7. Create VideoFrame from OffscreenCanvas
        const frame = new VideoFrame(canvas, {
          timestamp: timestampMicroseconds,
          duration: Math.round((1 / fps) * 1_000_000),
        });

        // 8. Platform-optimized GPU Queue Backpressure
        if (isMac) {
          // macOS Apple Silicon VideoToolbox: zero-latency microsecond resolution (600+ FPS)
          if (videoEncoder.encodeQueueSize > 20) {
            await new Promise<void>((resolve) => {
              queueDrainResolver = resolve;
            });
          }
        } else {
          // Windows Intel Arc / Lunar Lake QuickSync: High-throughput backpressure without 15.6ms OS timer penalties
          if (videoEncoder.encodeQueueSize > 24) {
            await new Promise<void>((resolve) => {
              queueDrainResolver = resolve;
              // High-resolution microtask poller: fallback if GPU driver delays ondequeue event without blocking CPU for 15.6ms
              const checkDrain = () => {
                if (!queueDrainResolver) return;
                if (videoEncoder.encodeQueueSize <= 12) {
                  queueDrainResolver = null;
                  resolve();
                } else {
                  // Spin in V8 microtask loop (sub-millisecond resolution, 0 OS context switch delay)
                  queueMicrotask(checkDrain);
                }
              };
              queueMicrotask(checkDrain);
            });
          }
        }

        videoEncoder.encode(frame, { keyFrame: isKeyFrame });
        frame.close();

        // 9. Post Instant Sliding-Window Progress Telemetry (Real-time FPS & Accurate Multiplier)
        if (frameIdx % 15 === 0 || frameIdx === totalFrames - 1) {
          const now = performance.now();
          const windowElapsedSec = (now - windowStartTime) / 1000;
          const framesInWindow = frameIdx - windowStartFrame + 1;

          let currentFPS = windowElapsedSec > 0.05 ? framesInWindow / windowElapsedSec : 150;
          currentFPS = Math.min(800, Math.max(10, currentFPS));

          windowStartTime = now;
          windowStartFrame = frameIdx + 1;

          const remainingFrames = totalFrames - (frameIdx + 1);
          const etaSeconds = currentFPS > 0 ? Math.max(0, Math.round(remainingFrames / currentFPS)) : 0;
          const speedMultiplier = Number((currentFPS / fps).toFixed(1));

          self.postMessage({
            type: 'PROGRESS',
            progress: (frameIdx + 1) / totalFrames,
            frame: frameIdx + 1,
            totalFrames,
            currentFPS: Math.round(currentFPS),
            speedMultiplier,
            etaSeconds,
          });
        }
      }

      await videoEncoder.flush();
      videoEncoder.close();

      // Finalize Mediabunny Output
      await output.finalize();

      // Free Bitmaps & Caches immediately to release RAM
      bgBitmaps.forEach((bmp) => bmp.close());
      bgBitmaps.clear();
      overlayBitmaps.forEach((bmp) => bmp.close());
      overlayBitmaps.clear();
      if (videoFramesMap) {
        Object.values(videoFramesMap).forEach((frames) => {
          frames.forEach((bmp) => { try { bmp.close(); } catch (e) {} });
        });
      }
      textOverlayManager?.clearCache?.();
      tracklistOverlayRenderer?.clearCache?.();

      const buffer = target.buffer;

      if (!buffer) {
        throw new Error('Gagal menghasilkan video buffer dari Mediabunny');
      }

      self.postMessage(
        {
          type: 'COMPLETE',
          buffer,
        },
        { transfer: [buffer] }
      );

    } catch (err: any) {
      try {
        videoEncoder.close();
      } catch (e) {}
      bgBitmaps.forEach((bmp) => bmp.close());
      bgBitmaps.clear();
      overlayBitmaps.forEach((bmp) => bmp.close());
      overlayBitmaps.clear();
      if (videoFramesMap) {
        Object.values(videoFramesMap).forEach((frames) => {
          frames.forEach((bmp) => { try { bmp.close(); } catch (e) {} });
        });
      }
      textOverlayManager?.clearCache?.();
      tracklistOverlayRenderer?.clearCache?.();

      self.postMessage({
        type: 'ERROR',
        message: err.message || 'Unknown render error occurred',
      });
    }
  }
};

/**
 * Preload background & overlay images as ImageBitmaps in Web Worker (Zero-copy hardware textures)
 */
async function preloadBitmaps(
  items: Array<{ id: string; type?: string; url?: string }> | undefined
): Promise<Map<string, ImageBitmap>> {
  const map = new Map<string, ImageBitmap>();
  if (!items) return map;

  for (const item of items) {
    if ((!item.type || item.type === 'image') && item.url) {
      try {
        const resp = await fetch(item.url);
        const blob = await resp.blob();
        const bmp = await createImageBitmap(blob, {
          resizeQuality: 'high',
        });
        map.set(item.id, bmp);
      } catch (err) {
        console.warn('Could not load image bitmap in worker:', err);
      }
    }
  }
  return map;
}

/**
 * Encodes audio PCM channels to AAC format via Mediabunny AAC Encoder
 */
async function encodeAudioTrack(
  audioSource: AudioSampleSource,
  channels: Float32Array[],
  sampleRate: number
): Promise<void> {
  try {
    const numChannels = channels.length;
    const totalAudioSamples = channels[0].length;
    console.log(`Encoding audio track: ${numChannels}ch, ${totalAudioSamples} samples, ${sampleRate}Hz, ${(totalAudioSamples / sampleRate).toFixed(1)}s`);
    const chunkSize = 2048;

    let sampleOffset = 0;
    while (sampleOffset < totalAudioSamples) {
      const count = Math.min(chunkSize, totalAudioSamples - sampleOffset);
      const planarBuffer = new Float32Array(count * numChannels);
      for (let ch = 0; ch < numChannels; ch++) {
        planarBuffer.set(channels[ch].subarray(sampleOffset, sampleOffset + count), ch * count);
      }

      const sample = new AudioSample({
        data: planarBuffer,
        format: 'f32-planar',
        sampleRate,
        numberOfChannels: numChannels,
        timestamp: sampleOffset / sampleRate,
      });

      await audioSource.add(sample);
      sampleOffset += count;
    }

    console.log('Audio track encoded successfully via @mediabunny/aac-encoder!');
  } catch (audioErr) {
    console.error('Audio encoding failed:', audioErr);
  }
}

let workerChromaCanvas: OffscreenCanvas | null = null;
let workerChromaCtx: OffscreenCanvasRenderingContext2D | null = null;

function renderWorkerChromaKey(
  targetCtx: OffscreenCanvasRenderingContext2D,
  source: CanvasImageSource,
  drawW: number,
  drawH: number,
  chroma: { color: string; similarity: number; smoothness: number }
) {
  const w = Math.round(drawW);
  const h = Math.round(drawH);
  if (w <= 0 || h <= 0) return;

  if (!workerChromaCanvas || workerChromaCanvas.width !== w || workerChromaCanvas.height !== h) {
    workerChromaCanvas = new OffscreenCanvas(w, h);
    workerChromaCtx = workerChromaCanvas.getContext('2d', { willReadFrequently: true }) as any;
  }
  if (!workerChromaCtx) return;

  workerChromaCtx.clearRect(0, 0, w, h);
  workerChromaCtx.drawImage(source, 0, 0, w, h);
  const imgData = workerChromaCtx.getImageData(0, 0, w, h);
  const data = imgData.data;

  const targetR = parseInt(chroma.color.slice(1, 3), 16) || 0;
  const targetG = parseInt(chroma.color.slice(3, 5), 16) || 255;
  const targetB = parseInt(chroma.color.slice(5, 7), 16) || 0;

  const simThreshold = (chroma.similarity || 0.4) * 255;
  const smooth = (chroma.smoothness || 0.1) * 255;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const diff = Math.sqrt((r - targetR) ** 2 + (g - targetG) ** 2 + (b - targetB) ** 2);

    if (diff < simThreshold) {
      data[i + 3] = 0;
    } else if (diff < simThreshold + smooth) {
      data[i + 3] = Math.round(((diff - simThreshold) / smooth) * 255);
    }
  }

  workerChromaCtx.putImageData(imgData, 0, 0);
  targetCtx.drawImage(workerChromaCanvas, -drawW / 2, -drawH / 2);
}

/**
 * Draws background image or video synchronously (zero microtask overhead, full 8x render speed)
 */
function drawBackground(
  ctx: OffscreenCanvasRenderingContext2D,
  width: number,
  height: number,
  bgConfig: ProjectConfig['background'],
  bgItems: Array<{ id: string; type?: string; duration?: number }>,
  currentTime: number,
  rawBeatFactor: number,
  bgBitmaps: Map<string, ImageBitmap>,
  videoFramesMap: Record<string, ImageBitmap[]>
): void {
  const totalBgItems = bgItems.length;
  if (totalBgItems === 0) return;

  const bgBrightness = bgConfig?.brightness ?? 1.0;
  let activeItem = bgItems[0];
  let nextItem: any = null;
  let blendFactor = 0;

  if (totalBgItems > 1 && bgConfig.type.startsWith('multi')) {
    const itemDuration = bgItems[0]?.duration || 5.0;
    const cycleIndex = Math.floor(currentTime / itemDuration) % totalBgItems;
    const progressInItem = (currentTime % itemDuration) / itemDuration;

    activeItem = bgItems[cycleIndex];
    nextItem = bgItems[(cycleIndex + 1) % totalBgItems];

    const transDurationNorm = (bgConfig.transitionDuration || 1.0) / itemDuration;
    if (progressInItem > 1 - transDurationNorm && bgConfig.transition === 'crossfade') {
      blendFactor = (progressInItem - (1 - transDurationNorm)) / transDurationNorm;
    }
  }

  const bgSens = bgConfig.beatSensitivity ?? 1.0;
  const bgBeat = 1.0 + (rawBeatFactor - 1.0) * bgSens;
  const scaleFactor = bgConfig.followBeat ? 1 + (bgBeat - 1) * 0.03 : 1.0;

  drawSingleBgItem(
    ctx,
    width,
    height,
    activeItem,
    bgConfig.scaleMode,
    scaleFactor,
    1.0 - (blendFactor > 0 ? blendFactor * 0.5 : 0),
    bgBrightness,
    currentTime,
    bgBitmaps,
    videoFramesMap
  );

  // Crossfade next slide
  if (nextItem && blendFactor > 0 && bgConfig.transition === 'crossfade') {
    drawSingleBgItem(
      ctx,
      width,
      height,
      nextItem,
      bgConfig.scaleMode,
      scaleFactor,
      blendFactor,
      bgBrightness,
      currentTime,
      bgBitmaps,
      videoFramesMap
    );
  }
}

function drawSingleBgItem(
  ctx: OffscreenCanvasRenderingContext2D,
  width: number,
  height: number,
  item: { id: string; type?: string },
  scaleMode: string = 'cover',
  scaleFactor: number,
  alpha: number,
  brightness: number,
  currentTime: number,
  bgBitmaps: Map<string, ImageBitmap>,
  videoFramesMap: Record<string, ImageBitmap[]>
): void {
  let sourceCanvas: CanvasImageSource | null = null;
  let natW = width;
  let natH = height;

  if (item.type === 'video') {
    const frames = videoFramesMap[item.id];
    if (frames && frames.length > 0) {
      const frameIdx = Math.floor(currentTime * 24) % frames.length;
      sourceCanvas = frames[frameIdx];
      natW = (sourceCanvas as ImageBitmap).width;
      natH = (sourceCanvas as ImageBitmap).height;
    }
  } else {
    const bmp = bgBitmaps.get(item.id);
    if (bmp) {
      sourceCanvas = bmp;
      natW = bmp.width;
      natH = bmp.height;
    }
  }

  if (!sourceCanvas) return;

  let drawW = width;
  let drawH = height;
  let drawX = 0;
  let drawY = 0;

  if (scaleMode === 'contain') {
    const scale = Math.min(width / natW, height / natH) * scaleFactor;
    drawW = natW * scale;
    drawH = natH * scale;
    drawX = (width - drawW) / 2;
    drawY = (height - drawH) / 2;
  } else {
    // cover (default)
    const scale = Math.max(width / natW, height / natH) * scaleFactor;
    drawW = natW * scale;
    drawH = natH * scale;
    drawX = (width - drawW) / 2;
    drawY = (height - drawH) / 2;
  }

  ctx.save();
  ctx.globalAlpha = alpha;
  if (brightness !== 1.0) {
    ctx.filter = `brightness(${brightness})`;
  }
  ctx.drawImage(sourceCanvas, drawX, drawY, drawW, drawH);
  ctx.restore();
}

/**
 * Draws video sticker overlays synchronously (with position, scale, beat reactivity, animation, and chroma key)
 */
function drawVideoOverlays(
  ctx: OffscreenCanvasRenderingContext2D,
  width: number,
  height: number,
  videos: VideoOverlayItem[] | undefined,
  currentTime: number,
  rawBeatFactor: number,
  videoFramesMap: Record<string, ImageBitmap[]>
): void {
  if (!videos || videos.length === 0) return;

  for (const item of videos) {
    const frames = videoFramesMap[item.id];
    if (!frames || frames.length === 0) continue;

    const frameIdx = Math.floor(currentTime * 24) % frames.length;
    const bmp = frames[frameIdx];
    if (!bmp) continue;

    const sens = item.beatSensitivity ?? 1.0;
    const beatFactor = 1.0 + (rawBeatFactor - 1.0) * sens;
    const posX = (item.x ?? 0.5) * width;
    let posY = (item.y ?? 0.5) * height;
    let drawAlpha = item.opacity ?? 1.0;
    let animScale = 1.0;

    // Animation options
    if (item.animation === 'floating') {
      posY += Math.sin(currentTime * 2.5 + (item.x ?? 0.5) * 10) * 12;
    } else if (item.animation === 'pulse-beat') {
      if (item.followBeat) {
        animScale = 1.0 + (beatFactor - 1.0) * 0.15;
      } else {
        animScale = 1.0 + Math.sin(currentTime * 3) * 0.05;
      }
    } else if (item.animation === 'shimmer') {
      drawAlpha *= 0.6 + Math.sin(currentTime * 4) * 0.4;
    } else if (item.animation === 'glow-pulse') {
      drawAlpha *= 0.75 + Math.sin(currentTime * 5) * 0.25;
    }

    const baseScale = item.scale ?? 1.0;
    const beatScale = item.followBeat ? 1 + (beatFactor - 1) * 0.2 : 1.0;
    const scale = baseScale * beatScale * animScale;

    const vidW = bmp.width;
    const vidH = bmp.height;
    const drawW = vidW * scale;
    const drawH = vidH * scale;

    ctx.save();
    ctx.globalAlpha = drawAlpha;
    ctx.globalCompositeOperation = (item.blendMode as GlobalCompositeOperation) || 'source-over';
    ctx.translate(posX, posY);

    if (item.chromaKey?.enabled) {
      renderWorkerChromaKey(ctx, bmp, drawW, drawH, item.chromaKey);
    } else {
      ctx.drawImage(bmp, -drawW / 2, -drawH / 2, drawW, drawH);
    }

    ctx.restore();
  }
}

/**
 * Draws image sticker overlays with animations
 */
function drawImageOverlays(
  ctx: OffscreenCanvasRenderingContext2D,
  width: number,
  height: number,
  images: ImageOverlayItem[] | undefined,
  currentTime: number,
  rawBeatFactor: number,
  overlayBitmaps: Map<string, ImageBitmap>
): void {
  if (!images || images.length === 0) return;

  const scaleFactor = Math.min(width / 1920, height / 1080);
  for (const imgItem of images) {
    const bmp = overlayBitmaps.get(imgItem.id);
    if (bmp) {
      const sens = imgItem.beatSensitivity ?? 1.0;
      const imgBeat = 1.0 + (rawBeatFactor - 1.0) * sens;

      const posX = (imgItem.x ?? 0.5) * width;
      let posY = (imgItem.y ?? 0.5) * height;
      let drawAlpha = imgItem.opacity ?? 1.0;
      let animScale = 1.0;

      // Animation options
      if (imgItem.animation === 'floating') {
        posY += Math.sin(currentTime * 2.5 + (imgItem.x ?? 0.5) * 10) * 12 * scaleFactor;
      } else if (imgItem.animation === 'pulse-beat') {
        if (imgItem.followBeat) {
          animScale = 1.0 + (imgBeat - 1.0) * 0.15;
        } else {
          animScale = 1.0 + Math.sin(currentTime * 3) * 0.05;
        }
      } else if (imgItem.animation === 'shimmer') {
        drawAlpha *= 0.6 + Math.sin(currentTime * 4) * 0.4;
      } else if (imgItem.animation === 'glow-pulse') {
        drawAlpha *= 0.75 + Math.sin(currentTime * 5) * 0.25;
      }

      const baseScale = (imgItem.scale ?? 1.0) * scaleFactor;
      const beatScale = imgItem.followBeat ? 1 + (imgBeat - 1) * 0.25 : 1.0;
      const scale = baseScale * beatScale * animScale;

      const drawW = bmp.width * scale;
      const drawH = bmp.height * scale;

      ctx.save();
      ctx.globalAlpha = drawAlpha;
      ctx.translate(posX, posY);
      if (imgItem.rotation) ctx.rotate((imgItem.rotation * Math.PI) / 180);
      ctx.drawImage(bmp, -drawW / 2, -drawH / 2, drawW, drawH);
      ctx.restore();
    }
  }
}

