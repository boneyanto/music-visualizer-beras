import type { SpectrumConfig } from '../../lib/types/project';

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

    // If mirror is enabled, create symmetrical frequency buffer (low frequencies in center or mirrored halves)
    let freqData: Uint8Array | Float32Array = frequencies;
    if (config.mirror && count > 2) {
      const mirrored = new Float32Array(count);
      const half = Math.ceil(count / 2);
      for (let i = 0; i < half; i++) {
        // Read low-to-high from original frequencies
        const srcVal = frequencies[Math.floor((i / half) * (frequencies.length / 2))] || 0;
        // Place mirrored on left and right sides
        mirrored[half - 1 - i] = srcVal;
        if (half + i < count) {
          mirrored[half + i] = srcVal;
        }
      }
      freqData = mirrored;
    }

    if (config.style === 'circular') {
      const radius = config.radius * scale * (config.followBeat ? 1 + (beatFactor - 1) * 0.08 : 1.0);
      const angleStep = (Math.PI * 2) / count;

      for (let i = 0; i < count; i++) {
        const val = freqData[i] / 255;
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
        const val = freqData[i] / 255;
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
        const val = (freqData[i] - 128) / 128;
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
        const val = freqData[i] / 255;
        const angle = i * angleStep;
        const r = innerRadius + val * (outerRadius - innerRadius) * spectrumBeatMultiplier;

        const x = posX + Math.cos(angle) * r;
        const y = posY + Math.sin(angle) * r;

        ctx.fillStyle = i % 2 === 0 ? config.color : config.secondaryColor;
        ctx.beginPath();
        ctx.arc(x, y, 4 * scale, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (config.style === 'center-bars') {
      // Monstercat / NCS style: symmetric bars blooming both up and down from the center line
      const totalWidth = width * 0.75 * (config.scale ?? 1.0);
      const startX = posX - totalWidth / 2;
      const barWidth = Math.max(3 * scaleFactor, totalWidth / count - (3 * scaleFactor));
      const baseY = posY;

      for (let i = 0; i < count; i++) {
        const val = freqData[i] / 255;
        const halfHeight = Math.max(3 * scaleFactor, (val * config.height * 0.6 * scale * spectrumBeatMultiplier));
        const x = startX + i * (barWidth + (3 * scaleFactor));
        const yTop = baseY - halfHeight;
        const totalBarHeight = halfHeight * 2;

        const grad = ctx.createLinearGradient(x, yTop, x, yTop + totalBarHeight);
        grad.addColorStop(0, config.secondaryColor);
        grad.addColorStop(0.5, config.color);
        grad.addColorStop(1, config.secondaryColor);

        ctx.fillStyle = grad;
        if (typeof ctx.roundRect === 'function') {
          ctx.beginPath();
          ctx.roundRect(x, yTop, barWidth, totalBarHeight, barWidth / 2);
          ctx.fill();
        } else {
          ctx.fillRect(x, yTop, barWidth, totalBarHeight);
        }
      }
    } else if (config.style === 'neon-wave') {
      // Smooth luminous wave with translucent glowing fill underneath
      const totalWidth = width * 0.8 * (config.scale ?? 1.0);
      const startX = posX - totalWidth / 2;
      const stepX = totalWidth / (count - 1);
      const baseY = posY;

      const points: Array<{ x: number; y: number }> = [];
      for (let i = 0; i < count; i++) {
        const val = freqData[i] / 255;
        const x = startX + i * stepX;
        const y = baseY - val * config.height * scale * spectrumBeatMultiplier;
        points.push({ x, y });
      }

      // Draw glowing gradient filled area under curve
      ctx.beginPath();
      ctx.moveTo(points[0].x, baseY);
      for (let i = 0; i < points.length - 1; i++) {
        const xc = (points[i].x + points[i + 1].x) / 2;
        const yc = (points[i].y + points[i + 1].y) / 2;
        ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
      }
      ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
      ctx.lineTo(points[points.length - 1].x, baseY);
      ctx.closePath();

      const fillGrad = ctx.createLinearGradient(posX, baseY - config.height * scale, posX, baseY);
      fillGrad.addColorStop(0, config.color + '88'); // Semi-transparent
      fillGrad.addColorStop(1, config.secondaryColor + '11');
      ctx.fillStyle = fillGrad;
      ctx.fill();

      // Draw top glowing stroke
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 0; i < points.length - 1; i++) {
        const xc = (points[i].x + points[i + 1].x) / 2;
        const yc = (points[i].y + points[i + 1].y) / 2;
        ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
      }
      ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);

      const strokeGrad = ctx.createLinearGradient(startX, posY, startX + totalWidth, posY);
      strokeGrad.addColorStop(0, config.color);
      strokeGrad.addColorStop(1, config.secondaryColor);

      ctx.strokeStyle = strokeGrad;
      ctx.lineWidth = Math.max(3 * scaleFactor, 4 * scale * spectrumBeatMultiplier);
      ctx.lineCap = 'round';
      ctx.stroke();
    } else if (config.style === 'double-circular') {
      // Starburst Circle: radiates BOTH outward and inward toward center
      const radius = config.radius * scale * (config.followBeat ? 1 + (beatFactor - 1) * 0.08 : 1.0);
      const angleStep = (Math.PI * 2) / count;

      for (let i = 0; i < count; i++) {
        const val = freqData[i] / 255;
        const outHeight = Math.max(4 * scaleFactor, val * config.height * scale * spectrumBeatMultiplier);
        const inHeight = Math.max(2 * scaleFactor, val * config.height * 0.4 * scale * spectrumBeatMultiplier);
        const angle = i * angleStep;

        const xOut = posX + Math.cos(angle) * (radius + outHeight);
        const yOut = posY + Math.sin(angle) * (radius + outHeight);
        const xIn = posX + Math.cos(angle) * Math.max(10, radius - inHeight);
        const yIn = posY + Math.sin(angle) * Math.max(10, radius - inHeight);

        const grad = ctx.createLinearGradient(xIn, yIn, xOut, yOut);
        grad.addColorStop(0, config.secondaryColor);
        grad.addColorStop(0.4, config.color);
        grad.addColorStop(1, config.secondaryColor);

        ctx.strokeStyle = grad;
        ctx.lineWidth = Math.max(2 * scaleFactor, (Math.PI * 2 * radius) / count - (2 * scaleFactor));
        ctx.lineCap = 'round';

        ctx.beginPath();
        ctx.moveTo(xIn, yIn);
        ctx.lineTo(xOut, yOut);
        ctx.stroke();
      }
    } else if (config.style === 'digital-eq') {
      // Classic Stereo LED Segment Blocks (DJ Mixer / Hi-Fi Equalizer)
      const totalWidth = width * 0.75 * (config.scale ?? 1.0);
      const startX = posX - totalWidth / 2;
      const barWidth = Math.max(3 * scaleFactor, totalWidth / count - (3 * scaleFactor));
      const totalBlocks = 16;
      const blockGap = 2.5 * scaleFactor;
      const blockHeight = (config.height * scale * 0.8) / totalBlocks;

      for (let i = 0; i < count; i++) {
        const val = freqData[i] / 255;
        const litBlocks = Math.round(val * totalBlocks * (config.followBeat ? 1 + (beatFactor - 1) * 0.3 : 1.0));
        const x = startX + i * (barWidth + (3 * scaleFactor));

        for (let b = 0; b < totalBlocks; b++) {
          const y = posY - (b + 1) * (blockHeight + blockGap);
          const isLit = b < litBlocks;

          if (isLit) {
            // Gradient color based on height (green -> yellow -> red / cyan -> magenta)
            const ratio = b / totalBlocks;
            ctx.fillStyle = ratio > 0.75 ? config.secondaryColor : config.color;
            ctx.globalAlpha = config.opacity;
          } else {
            ctx.fillStyle = '#222222';
            ctx.globalAlpha = config.opacity * 0.15;
          }

          if (typeof ctx.roundRect === 'function') {
            ctx.beginPath();
            ctx.roundRect(x, y, barWidth, blockHeight, 1.5 * scaleFactor);
            ctx.fill();
          } else {
            ctx.fillRect(x, y, barWidth, blockHeight);
          }
        }
      }
    } else if (config.style === 'dots-ring') {
      // Constellation Ring: orbiting circular dots jumping with audio frequency
      const baseRadius = config.radius * scale * (config.followBeat ? 1 + (beatFactor - 1) * 0.06 : 1.0);
      const angleStep = (Math.PI * 2) / count;

      for (let i = 0; i < count; i++) {
        const val = freqData[i] / 255;
        const r = baseRadius + val * config.height * 0.7 * scale * spectrumBeatMultiplier;
        const angle = i * angleStep;

        const x = posX + Math.cos(angle) * r;
        const y = posY + Math.sin(angle) * r;
        const dotSize = Math.max(2.5 * scaleFactor, (2.5 + val * 5.5) * scaleFactor);

        ctx.fillStyle = i % 2 === 0 ? config.color : config.secondaryColor;
        ctx.beginPath();
        ctx.arc(x, y, dotSize, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (config.style === 'pulse-rings') {
      // Concentric Sound Ripples: Expanding water-drop concentric rings
      const avgBass = ((frequencies[0] || 0) + (frequencies[1] || 0) + (frequencies[2] || 0)) / (3 * 255);
      const avgMid = ((frequencies[4] || 0) + (frequencies[8] || 0) + (frequencies[12] || 0)) / (3 * 255);
      const ringCount = 5;

      for (let r = 0; r < ringCount; r++) {
        const ringProgress = (r + 1) / ringCount;
        const currentRadius = (config.radius * 0.4 + ringProgress * config.height * 0.7) * scale * (1 + avgBass * 0.4 * spectrumBeatMultiplier);
        const alpha = Math.max(0.1, (1 - ringProgress * 0.8) * config.opacity * (0.4 + avgMid * 0.6));

        ctx.strokeStyle = r % 2 === 0 ? config.color : config.secondaryColor;
        ctx.lineWidth = Math.max(1.5 * scaleFactor, (4 - r * 0.5) * scaleFactor);
        ctx.globalAlpha = alpha;

        ctx.beginPath();
        ctx.arc(posX, posY, currentRadius, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    ctx.restore();
  }
}

