import type { TracklistOverlayConfig, AudioTrackItem } from '../types/project';

export class TracklistOverlayRenderer {
  render(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    canvasWidth: number,
    canvasHeight: number,
    config: TracklistOverlayConfig | undefined,
    tracks: AudioTrackItem[] | undefined,
    currentTime: number,
    rawBeatFactor: number = 1.0
  ) {
    if (!config || !config.enabled || !tracks || tracks.length === 0) return;

    const scaleFactor = Math.min(canvasWidth / 1920, canvasHeight / 1080);

    // 1. Calculate Active Playing Track Index & Progress
    let accumulatedTime = 0;
    let activeTrackIndex = -1;
    let trackProgress = 0;
    const trackRanges: Array<{ index: number; name: string; start: number; end: number; duration: number }> = [];

    tracks.forEach((t, idx) => {
      const dur = t.duration || 0;
      const start = accumulatedTime;
      const end = accumulatedTime + dur;
      const cleanName = t.name.replace(/\.[^/.]+$/, '').trim();

      trackRanges.push({
        index: idx + 1,
        name: cleanName,
        start,
        end,
        duration: dur,
      });

      if (currentTime >= start && (currentTime < end || idx === tracks.length - 1)) {
        activeTrackIndex = idx;
        trackProgress = dur > 0 ? (currentTime - start) / dur : 0;
      }

      accumulatedTime = end;
    });

    if (activeTrackIndex === -1 && tracks.length > 0) {
      activeTrackIndex = 0;
    }

    const sens = config.beatSensitivity ?? 1.0;
    const beatFactor = 1.0 + (rawBeatFactor - 1.0) * sens;

    ctx.save();
    ctx.globalAlpha = config.opacity ?? 1.0;
    ctx.textAlign = config.alignment || 'left';
    ctx.textBaseline = 'middle';

    const startX = (config.x ?? 0.08) * canvasWidth;
    let currentY = (config.y ?? 0.15) * canvasHeight;
    const font = config.fontFamily || 'Inter';
    const baseFontSize = (config.fontSize || 26) * scaleFactor;
    const lineSpacing = (config.lineSpacing || 44) * scaleFactor;

    // 2. Render Header Title if Enabled
    if (config.showTitle && config.title) {
      const titleSize = (config.titleFontSize || 38) * scaleFactor;
      ctx.font = `bold ${titleSize}px "${font}", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
      ctx.fillStyle = config.accentColor || '#38bdf8';

      if (config.shadow) {
        ctx.shadowColor = config.shadowColor || 'rgba(0, 0, 0, 0.9)';
        ctx.shadowBlur = 10 * scaleFactor;
        ctx.shadowOffsetX = 2 * scaleFactor;
        ctx.shadowOffsetY = 3 * scaleFactor;
      }

      ctx.fillText(config.title, startX, currentY);
      currentY += titleSize + (18 * scaleFactor);

      // Draw subtle accent underline
      ctx.strokeStyle = config.accentColor || '#38bdf8';
      ctx.lineWidth = 2.5 * scaleFactor;
      ctx.beginPath();
      if (config.alignment === 'center') {
        ctx.moveTo(startX - 120 * scaleFactor, currentY - 8 * scaleFactor);
        ctx.lineTo(startX + 120 * scaleFactor, currentY - 8 * scaleFactor);
      } else if (config.alignment === 'right') {
        ctx.moveTo(startX - 240 * scaleFactor, currentY - 8 * scaleFactor);
        ctx.lineTo(startX, currentY - 8 * scaleFactor);
      } else {
        ctx.moveTo(startX, currentY - 8 * scaleFactor);
        ctx.lineTo(startX + 240 * scaleFactor, currentY - 8 * scaleFactor);
      }
      ctx.stroke();

      currentY += 16 * scaleFactor;
    }

    // 3. Render Each Track Item
    trackRanges.forEach((tr, idx) => {
      const isActive = idx === activeTrackIndex;
      let lineFontSize = baseFontSize;
      let lineAlpha = isActive ? 1.0 : 0.65;
      let itemY = currentY;
      let itemX = startX;

      // Construct track text
      const numPrefix = config.showNumbers ? `${tr.index.toString().padStart(2, '0')}. ` : '';
      const durSuffix = config.showDuration ? ` (${this.formatDuration(tr.duration)})` : '';
      const fullText = `${numPrefix}${tr.name}${durSuffix}`;

      ctx.save();

      // Apply Specific Now-Playing Animation ONLY to the Active Track
      if (isActive) {
        const anim = config.nowPlayingAnimation || 'glow-badge';

        if (anim === 'bounce-pulse') {
          if (config.followBeat) {
            lineFontSize = baseFontSize * (1.0 + (beatFactor - 1.0) * 0.22);
          } else {
            lineFontSize = baseFontSize * (1.0 + Math.sin(currentTime * 4) * 0.08);
          }
        } else if (anim === 'glow-badge') {
          const glowPulse = 0.85 + Math.sin(currentTime * 5) * 0.15;
          lineAlpha = glowPulse;
          ctx.shadowColor = config.activeColor || '#38bdf8';
          ctx.shadowBlur = (14 + Math.sin(currentTime * 6) * 5) * scaleFactor;
        } else if (anim === 'sliding-accent') {
          const slideOffset = Math.sin(currentTime * 3) * 6 * scaleFactor;
          itemX += config.alignment === 'right' ? -slideOffset : slideOffset;
        } else if (anim === 'karaoke-gradient') {
          lineFontSize = baseFontSize * (1.0 + (beatFactor - 1.0) * 0.1);
        }
      }

      ctx.font = `${isActive ? 'bold' : '500'} ${lineFontSize}px "${font}", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;

      // Set Shadow
      if (config.shadow && !isActive) {
        ctx.shadowColor = config.shadowColor || 'rgba(0, 0, 0, 0.9)';
        ctx.shadowBlur = 6 * scaleFactor;
        ctx.shadowOffsetX = 2 * scaleFactor;
        ctx.shadowOffsetY = 2 * scaleFactor;
      }

      ctx.globalAlpha = lineAlpha;

      // Dynamic Equalizer Animated Bars Icon for Active Track
      if (isActive && config.nowPlayingAnimation === 'equalizer-indicator') {
        this.renderMiniEqualizer(ctx, itemX, itemY, lineFontSize, config.activeColor || '#38bdf8', currentTime, beatFactor, config.alignment, scaleFactor);
      }

      // Fill Track Text
      if (isActive) {
        ctx.fillStyle = config.activeColor || '#38bdf8';
      } else {
        ctx.fillStyle = config.color || '#ffffff';
      }

      ctx.fillText(fullText, itemX, itemY);

      // Now Playing Badge / Marker Indicator
      if (isActive && config.nowPlayingAnimation === 'glow-badge') {
        this.renderNowPlayingIndicator(ctx, itemX, itemY, lineFontSize, config.activeColor || '#38bdf8', currentTime, config.alignment, scaleFactor);
      }

      ctx.restore();
      currentY += lineSpacing;
    });

