import type { SpectrumConfig } from '../types/project';

export class SpectrumRenderer {
  render(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    width: number,
    height: number,
    config: SpectrumConfig,
    frequencies: Uint8Array | Float32Array,
    rawBeatFactor: number = 1.0
  ) {
    if (!config.enabled || frequencies.length === 0) return;

    const scaleFactor = Math.min(width / 1920, height / 1080);

    // Apply calm & natural independent sensitivity multiplier
    const sensitivity = config.beatSensitivity ?? 1.0;
    const beatFactor = 1.0 + (rawBeatFactor - 1.0) * sensitivity;
    const spectrumBeatMultiplier = config.followBeat ? 1 + (beatFactor - 1) * 0.35 : 1.0;

    ctx.save();
    ctx.globalAlpha = config.opacity;

    const posX = (config.x ?? 0.5) * width;
    const posY = (config.y ?? 0.5) * height;
    const scale = (config.scale ?? 1.0) * scaleFactor;

    const count = Math.min(config.barCount, frequencies.length);

    if (config.style === 'circular') {
      const radius = config.radius * scale * (config.followBeat ? 1 + (beatFactor - 1) * 0.08 : 1.0);
      const angleStep = (Math.PI * 2) / count;

      for (let i = 0; i < count; i++) {
        const val = frequencies[i] / 255;
        const barHeight = Math.max(4 * scaleFactor, val * config.height * scale * spectrumBeatMultiplier);
        const angle = i * angleStep;

        const x1 = posX + Math.cos(angle) * radius;
        const y1 = posY + Math.sin(angle) * radius;
        const x2 = posX + Math.cos(angle) * (radius + barHeight);
        const y2 = posY + Math.sin(angle) * (radius + barHeight);

        const grad = ctx.createLinearGradient(x1, y1, x2, y2);
        grad.addColorStop(0, config.color);
        grad.addColorStop(1, config.secondaryColor);

        ctx.strokeStyle = grad;
        ctx.lineWidth = Math.max(2 * scaleFactor, (Math.PI * 2 * radius) / count - (2 * scaleFactor));
        ctx.lineCap = 'round';

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
    } else if (config.style === 'bars') {
      const totalWidth = width * 0.7 * (config.scale ?? 1.0);
      const startX = posX - totalWidth / 2;
      const barWidth = totalWidth / count - (4 * scaleFactor);
      const baseY = posY;

      for (let i = 0; i < count; i++) {
        const val = frequencies[i] / 255;
        const barHeight = Math.max(4 * scaleFactor, val * config.height * scale * spectrumBeatMultiplier);
        const x = startX + i * (barWidth + (4 * scaleFactor));
        const y = baseY - barHeight;

        const grad = ctx.createLinearGradient(x, baseY, x, y);
        grad.addColorStop(0, config.color);
        grad.addColorStop(1, config.secondaryColor);

        ctx.fillStyle = grad;
        ctx.fillRect(x, y, barWidth, barHeight);
      }
    } else if (config.style === 'waveform') {
      const totalWidth = width * 0.7 * (config.scale ?? 1.0);
      const startX = posX - totalWidth / 2;
      const stepX = totalWidth / count;
      const baseY = posY;

      ctx.beginPath();
      ctx.strokeStyle = config.color;
      ctx.lineWidth = 4 * scale * spectrumBeatMultiplier;
      ctx.lineJoin = 'round';

      for (let i = 0; i < count; i++) {
        const val = (frequencies[i] - 128) / 128;
        const y = baseY + val * config.height * scale * spectrumBeatMultiplier;
        const x = startX + i * stepX;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    } else if (config.style === 'radial-bars') {
      const innerRadius = config.radius * 0.5 * scale;
      const outerRadius = config.radius * scale;
      const angleStep = (Math.PI * 2) / count;

      for (let i = 0; i < count; i++) {
        const val = frequencies[i] / 255;
        const angle = i * angleStep;
        const r = innerRadius + val * (outerRadius - innerRadius) * spectrumBeatMultiplier;

        const x = posX + Math.cos(angle) * r;
        const y = posY + Math.sin(angle) * r;

        ctx.fillStyle = i % 2 === 0 ? config.color : config.secondaryColor;
        ctx.beginPath();
        ctx.arc(x, y, 4 * scale, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }
}

