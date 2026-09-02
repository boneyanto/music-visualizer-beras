import type { TextOverlayItem } from '../types/project';

export class TextOverlayManager {
  render(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    canvasWidth: number,
    canvasHeight: number,
    texts: TextOverlayItem[],
    currentTime: number,
    rawBeatFactor: number = 1.0
  ) {
    if (!texts || texts.length === 0) return;

    // Relative reference scale: Default canvas resolution is 1920x1080
    const scaleFactor = Math.min(canvasWidth / 1920, canvasHeight / 1080);

    for (const item of texts) {
      if (!item.text) continue;

      const sensitivity = item.beatSensitivity ?? 1.0;
      const beatFactor = 1.0 + (rawBeatFactor - 1.0) * sensitivity;

      const posX = item.x * canvasWidth;
      let posY = item.y * canvasHeight;
      const baseFontSize = (item.fontSize || 36) * scaleFactor;
      let finalFontSize = baseFontSize;
      let drawAlpha = item.opacity ?? 1.0;
      let displayText = item.text;
      let customShadowBlur = 8 * scaleFactor;
      let customShadowColor = item.shadowColor || 'rgba(0, 0, 0, 0.9)';

      // 1. Process Animations
      if (item.animation === 'pulse-beat') {
        if (item.followBeat) {
          finalFontSize = baseFontSize * (1 + (beatFactor - 1) * 0.15);
        } else {
          finalFontSize = baseFontSize * (1 + Math.sin(currentTime * 3) * 0.05);
        }
      } else if (item.animation === 'floating') {
        const floatOffset = Math.sin(currentTime * 2.5 + item.x * 10) * 12 * scaleFactor;
        posY += floatOffset;
      } else if (item.animation === 'shimmer') {
        const shimmerAlpha = 0.6 + Math.sin(currentTime * 4) * 0.4;
        drawAlpha *= shimmerAlpha;
      } else if (item.animation === 'glow-pulse') {
        // Dynamic glowing pulsating aura effect
        const pulse = 0.5 + 0.5 * Math.sin(currentTime * 4.5);
        const beatBoost = item.followBeat ? (beatFactor - 1.0) * 1.5 : 0;
        
        customShadowBlur = (10 + (pulse * 14) + (beatBoost * 12)) * scaleFactor;
        customShadowColor = item.accentColor || item.color || '#38bdf8';
        drawAlpha = Math.min(1.0, drawAlpha * (0.8 + 0.2 * pulse + beatBoost * 0.2));
        finalFontSize = baseFontSize * (1.0 + (pulse * 0.04) + (beatBoost * 0.06));
      } else if (item.animation === 'typewriter') {
        const loopDuration = 4.5;
        const typingDuration = 3.0;
        const progressInLoop = (currentTime % loopDuration);
        if (progressInLoop < typingDuration) {
          const charCount = Math.max(1, Math.floor((progressInLoop / typingDuration) * item.text.length));
          displayText = item.text.slice(0, charCount);
        } else {
          displayText = item.text;
        }
      }

      ctx.save();
      ctx.globalAlpha = drawAlpha;
      ctx.textAlign = item.alignment || 'center';
      ctx.textBaseline = 'middle';

      const font = item.fontFamily || 'Inter';
      ctx.font = `bold ${finalFontSize}px "${font}", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;

      // 2. Position & Rotation
      ctx.translate(posX, posY);
      if (item.rotation) {
        ctx.rotate((item.rotation * Math.PI) / 180);
      }

      // 3. Shadow / Glow
      if (item.shadow || item.animation === 'glow-pulse') {
        ctx.shadowColor = customShadowColor;
        ctx.shadowBlur = customShadowBlur;
        ctx.shadowOffsetX = item.animation === 'glow-pulse' ? 0 : 2 * scaleFactor;
        ctx.shadowOffsetY = item.animation === 'glow-pulse' ? 0 : 3 * scaleFactor;
      }

      // 4. Draw Text
      ctx.fillStyle = item.color || '#ffffff';
      ctx.fillText(displayText, 0, 0);

      ctx.restore();
    }
  }
}

export const textOverlayManager = new TextOverlayManager();