    ctx.restore();
  }

  /**
   * Animated audio equalizer bars icon rendered beside the active track
   */
  private renderMiniEqualizer(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    x: number,
    y: number,
    fontSize: number,
    color: string,
    time: number,
    beatFactor: number,
    alignment: 'left' | 'center' | 'right',
    scaleFactor: number
  ) {
    const barWidth = 3 * scaleFactor;
    const gap = 2 * scaleFactor;
    const numBars = 3;
    const iconW = numBars * barWidth + (numBars - 1) * gap;
    const iconX = alignment === 'right' ? x + (15 * scaleFactor) : x - iconW - (12 * scaleFactor);

    ctx.save();
    ctx.fillStyle = color;
    for (let b = 0; b < numBars; b++) {
      const barH = (Math.sin(time * 8 + b * 2) * 0.4 + 0.6) * fontSize * 0.7 * (beatFactor > 1.1 ? 1.3 : 1.0);
      const bx = iconX + b * (barWidth + gap);
      const by = y + (fontSize * 0.35) - barH;
      ctx.fillRect(bx, by, barWidth, barH);
    }
    ctx.restore();
  }

  /**
   * Glowing pulsing dot beside active track
   */
  private renderNowPlayingIndicator(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    x: number,
    y: number,
    fontSize: number,
    color: string,
    time: number,
    alignment: 'left' | 'center' | 'right',
    scaleFactor: number
  ) {
    const dotRadius = (3.5 + Math.sin(time * 5) * 1.5) * scaleFactor;
    const dotX = alignment === 'right' ? x + (18 * scaleFactor) : x - (18 * scaleFactor);
    ctx.save();
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8 * scaleFactor;
    ctx.beginPath();
    ctx.arc(dotX, y, dotRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
}

export const tracklistOverlayRenderer = new TracklistOverlayRenderer();
