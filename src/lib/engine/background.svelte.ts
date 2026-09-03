import type { BackgroundConfig, BackgroundItem, ScaleMode } from '../types/project';

export class BackgroundManager {
  private imageCache = new Map<string, HTMLImageElement | ImageBitmap>();
  private videoCache = new Map<string, HTMLVideoElement>();

  async loadAsset(item: BackgroundItem): Promise<HTMLImageElement | HTMLVideoElement> {
    if (item.type === 'image') {
      const existing = this.imageCache.get(item.id) as HTMLImageElement | undefined;
      if (existing && existing.src === item.url && existing.complete && existing.naturalWidth > 0) {
        return existing;
      }
      if (existing) {
        this.releaseAsset(item.id);
      }
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = item.url;
        img.onload = () => {
          this.imageCache.set(item.id, img);
          resolve(img);
        };
        img.onerror = (err) => {
          console.warn('Failed to load background image:', item.name, err);
          reject(err);
        };
      });
    } else {
      const existing = this.videoCache.get(item.id);
      if (existing && existing.src === item.url && existing.readyState >= 2) {
        return existing;
      }
      if (existing) {
        this.releaseAsset(item.id);
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
      this.videoCache.set(item.id, vid);
      return vid;
    }
  }

  releaseAsset(id: string) {
    if (this.imageCache.has(id)) {
      const img = this.imageCache.get(id);
      if (img && 'src' in img) (img as HTMLImageElement).src = '';
      this.imageCache.delete(id);
    }
    if (this.videoCache.has(id)) {
      const vid = this.videoCache.get(id);
      if (vid) {
        vid.pause();
        vid.removeAttribute('src');
        vid.load();
      }
      this.videoCache.delete(id);
    }
  }

  purgeUnused(activeIds: Set<string>) {
    for (const [id, img] of this.imageCache.entries()) {
      if (!activeIds.has(id)) {
        if ('src' in img) (img as HTMLImageElement).src = '';
        this.imageCache.delete(id);
      }
    }
    for (const [id, vid] of this.videoCache.entries()) {
      if (!activeIds.has(id)) {
        vid.pause();
        vid.removeAttribute('src');
        vid.load();
        this.videoCache.delete(id);
      }
    }
  }

  render(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    width: number,
    height: number,
    config: BackgroundConfig,
    currentTime: number,
    rawBeatFactor: number = 1.0
  ) {
    const sensitivity = config.beatSensitivity ?? 1.0;
    const beatFactor = 1.0 + (rawBeatFactor - 1.0) * sensitivity;
    const bgScaleFactor = config.followBeat ? 1 + (beatFactor - 1) * 0.03 : 1.0;
    const brightness = config.brightness ?? 1.0;

    if (!config.items || config.items.length === 0) {
      ctx.fillStyle = '#0a0a0c';
      ctx.fillRect(0, 0, width, height);

      const bgGrad = ctx.createRadialGradient(
        width / 2,
        height / 2,
        50,
        width / 2,
        height / 2,
        Math.max(width, height) / 1.5
      );
      bgGrad.addColorStop(0, beatFactor > 1.05 ? 'rgba(35, 25, 75, 0.45)' : 'rgba(20, 18, 50, 0.25)');
      bgGrad.addColorStop(1, 'rgba(10, 10, 12, 1)');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);
      return;
    }

    const totalItems = config.items.length;
    let activeItem: BackgroundItem;
    let nextItem: BackgroundItem | null = null;
    let blendFactor = 0;

    if (totalItems === 1 || config.type === 'single-image' || config.type === 'single-video') {
      activeItem = config.items[0];
    } else {
      // 30 images in slideshow: calculate exact active slide without leaks
      const itemDuration = config.items[0]?.duration || 5.0;
      const cycleIndex = Math.floor(currentTime / itemDuration) % totalItems;
      const progressInItem = (currentTime % itemDuration) / itemDuration;

      activeItem = config.items[cycleIndex];
      const nextIndex = (cycleIndex + 1) % totalItems;
      nextItem = config.items[nextIndex];

      const transDurationNorm = (config.transitionDuration || 1.0) / itemDuration;
      if (progressInItem > 1 - transDurationNorm && config.transition === 'crossfade') {
        blendFactor = (progressInItem - (1 - transDurationNorm)) / transDurationNorm;
      }
    }

    this.drawMediaItem(ctx, width, height, activeItem, config.scaleMode, bgScaleFactor, 1.0 - (blendFactor > 0 ? blendFactor * 0.5 : 0), brightness);

    if (nextItem && blendFactor > 0 && config.transition === 'crossfade') {
      ctx.save();
      ctx.globalAlpha = blendFactor;
      this.drawMediaItem(ctx, width, height, nextItem, config.scaleMode, bgScaleFactor, 1.0, brightness);
      ctx.restore();
    }
  }

  private drawMediaItem(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    canvasWidth: number,
    canvasHeight: number,
    item: BackgroundItem,
    scaleMode: ScaleMode,
    scaleMultiplier: number,
    alpha: number,
    brightness: number = 1.0
  ) {
    const media = item.type === 'image' ? this.imageCache.get(item.id) : this.videoCache.get(item.id);
    if (!media) return;

    const naturalWidth = (media as HTMLImageElement).naturalWidth || (media as HTMLVideoElement).videoWidth || canvasWidth;
    const naturalHeight = (media as HTMLImageElement).naturalHeight || (media as HTMLVideoElement).videoHeight || canvasHeight;

    let drawWidth = canvasWidth;
    let drawHeight = canvasHeight;
    let drawX = 0;
    let drawY = 0;

    if (scaleMode === 'cover') {
      const scale = Math.max(canvasWidth / naturalWidth, canvasHeight / naturalHeight) * scaleMultiplier;
      drawWidth = naturalWidth * scale;
      drawHeight = naturalHeight * scale;
      drawX = (canvasWidth - drawWidth) / 2;
      drawY = (canvasHeight - drawHeight) / 2;
    } else if (scaleMode === 'contain') {
      const scale = Math.min(canvasWidth / naturalWidth, canvasHeight / naturalHeight) * scaleMultiplier;
      drawWidth = naturalWidth * scale;
      drawHeight = naturalHeight * scale;
      drawX = (canvasWidth - drawWidth) / 2;
      drawY = (canvasHeight - drawHeight) / 2;
    }

    ctx.save();
    ctx.globalAlpha = alpha;
    if (brightness !== 1.0) {
      // High-performance canvas filter
      ctx.filter = `brightness(${brightness})`;
    }
    ctx.drawImage(media, drawX, drawY, drawWidth, drawHeight);
    ctx.restore();
  }
}

export const backgroundManager = new BackgroundManager();
