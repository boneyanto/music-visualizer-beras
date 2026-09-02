import type { VideoOverlayItem } from '../types/project';

export class VideoOverlayManager {
  private videoElements = new Map<string, HTMLVideoElement>();
  private tempCanvas: HTMLCanvasElement | OffscreenCanvas | null = null;
  private tempCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;

  async loadVideo(item: VideoOverlayItem): Promise<HTMLVideoElement> {
    if (this.videoElements.has(item.id)) {
      return this.videoElements.get(item.id)!;
    }
    const vid = document.createElement('video');
    vid.crossOrigin = 'anonymous';
    vid.src = item.url;
    vid.muted = true;
    vid.playsInline = true;
    vid.loop = true;
    await new Promise((resolve) => {
      vid.onloadeddata = resolve;
    });
    this.videoElements.set(item.id, vid);
    return vid;
  }

  releaseAsset(id: string) {
    const vid = this.videoElements.get(id);
    if (vid) {
      vid.pause();
      vid.removeAttribute('src');
      vid.load();
      this.videoElements.delete(id);
    }
  }

  purgeUnused(activeIds: Set<string>) {
    for (const [id, vid] of this.videoElements.entries()) {
      if (!activeIds.has(id)) {
        vid.pause();
        vid.removeAttribute('src');
        vid.load();
        this.videoElements.delete(id);
      }
    }
  }

  syncPlayback(isPlaying: boolean, currentTime: number) {
    this.videoElements.forEach((vid) => {
      if (isPlaying) {
        if (vid.paused) vid.play().catch(() => {});
        if (Math.abs(vid.currentTime - (currentTime % (vid.duration || 10))) > 0.3) {
          vid.currentTime = currentTime % (vid.duration || 10);
        }
      } else {
        if (!vid.paused) vid.pause();
      }
    });
  }

  render(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    width: number,
    height: number,
    items: VideoOverlayItem[],
    currentTime: number,
    beatFactorMap: Record<string, number>
  ) {
    if (!items || items.length === 0) return;

    for (const item of items) {
      const vid = this.videoElements.get(item.id);
      if (!vid || vid.readyState < 2) continue;

      const beatFactor = beatFactorMap[item.id] ?? 1.0;
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
        drawAlpha *= (0.6 + Math.sin(currentTime * 4) * 0.4);
      } else if (item.animation === 'glow-pulse') {
        drawAlpha *= (0.75 + Math.sin(currentTime * 5) * 0.25);
      }

      const baseScale = item.scale ?? 1.0;
      const beatScale = item.followBeat ? 1 + (beatFactor - 1) * 0.2 : 1.0;
      const scale = baseScale * beatScale * animScale;

      const vidW = vid.videoWidth || 640;
      const vidH = vid.videoHeight || 360;
      const drawW = vidW * scale;
      const drawH = vidH * scale;

      ctx.save();
      ctx.globalAlpha = drawAlpha;
      ctx.globalCompositeOperation = (item.blendMode as GlobalCompositeOperation) || 'source-over';
      ctx.translate(posX, posY);

      if (item.chromaKey?.enabled) {
        this.renderChromaKey(ctx, vid, drawW, drawH, item.chromaKey);
      } else {
        ctx.drawImage(vid, -drawW / 2, -drawH / 2, drawW, drawH);
      }

      ctx.restore();
    }
  }

  private renderChromaKey(
    targetCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    vid: HTMLVideoElement,
    drawW: number,
    drawH: number,
    chroma: { color: string; similarity: number; smoothness: number }
  ) {
    const w = Math.round(drawW);
    const h = Math.round(drawH);
    if (w <= 0 || h <= 0) return;

    if (!this.tempCanvas || this.tempCanvas.width !== w || this.tempCanvas.height !== h) {
      this.tempCanvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : document.createElement('canvas');
      this.tempCanvas.width = w;
      this.tempCanvas.height = h;
      this.tempCtx = this.tempCanvas.getContext('2d') as any;
    }

    if (!this.tempCtx) return;

    this.tempCtx.drawImage(vid, 0, 0, w, h);
    const imgData = this.tempCtx.getImageData(0, 0, w, h);
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

    this.tempCtx.putImageData(imgData, 0, 0);
    targetCtx.drawImage(this.tempCanvas as any, -drawW / 2, -drawH / 2);
  }
}

export const videoOverlayManager = new VideoOverlayManager();
