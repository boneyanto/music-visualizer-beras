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
import type { ProjectConfig, ImageOverlayItem } from '../types/project';

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
}

self.onmessage = async (e: MessageEvent<RenderRequest | { type: 'CANCEL' }>) => {
  if (e.data.type === 'CANCEL') {
    self.postMessage({ type: 'CANCELLED' });
    return;
  }

  if (e.data.type === 'START_RENDER') {
    const { project, frequencyFrames, beats, frameDuration, sampleRate } = e.data;
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

    videoEncoder.configure({
      codec: avcCodec,
      width,
      height,
      bitrate: videoBitrate || (width <= 1280 ? 4_000_000 : 8_000_000),
      framerate: fps,
      hardwareAcceleration: 'prefer-hardware',
      latencyMode: 'quality',
    } as any);

    // Setup zero-latency ondequeue backpressure (Prevents OOM & keeps render speed maximal)
    let queueDrainResolver: (() => void) | null = null;
    videoEncoder.ondequeue = () => {
      if (videoEncoder.encodeQueueSize <= 10 && queueDrainResolver) {
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

        // Zero-latency GPU Queue Backpressure via ondequeue event (No setTimeout stall)
        if (videoEncoder.encodeQueueSize > 20) {
          await new Promise<void>((resolve) => {
            queueDrainResolver = resolve;
          });
        }

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

        // 3. Render Background Image / Multi-Slideshow
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
          bgBitmaps
        );

        // 4. Render Image Overlays
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

        // 8. Backpressure check & Encode VideoFrame
        // Caps uncompressed frame buffer to <= 20 frames, preventing gigabyte RAM bloat & swap
        if (videoEncoder.encodeQueueSize > 20) {
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
          currentFPS = Math.min(300, Math.max(30, currentFPS));

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
        const bmp = await createImageBitmap(blob);
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

/**
 * Draws background image or slideshow transition
 */
function drawBackground(
  ctx: OffscreenCanvasRenderingContext2D,
  width: number,
  height: number,
  bgConfig: ProjectConfig['background'],
  bgItems: Array<{ id: string; duration?: number }>,
  currentTime: number,
  rawBeatFactor: number,
  bgBitmaps: Map<string, ImageBitmap>
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

  const bmp = bgBitmaps.get(activeItem.id);
  if (bmp) {
    const bgSens = bgConfig.beatSensitivity ?? 1.0;
    const bgBeat = 1.0 + (rawBeatFactor - 1.0) * bgSens;
    const scaleFactor = bgConfig.followBeat ? 1 + (bgBeat - 1) * 0.03 : 1.0;

    const targetScale = Math.max(width / bmp.width, height / bmp.height) * scaleFactor;
    const drawW = bmp.width * targetScale;
    const drawH = bmp.height * targetScale;
    const drawX = (width - drawW) / 2;
    const drawY = (height - drawH) / 2;

    ctx.save();
    ctx.globalAlpha = 1.0 - (blendFactor > 0 ? blendFactor * 0.5 : 0);
    if (bgBrightness !== 1.0) {
      ctx.filter = `brightness(${bgBrightness})`;
    }
    ctx.drawImage(bmp, drawX, drawY, drawW, drawH);
    ctx.restore();
  }

  // Crossfade next slide
  if (nextItem && blendFactor > 0 && bgConfig.transition === 'crossfade') {
    const nextBmp = bgBitmaps.get(nextItem.id);
    if (nextBmp) {
      const targetScale = Math.max(width / nextBmp.width, height / nextBmp.height);
      const drawW = nextBmp.width * targetScale;
      const drawH = nextBmp.height * targetScale;
      const drawX = (width - drawW) / 2;
      const drawY = (height - drawH) / 2;

      ctx.save();
      ctx.globalAlpha = blendFactor;
      if (bgBrightness !== 1.0) {
        ctx.filter = `brightness(${bgBrightness})`;
      }
      ctx.drawImage(nextBmp, drawX, drawY, drawW, drawH);
      ctx.restore();
    }
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

