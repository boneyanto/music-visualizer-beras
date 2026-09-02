import type { ImageOverlayItem } from '../types/project';

export class ImageOverlayManager {
  private imageCache = new Map<string, HTMLImageElement>();

  async preloadImage(item: ImageOverlayItem): Promise<HTMLImageElement> {
    if (this.imageCache.has(item.id)) {
      return this.imageCache.get(item.id)!;
    }
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = item.url;
      img.onload = () => {
        this.imageCache.set(item.id, img);
        resolve(img);
      };
      img.onerror = reject;
    });
  }

  releaseAsset(id: string) {
    const img = this.imageCache.get(id);
    if (img) {
      img.src = '';
      this.imageCache.delete(id);
    }
  }

  purgeUnused(activeIds: Set<string>) {
    for (const [id, img] of this.imageCache.entries()) {
      if (!activeIds.has(id)) {
        img.src = '';
        this.imageCache.delete(id);
      }
    }
  }

  render(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    width: number,
    height: number,
    items: ImageOverlayItem[],
    currentTime: number = 0,
    rawBeatFactor: number = 1.0
  ) {
    if (!items || items.length === 0) return;

    const scaleFactor = Math.min(width / 1920, height / 1080);

    for (const item of items) {
      const img = this.imageCache.get(item.id);
      if (!img) continue;

      const sensitivity = item.beatSensitivity ?? 1.0;
      const beatFactor = 1.0 + (rawBeatFactor - 1.0) * sensitivity;

      const posX = (item.x ?? 0.5) * width;
      let posY = (item.y ?? 0.5) * height;
      let drawAlpha = item.opacity ?? 1.0;
      let animScale = 1.0;

      // Animation options
      if (item.animation === 'floating') {
        posY += Math.sin(currentTime * 2.5 + (item.x ?? 0.5) * 10) * 12 * scaleFactor;
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

      const baseScale = (item.scale ?? 1.0) * scaleFactor;
      const beatScale = item.followBeat ? 1 + (beatFactor - 1) * 0.25 : 1.0;
      const scale = baseScale * beatScale * animScale;

      const naturalW = img.naturalWidth || 200;
      const naturalH = img.naturalHeight || 200;
      const drawW = naturalW * scale;
      const drawH = naturalH * scale;

      ctx.save();
      ctx.globalAlpha = drawAlpha;
      ctx.translate(posX, posY);

      if (item.rotation) {
        ctx.rotate((item.rotation * Math.PI) / 180);
      }

      ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
      ctx.restore();
    }
  }
}

export const imageOverlayManager = new ImageOverlayManager();
