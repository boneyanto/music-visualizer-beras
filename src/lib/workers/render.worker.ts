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
import { ParticleSystem } from '../../features/particles/particles';
import { SpectrumRenderer } from '../../features/spectrum/spectrum';
import { LyricRenderer } from '../../features/lyrics/lyrics';
import { textOverlayManager } from '../../features/texts/textOverlay.svelte';
import { tracklistOverlayRenderer } from '../../features/tracklist/tracklistOverlay.svelte';
import { computeOverlayTransition } from '../utils/transition';
import type { ProjectConfig, BackgroundItem, ImageOverlayItem, VideoOverlayItem } from '../types/project';

// Register AAC Encoder polyfill (critical for Safari/WebKit/Tauri which lack WebCodecs AudioEncoder)
registerAacEncoder();

interface RenderRequest {
  type: 'START_RENDER';
  project: ProjectConfig;
  frequencyFrames?: Uint8Array[];
  flatFrequencyBuffer?: Uint8Array;
  beats: number[];
  frameDuration: number;
  audioRawData?: Float32Array[];
  sampleRate: number;
  videoFramesMap?: Record<string, ImageBitmap[]>;
  videoDurationsMap?: Record<string, number>;
  fontBuffers?: Array<{ name: string; buffer: ArrayBuffer }>;
  isLicensed?: boolean;
}


self.onmessage = async (e: MessageEvent<RenderRequest | { type: 'CANCEL' }>) => {
  if (e.data.type === 'CANCEL') {
    self.postMessage({ type: 'CANCELLED' });
    return;
  }

  if (e.data.type === 'START_RENDER') {
    const { 
      project, 
      frequencyFrames: passedFrequencyFrames, 
      flatFrequencyBuffer,
      beats, 
      frameDuration, 
      sampleRate, 
      videoFramesMap = {}, 
      videoDurationsMap = {}, 
      fontBuffers = [], 
      isLicensed = false 
    } = e.data;
    const { width, height, fps, videoBitrate } = project.exportSettings;
    const duration = project.audio.duration || 10;
    const totalFrames = Math.floor(duration * fps);

    // Fast zero-allocation unpack of frequency frames if flat buffer was transferred
    let frequencyFrames: Uint8Array[];
    if (flatFrequencyBuffer && flatFrequencyBuffer.byteLength > 0) {
      const visualBins = 128;
      const totalFreqFrames = Math.floor(flatFrequencyBuffer.byteLength / visualBins);
      frequencyFrames = new Array(totalFreqFrames);
      for (let i = 0; i < totalFreqFrames; i++) {
        frequencyFrames[i] = flatFrequencyBuffer.subarray(i * visualBins, (i + 1) * visualBins);
      }
    } else {
      frequencyFrames = passedFrequencyFrames || [];
    }

    // Random watermark seed and jump interval for Free Use (0 cost, pure integer math)
    const watermarkBaseX = Math.floor(0.15 * width + Math.random() * (0.70 * width));
    const watermarkBaseY = Math.floor(0.15 * height + Math.random() * (0.70 * height));
    const watermarkSeed = Math.floor(Math.random() * 1000000);


    // Register custom fonts in Web Worker context if provided
    if (fontBuffers.length > 0 && typeof (self as any).FontFace !== 'undefined') {
      for (const fb of fontBuffers) {
        try {
          const fontFace = new (self as any).FontFace(fb.name, fb.buffer);
          await fontFace.load();
          (self as any).fonts.add(fontFace);
          console.log(`[Worker] Loaded custom font: ${fb.name}`);
        } catch (fErr) {
          console.warn(`[Worker] Could not register custom font ${fb.name}:`, fErr);
        }
      }
    }

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

    // 2b. Pre-cache Watermark Typography & Layout Metrics (Avoid ctx.measureText() & font string parsing per frame)
    const watermarkScale = Math.min(width, height) / 1080;
    const wmPaddingX = Math.round(14 * watermarkScale);
    const wmPaddingY = Math.round(8 * watermarkScale);
    const wmFontSize = Math.max(11, Math.round(13 * watermarkScale));
    const wmFont = `600 ${wmFontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.font = wmFont;
    const wmText = 'Made with Beras Visualizer';
    const wmTextWidth = ctx.measureText(wmText).width;
    const wmWaveWidth = Math.round(18 * watermarkScale);
    const wmWaveGap = Math.round(8 * watermarkScale);
    const wmBadgeWidth = wmTextWidth + wmWaveWidth + wmWaveGap + wmPaddingX * 2;
    const wmBadgeHeight = Math.max(26, Math.round(28 * watermarkScale) + wmPaddingY);
    const wmRadius = Math.round(wmBadgeHeight / 2);
    const wmMarginX = Math.round(Math.max(20, width * 0.025));
    const wmMarginY = Math.round(Math.max(20, height * 0.035));
    const wmX = width - wmMarginX - wmBadgeWidth;
    const wmY = height - wmMarginY - wmBadgeHeight;
    const wmBarBaseX = wmPaddingX + 2;
    const wmBarCenterY = wmBadgeHeight / 2;
    const wmBarW = Math.max(2, Math.round(2.5 * watermarkScale));
    const wmBarSpacing = Math.max(4, Math.round(5 * watermarkScale));
    const wmTextX = wmPaddingX + wmWaveWidth + wmWaveGap;
    const wmMetrics = {
      scale: watermarkScale,
      paddingX: wmPaddingX,
      paddingY: wmPaddingY,
      fontSize: wmFontSize,
      font: wmFont,
      text: wmText,
      textWidth: wmTextWidth,
      waveWidth: wmWaveWidth,
      waveGap: wmWaveGap,
      badgeWidth: wmBadgeWidth,
      badgeHeight: wmBadgeHeight,
      radius: wmRadius,
      x: wmX,
      y: wmY,
      barBaseX: wmBarBaseX,
      barCenterY: wmBarCenterY,
      barW: wmBarW,
      barSpacing: wmBarSpacing,
      textX: wmTextX,
    };

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
    let encodedVideoPacketsCount = 0;

    // WebCodecs VideoEncoder with Hardware Acceleration & low-latency mode
    const videoEncoder = new VideoEncoder({
      output: (chunk, meta) => {
        try {
          const packet = EncodedPacket.fromEncodedChunk(chunk);
          videoSource.add(packet, meta);
          encodedVideoPacketsCount++;
        } catch (err) {
          encoderError = err;
        }
      },
      error: (e) => {
        encoderError = e;
      },
    });

    // Try optimal hardware codec profile with automatic graceful fallback to baseline/main
    const candidateCodecs = width > 1280 || height > 720
      ? ['avc1.640033', 'avc1.4d002a', 'avc1.42e01f']
      : ['avc1.4d0020', 'avc1.42e01e', 'avc1.64001f'];

    let configuredCodec = candidateCodecs[0];
    for (const codec of candidateCodecs) {
      try {
        if (typeof (VideoEncoder as any).isConfigSupported === 'function') {
          const support = await (VideoEncoder as any).isConfigSupported({
            codec,
            width,
            height,
            bitrate: videoBitrate || (width <= 1280 ? 8_000_000 : 14_000_000),
            framerate: fps,
            hardwareAcceleration: 'prefer-hardware',
          });
          if (support.supported) {
            configuredCodec = codec;
            break;
          }
        }
      } catch (e) {
        // Continue to next candidate
      }
    }

    const defaultBitrate = width <= 1280 ? 8_000_000 : 14_000_000;
    const isMac = typeof navigator !== 'undefined' && /Macintosh|Mac OS X|iPhone|iPad/i.test(navigator.userAgent || '');

    // WebCodecs VideoEncoder: 'quality' on Apple Silicon VideoToolbox for max parallel throughput (7x-12x)
    videoEncoder.configure({
      codec: configuredCodec,
      width,
      height,
      bitrate: videoBitrate || defaultBitrate,
      framerate: fps,
      hardwareAcceleration: 'prefer-hardware',
      latencyMode: isMac ? 'quality' : 'realtime',
    } as any);

    // Setup zero-latency ondequeue backpressure (pure microsecond resolution on Mac, buffered on Windows)
    let queueDrainResolver: (() => void) | null = null;
    videoEncoder.ondequeue = () => {
      const threshold = isMac ? 8 : 4;
      if (queueDrainResolver && videoEncoder.encodeQueueSize <= threshold) {
        const resolve = queueDrainResolver;
        queueDrainResolver = null;
        resolve();
      }
    };

    // Start concurrent audio encoding in background while video frames render
    // Since audioRawData is already available, AAC compression runs concurrently without blocking video loop
    let audioEncodingPromise: Promise<void> | null = null;
    if (hasAudio && audioSource && e.data.audioRawData) {
      audioEncodingPromise = encodeAudioTrack(
        audioSource,
        e.data.audioRawData,
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

    let beatCursor = 0;

    try {
      for (let frameIdx = 0; frameIdx < totalFrames; frameIdx++) {
        if (encoderError) throw encoderError;

        const currentTime = frameIdx / fps;
        const timestampMicroseconds = Math.round(currentTime * 1_000_000);
        const isKeyFrame = frameIdx % (fps * 2) === 0;

        // 1. Determine Beat Hit (O(1) cursor with smooth exponential decay and clean resting clamp)
        let rawBeatFactor = 1.0;
        if (beats.length > 0) {
          while (beatCursor + 1 < beats.length && beats[beatCursor + 1] <= currentTime + 0.02) {
            beatCursor++;
          }
          const deltaT = currentTime - beats[beatCursor];
          if (deltaT >= 0 && deltaT < 0.32) {
            const energy = Math.exp(-deltaT / 0.16);
            if (energy > 0.01) {
              rawBeatFactor = 1.0 + energy * 0.25;
            }
          }
        } else {
          const beatInterval = 0.5;
          const phase = currentTime % beatInterval;
          if (phase < 0.32) {
            const energy = Math.exp(-phase / 0.16);
            if (energy > 0.01) {
              rawBeatFactor = 1.0 + energy * 0.25;
            }
          }
        }

        // 2. Frequency Data for Spectrum (Direct zero-cost read of pre-smoothed frames)
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
          videoFramesMap,
          videoDurationsMap
        );

        // 4. Render Video Overlays
        drawVideoOverlays(
          ctx,
          width,
          height,
          project.overlays?.videos,
          currentTime,
          rawBeatFactor,
          videoFramesMap,
          videoDurationsMap
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
        if (project.overlays.spectrums && project.overlays.spectrums.length > 0) {
          for (let sIdx = 0; sIdx < project.overlays.spectrums.length; sIdx++) {
            spectrum.render(ctx, width, height, project.overlays.spectrums[sIdx], currentFreq, rawBeatFactor);
          }
        } else if (project.overlays.spectrum) {
          spectrum.render(ctx, width, height, project.overlays.spectrum, currentFreq, rawBeatFactor);
        }
        lyrics.render(
          ctx,
          width,
          height,
          project.lyrics.config,
          project.lyrics.segments,
          currentTime,
          rawBeatFactor
        );

        // 6b. Free Use Dynamic Random Watermark (Zero allocation, ultra-lightweight)
        if (!isLicensed) {
          drawDynamicWatermark(ctx, currentTime, watermarkSeed, wmMetrics);
        }

        // 7. Create VideoFrame from OffscreenCanvas
        const frame = new VideoFrame(canvas, {
          timestamp: timestampMicroseconds,
          duration: Math.round((1 / fps) * 1_000_000),
        });


        // 8. Platform-optimized GPU Queue Backpressure
        // VideoToolbox on Apple Silicon reaches peak 7x-9x+ efficiency with a 24-frame depth
        // Windows iGPU/dGPU is kept safely bounded at 8-10 frames
        const maxQueue = isMac ? 24 : 8;
        if (videoEncoder.encodeQueueSize >= maxQueue) {
          await new Promise<void>((resolve) => {
            queueDrainResolver = resolve;
          });
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

      // Ensure concurrent audio track encoding has finished (already completed during video frames render!)
      if (audioEncodingPromise) {
        await audioEncodingPromise;
      }

      if (encoderError) {
        throw encoderError;
      }

      if (encodedVideoPacketsCount === 0) {
        throw new Error('Video encoder tidak menghasilkan frame paket. Pastikan resolusi dan durasi audio valid.');
      }

      self.postMessage({
        type: 'STAGE_CHANGE',
        stage: 'finalizing',
      });

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
 * If crop is specified, crops one-time during ImageBitmap creation so frame render loops do zero crop math!
 */
async function preloadBitmaps(
  items: Array<{ id: string; type?: string; url?: string; crop?: import('../../lib/types/project').CropRect }> | undefined
): Promise<Map<string, ImageBitmap>> {
  const map = new Map<string, ImageBitmap>();
  if (!items) return map;

  for (const item of items) {
    if ((!item.type || item.type === 'image') && item.url) {
      try {
        const resp = await fetch(item.url);
        const blob = await resp.blob();

        let bmp: ImageBitmap;
        if (item.crop && item.crop.width > 0 && item.crop.height > 0) {
          // Pre-decode full bitmap to get natural dimensions, then crop one-time
          const fullBmp = await createImageBitmap(blob);
          const fullW = fullBmp.width;
          const fullH = fullBmp.height;
          const sx = Math.max(0, Math.round(item.crop.x * fullW));
          const sy = Math.max(0, Math.round(item.crop.y * fullH));
          const sw = Math.min(fullW - sx, Math.round(item.crop.width * fullW));
          const sh = Math.min(fullH - sy, Math.round(item.crop.height * fullH));
          bmp = await createImageBitmap(fullBmp, sx, sy, sw, sh, { resizeQuality: 'high' });
          fullBmp.close();
        } else {
          bmp = await createImageBitmap(blob, { resizeQuality: 'high' });
        }
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
    // 16384 samples (~370ms per buffer) drastically cuts async Promise & memory loop overhead from 10k loops to <1k loops
    const chunkSize = 16384;

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

  // Allocate canvas with headroom to prevent continuous GC churn when scaling
  if (!workerChromaCanvas || workerChromaCanvas.width < w || workerChromaCanvas.height < h) {
    const targetW = Math.max(w, workerChromaCanvas ? workerChromaCanvas.width : 512);
    const targetH = Math.max(h, workerChromaCanvas ? workerChromaCanvas.height : 512);
    workerChromaCanvas = new OffscreenCanvas(targetW, targetH);
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
  bgItems: BackgroundItem[],
  currentTime: number,
  rawBeatFactor: number,
  bgBitmaps: Map<string, ImageBitmap>,
  videoFramesMap: Record<string, ImageBitmap[]>,
  videoDurationsMap: Record<string, number> = {}
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
    currentTime,
    bgBitmaps,
    videoFramesMap,
    videoDurationsMap
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
      currentTime,
      bgBitmaps,
      videoFramesMap,
      videoDurationsMap
    );
  }

  // Zero-overhead brightness adjustment (solid pass without expensive canvas filter)
  if (bgBrightness < 0.99) {
    ctx.save();
    ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(1.0, 1.0 - bgBrightness)})`;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  } else if (bgBrightness > 1.01) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(0.7, (bgBrightness - 1.0) * 0.55)})`;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }
}

function drawSingleBgItem(
  ctx: OffscreenCanvasRenderingContext2D,
  width: number,
  height: number,
  item: BackgroundItem,
  scaleMode: string = 'cover',
  scaleFactor: number,
  alpha: number,
  currentTime: number,
  bgBitmaps: Map<string, ImageBitmap>,
  videoFramesMap: Record<string, ImageBitmap[]>,
  videoDurationsMap: Record<string, number> = {}
): void {
  let sourceCanvas: CanvasImageSource | null = null;
  let natW = width;
  let natH = height;

  if (item.type === 'video') {
    const frames = videoFramesMap[item.id];
    if (frames && frames.length > 0) {
      const vidDur = videoDurationsMap[item.id] || 15;
      const progressInVid = (currentTime % vidDur) / vidDur;
      const frameIdx = Math.min(frames.length - 1, Math.floor(progressInVid * frames.length));
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

  // Since both video frames and static images are already pre-cropped during extraction/load,
  // we do zero per-frame crop slicing here!
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
  } else if (scaleMode === 'stretch') {
    drawW = width * scaleFactor;
    drawH = height * scaleFactor;
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
  videoFramesMap: Record<string, ImageBitmap[]>,
  videoDurationsMap: Record<string, number> = {}
): void {
  if (!videos || videos.length === 0) return;

  for (const item of videos) {
    const transState = computeOverlayTransition(
      currentTime,
      item.startTime,
      item.endTime,
      item.transition,
      item.transitionDuration,
      height
    );
    if (!transState.isVisible) continue;

    const frames = videoFramesMap[item.id];
    if (!frames || frames.length === 0) continue;

    const vidDur = videoDurationsMap[item.id] || 15;
    const progressInVid = (currentTime % vidDur) / vidDur;
    const frameIdx = Math.min(frames.length - 1, Math.floor(progressInVid * frames.length));
    const bmp = frames[frameIdx];
    if (!bmp) continue;

    const sens = item.beatSensitivity ?? 1.0;
    const beatFactor = 1.0 + (rawBeatFactor - 1.0) * sens;
    const posX = (item.x ?? 0.5) * width;
    let posY = (item.y ?? 0.5) * height + transState.offsetY;
    let drawAlpha = (item.opacity ?? 1.0) * transState.alphaMultiplier;
    let animScale = 1.0 * transState.scaleMultiplier;

    // Animation options
    if (item.animation === 'floating') {
      posY += Math.sin(currentTime * 2.5 + (item.x ?? 0.5) * 10) * 12;
    } else if (item.animation === 'pulse-beat') {
      if (item.followBeat) {
        animScale *= 1.0 + (beatFactor - 1.0) * 0.15;
      } else {
        animScale *= 1.0 + Math.sin(currentTime * 3) * 0.05;
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
    const transState = computeOverlayTransition(
      currentTime,
      imgItem.startTime,
      imgItem.endTime,
      imgItem.transition,
      imgItem.transitionDuration,
      height
    );
    if (!transState.isVisible) continue;

    const bmp = overlayBitmaps.get(imgItem.id);
    if (bmp) {
      const sens = imgItem.beatSensitivity ?? 1.0;
      const imgBeat = 1.0 + (rawBeatFactor - 1.0) * sens;

      const posX = (imgItem.x ?? 0.5) * width;
      let posY = (imgItem.y ?? 0.5) * height + transState.offsetY;
      let drawAlpha = (imgItem.opacity ?? 1.0) * transState.alphaMultiplier;
      let animScale = 1.0 * transState.scaleMultiplier;

      // Animation options
      if (imgItem.animation === 'floating') {
        posY += Math.sin(currentTime * 2.5 + (imgItem.x ?? 0.5) * 10) * 12 * scaleFactor;
      } else if (imgItem.animation === 'pulse-beat') {
        if (imgItem.followBeat) {
          animScale *= 1.0 + (imgBeat - 1.0) * 0.15;
        } else {
          animScale *= 1.0 + Math.sin(currentTime * 3) * 0.05;
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

/**
 * Aesthetic Non-Intrusive Watermark (Zero allocation, ultra-lightweight)
 * Positioned cleanly in the corner (bottom-right safe area) with elegant glassmorphism style,
 * crisp typography ("Made with Beras Visualizer"), and subtle wave bars.
 * Does not obscure center visuals, lyrics, or audio spectrum.
 */
function drawDynamicWatermark(
  ctx: OffscreenCanvasRenderingContext2D,
  currentTime: number,
  seed: number,
  m: {
    scale: number;
    paddingX: number;
    paddingY: number;
    fontSize: number;
    font: string;
    text: string;
    textWidth: number;
    waveWidth: number;
    waveGap: number;
    badgeWidth: number;
    badgeHeight: number;
    radius: number;
    x: number;
    y: number;
    barBaseX: number;
    barCenterY: number;
    barW: number;
    barSpacing: number;
    textX: number;
  }
) {
  ctx.save();

  // Subtle breathing opacity (0.78 ~ 0.92) - purely aesthetic & lively
  const breath = 0.85 + Math.sin(currentTime * 1.2 + seed) * 0.07;

  // Glassmorphism subtle capsule background at pre-calculated safe corner position
  ctx.translate(m.x, m.y);
  ctx.beginPath();
  ctx.roundRect(0, 0, m.badgeWidth, m.badgeHeight, m.radius);
  ctx.fillStyle = `rgba(10, 10, 14, ${0.45 * breath})`;
  ctx.fill();
  ctx.strokeStyle = `rgba(255, 255, 255, ${0.18 * breath})`;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Draw 3 small aesthetic equalizer bars on the left of the pill
  for (let i = 0; i < 3; i++) {
    const barH = Math.max(4, Math.round((8 + Math.sin(currentTime * 4.0 + i * 1.6) * 5) * m.scale));
    const bx = m.barBaseX + i * m.barSpacing;
    const by = m.barCenterY - barH / 2;

    ctx.beginPath();
    ctx.roundRect(bx, by, m.barW, barH, Math.max(1, m.barW / 2));
    ctx.fillStyle = i === 1 
      ? `rgba(6, 182, 212, ${0.90 * breath})` // Cyan highlight
      : `rgba(255, 255, 255, ${0.75 * breath})`;
    ctx.fill();
  }

  // Draw modern clean text with pre-cached typography font
  ctx.font = m.font;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = `rgba(255, 255, 255, ${0.90 * breath})`;
  ctx.fillText(m.text, m.textX, m.badgeHeight / 2);

  ctx.restore();
}


