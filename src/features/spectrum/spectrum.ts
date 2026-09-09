import type { SpectrumConfig } from '../../lib/types/project';

// Color palette presets for multi-color spectrum styles
const RAINBOW_PALETTE = ['#f43f5e', '#f97316', '#fbbf24', '#22c55e', '#06b6d4', '#3b82f6', '#a855f7'];
const FIRE_PALETTE = ['#ef4444', '#f97316', '#f59e0b', '#fbbf24', '#fef08a'];
const GALAXY_PALETTE = ['#4c1d95', '#7c3aed', '#c084fc', '#e879f9', '#38bdf8'];
const NEON_PALETTE = ['#00f5d4', '#7b2cbf', '#f72585', '#4cc9f0', '#fee440'];
const PRISM_PALETTE = ['#e0e7ff', '#a5b4fc', '#818cf8', '#6366f1', '#4f46e5'];

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
    const sensitivity = config.beatSensitivity ?? 1.0;
    const beatFactor = 1.0 + (rawBeatFactor - 1.0) * sensitivity;
    const spectrumBeatMultiplier = config.followBeat ? 1 + (beatFactor - 1) * 0.35 : 1.0;

    ctx.save();
    ctx.globalAlpha = config.opacity;

    const posX = (config.x ?? 0.5) * width;
    const posY = (config.y ?? 0.5) * height;
    const scale = (config.scale ?? 1.0) * scaleFactor;

    const count = Math.min(config.barCount, frequencies.length);

    // Symmetrical mirror data if enabled
    let freqData: Uint8Array | Float32Array = frequencies;
    if (config.mirror && count > 2) {
      const mirrored = new Float32Array(count);
      const half = Math.ceil(count / 2);
      for (let i = 0; i < half; i++) {
        const srcVal = frequencies[Math.floor((i / half) * (frequencies.length / 2))] || 0;
        mirrored[half - 1 - i] = srcVal;
        if (half + i < count) {
          mirrored[half + i] = srcVal;
        }
      }
      freqData = mirrored;
    }

    const style = config.style;

    // Dispatch by category / family to maximize Canvas 2D render speed
    if (this.isBarsFamily(style)) {
      this.renderBars(ctx, width, height, posX, posY, scale, scaleFactor, config, freqData, count, spectrumBeatMultiplier, style);
    } else if (this.isLEDFamily(style)) {
      this.renderLED(ctx, width, height, posX, posY, scale, scaleFactor, config, freqData, count, beatFactor, spectrumBeatMultiplier, style);
    } else if (this.isRadialFamily(style)) {
      this.renderRadial(ctx, width, height, posX, posY, scale, scaleFactor, config, freqData, count, beatFactor, spectrumBeatMultiplier, style);
    } else if (this.isWaveFamily(style)) {
      this.renderWave(ctx, width, height, posX, posY, scale, scaleFactor, config, freqData, count, spectrumBeatMultiplier, style);
    } else if (this.isMirrorFamily(style)) {
      this.renderMirror(ctx, width, height, posX, posY, scale, scaleFactor, config, freqData, count, spectrumBeatMultiplier, style);
    } else if (this.isNCSFamily(style)) {
      this.renderNCS(ctx, width, height, posX, posY, scale, scaleFactor, config, freqData, count, beatFactor, spectrumBeatMultiplier, style);
    } else if (this.isScientificFamily(style)) {
      this.renderScientific(ctx, width, height, posX, posY, scale, scaleFactor, config, freqData, count, spectrumBeatMultiplier, style);
    } else if (this.isGeometricFamily(style)) {
      this.renderGeometric(ctx, width, height, posX, posY, scale, scaleFactor, config, freqData, count, beatFactor, spectrumBeatMultiplier, style);
    } else {
      this.renderSpecialFX(ctx, width, height, posX, posY, scale, scaleFactor, config, freqData, count, beatFactor, spectrumBeatMultiplier, style);
    }

    ctx.restore();
  }

  // Helper classifiers
  private isBarsFamily(s: string): boolean {
    return s === 'bars' || s.startsWith('Bars') || s.startsWith('Bar ') || s === 'Octave Bars' || s === 'Lumi Bars' || s === 'Outline' || s === 'Alpha Bars';
  }

  private isLEDFamily(s: string): boolean {
    return s === 'digital-eq' || s.startsWith('LED');
  }

  private isRadialFamily(s: string): boolean {
    return s === 'circular' || s === 'radial-bars' || s === 'dots-ring' || s === 'double-circular' || s === 'pulse-rings' || s.startsWith('Radial');
  }

  private isWaveFamily(s: string): boolean {
    return s === 'waveform' || s === 'neon-wave' || s.startsWith('Graph') || s === 'Wave Mirror' || s === 'Asap Wave' || s === 'Ripple Waves';
  }

  private isMirrorFamily(s: string): boolean {
    return s === 'center-bars' || s.startsWith('Mirror') || s.startsWith('Dual');
  }

  private isNCSFamily(s: string): boolean {
    return s.startsWith('NCS') || s.startsWith('Jonten');
  }

  private isScientificFamily(s: string): boolean {
    return s === 'Mel Scale' || s === 'Bark Scale' || s === 'Discrete FFT' || s === 'A-Weight' || s.startsWith('Reflex') || s === 'Fade Peaks' || s.startsWith('Octave');
  }

  private isGeometricFamily(s: string): boolean {
    return s.startsWith('Spiral') || s === 'Galaxy Spiral' || s === 'DNA Helix' || s === 'Vortex' || s === 'Orbit Rings' || s === 'Deep Tunnel' || s === 'Hex Pulse' || s === 'Lissajous' || s === 'Spectrum Arc' || s === 'Neon Flower' || s === 'Warp Speed' || s === 'Diamond Lattice' || s === 'Cyber Grid';
  }

  // 1. Bars Family Renderer
  private renderBars(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    width: number,
    height: number,
    posX: number,
    posY: number,
    scale: number,
    scaleFactor: number,
    config: SpectrumConfig,
    freqData: Uint8Array | Float32Array,
    count: number,
    multiplier: number,
    style: string
  ) {
    const totalWidth = width * 0.72 * (config.scale ?? 1.0);
    const startX = posX - totalWidth / 2;
    const isThin = style === 'Bars Thin';
    const isDense = style === 'Bars Dense';
    const isFat = style === 'Bars Fat';
    const gap = isDense ? 1.5 * scaleFactor : (isThin ? 5 * scaleFactor : (isFat ? 2 * scaleFactor : 3.5 * scaleFactor));
    const barWidth = isThin 
      ? Math.max(1.5 * scaleFactor, 2.5 * scaleFactor)
      : Math.max(2 * scaleFactor, totalWidth / count - gap);
    const isRound = style === 'Bars Round' || isFat;
    const isOutline = style === 'Outline';
    const isAlpha = style === 'Alpha Bars';

    for (let i = 0; i < count; i++) {
      let rawVal = freqData[i] / 255;
      
      // Octave Bars: logarithmic octave frequency grouping formula
      if (style === 'Octave Bars') {
        const oct = Math.pow(2, (i / count) * 4);
        const idx = Math.min(count - 1, Math.floor((oct / 16) * count));
        rawVal = (freqData[idx] || 0) / 255;
      }

      const barHeight = Math.max(4 * scaleFactor, rawVal * config.height * scale * multiplier);
      const x = startX + i * (barWidth + gap);
      const y = posY - barHeight;

      // Color computation
      let fillColor: string | CanvasGradient = config.color;
      if (style === 'Bar Level Color') {
        fillColor = rawVal > 0.75 ? config.secondaryColor : config.color;
      } else if (style === 'Bar Index Color') {
        fillColor = i % 2 === 0 ? config.color : config.secondaryColor;
      } else if (style === 'Lumi Bars') {
        // Luminance-reactive glow bar
        const lum = Math.floor(rawVal * 255);
        fillColor = `rgba(${lum}, 245, 255, ${0.4 + rawVal * 0.6})`;
      } else {
        const grad = ctx.createLinearGradient(x, posY, x, y);
        grad.addColorStop(0, config.color);
        grad.addColorStop(1, config.secondaryColor);
        fillColor = grad;
      }

      ctx.fillStyle = fillColor;

      if (isAlpha) {
        ctx.globalAlpha = config.opacity * (0.2 + rawVal * 0.8);
      }

      if (isOutline) {
        ctx.strokeStyle = typeof fillColor === 'string' ? fillColor : config.color;
        ctx.lineWidth = Math.max(1.5 * scaleFactor, 2 * scaleFactor);
        ctx.strokeRect(x, y, barWidth, barHeight);
      } else if (isRound && typeof ctx.roundRect === 'function') {
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, [barWidth / 2, barWidth / 2, 0, 0]);
        ctx.fill();
      } else {
        ctx.fillRect(x, y, barWidth, barHeight);
      }

      // Peak dots for Bars Peak Neon
      if (style === 'Bars Peak Neon') {
        ctx.fillStyle = config.secondaryColor;
        ctx.fillRect(x, y - 6 * scaleFactor, barWidth, 3 * scaleFactor);
      }
    }
  }

  // 2. LED Family Renderer
  private renderLED(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    width: number,
    height: number,
    posX: number,
    posY: number,
    scale: number,
    scaleFactor: number,
    config: SpectrumConfig,
    freqData: Uint8Array | Float32Array,
    count: number,
    beatFactor: number,
    multiplier: number,
    style: string
  ) {
    const totalWidth = width * 0.75 * (config.scale ?? 1.0);
    const startX = posX - totalWidth / 2;
    const barWidth = Math.max(3 * scaleFactor, totalWidth / count - (3 * scaleFactor));
    const totalBlocks = 16;
    const blockGap = 2.5 * scaleFactor;
    const blockHeight = (config.height * scale * 0.8) / totalBlocks;
    const isMirror = style === 'LED Mirror';
    const isPrism = style === 'LED Prism';
    const isFire = style === 'LED Fire';
    const isGalaxy = style === 'LED Galaxy';
    const isDigitalEq = style === 'digital-eq';

    for (let i = 0; i < count; i++) {
      const val = freqData[i] / 255;
      const litBlocks = Math.round(val * totalBlocks * (config.followBeat ? 1 + (beatFactor - 1) * 0.3 : 1.0));
      const x = startX + i * (barWidth + (3 * scaleFactor));

      for (let b = 0; b < totalBlocks; b++) {
        const y = isMirror 
          ? posY + (b % 2 === 0 ? 1 : -1) * (Math.floor(b / 2) + 1) * (blockHeight + blockGap)
          : posY - (b + 1) * (blockHeight + blockGap);
        const isLit = b < litBlocks;

        if (isLit) {
          const ratio = b / totalBlocks;
          if (isPrism) {
            ctx.fillStyle = PRISM_PALETTE[Math.floor(ratio * PRISM_PALETTE.length)] || config.color;
          } else if (isFire) {
            ctx.fillStyle = FIRE_PALETTE[Math.floor(ratio * FIRE_PALETTE.length)] || config.secondaryColor;
          } else if (isGalaxy) {
            ctx.fillStyle = GALAXY_PALETTE[Math.floor(ratio * GALAXY_PALETTE.length)] || config.color;
          } else if (isDigitalEq) {
            // Classic studio VU meter: Green -> Yellow -> Red
            ctx.fillStyle = ratio > 0.85 ? '#ef4444' : (ratio > 0.65 ? '#eab308' : '#22c55e');
          } else {
            ctx.fillStyle = ratio > 0.75 ? config.secondaryColor : config.color;
          }
          ctx.globalAlpha = config.opacity;
        } else {
          ctx.fillStyle = '#1e1e24';
          ctx.globalAlpha = config.opacity * 0.18;
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
  }

  // 3. Radial Family Renderer
  private renderRadial(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    width: number,
    height: number,
    posX: number,
    posY: number,
    scale: number,
    scaleFactor: number,
    config: SpectrumConfig,
    freqData: Uint8Array | Float32Array,
    count: number,
    beatFactor: number,
    multiplier: number,
    style: string
  ) {
    const baseRadius = config.radius * scale * (config.followBeat ? 1 + (beatFactor - 1) * 0.08 : 1.0);
    const angleStep = (Math.PI * 2) / count;
    const isSpin = style === 'Radial Spin';
    const isInvert = style === 'Radial Invert';
    const isDots = style === 'dots-ring';
    const isPulse = style === 'pulse-rings';
    const isDual = style === 'Radial Dual';
    const isRadialLED = style === 'Radial LED';
    const isOutline = style === 'Radial Outline';
    const isDoubleCircular = style === 'double-circular';
    const spinOffset = isSpin ? (Date.now() * 0.001) % (Math.PI * 2) : 0;

    if (isPulse) {
      const avgBass = ((freqData[0] || 0) + (freqData[1] || 0) + (freqData[2] || 0)) / (3 * 255);
      const ringCount = 6;
      for (let r = 0; r < ringCount; r++) {
        const ringProg = (r + 1) / ringCount;
        const curR = (baseRadius * 0.5 + ringProg * config.height * 0.8) * (1 + avgBass * 0.35 * multiplier);
        ctx.strokeStyle = r % 2 === 0 ? config.color : config.secondaryColor;
        ctx.lineWidth = Math.max(1.5 * scaleFactor, (4 - r * 0.5) * scaleFactor);
        ctx.globalAlpha = config.opacity * (1 - ringProg * 0.65);
        ctx.beginPath();
        ctx.arc(posX, posY, curR, 0, Math.PI * 2);
        ctx.stroke();
      }
      return;
    }

    if (isDoubleCircular) {
      // Inner circle and outer circle counter-rotating
      const half = Math.floor(count / 2);
      ctx.lineWidth = 2.5 * scaleFactor;
      ctx.lineCap = 'round';
      for (let i = 0; i < half; i++) {
        const val = freqData[i] / 255;
        const h = Math.max(3 * scaleFactor, val * config.height * 0.6 * scale * multiplier);
        const ang = (i / half) * Math.PI * 2;

        // Inner circle
        const rIn = baseRadius * 0.6;
        ctx.strokeStyle = config.color;
        ctx.beginPath();
        ctx.moveTo(posX + Math.cos(ang) * rIn, posY + Math.sin(ang) * rIn);
        ctx.lineTo(posX + Math.cos(ang) * (rIn + h), posY + Math.sin(ang) * (rIn + h));
        ctx.stroke();

        // Outer circle
        const rOut = baseRadius * 1.1;
        ctx.strokeStyle = config.secondaryColor;
        ctx.beginPath();
        ctx.moveTo(posX + Math.cos(-ang) * rOut, posY + Math.sin(-ang) * rOut);
        ctx.lineTo(posX + Math.cos(-ang) * (rOut + h), posY + Math.sin(-ang) * (rOut + h));
        ctx.stroke();
      }
      return;
    }

    for (let i = 0; i < count; i++) {
      const val = freqData[i] / 255;
      const barHeight = Math.max(3 * scaleFactor, val * config.height * scale * multiplier);
      const angle = i * angleStep + spinOffset;
      const dir = isInvert ? -1 : 1;

      if (isDual) {
        // Dual inward and outward ray
        const xOut = posX + Math.cos(angle) * (baseRadius + barHeight);
        const yOut = posY + Math.sin(angle) * (baseRadius + barHeight);
        const xIn = posX + Math.cos(angle) * Math.max(5, baseRadius - barHeight * 0.5);
        const yIn = posY + Math.sin(angle) * Math.max(5, baseRadius - barHeight * 0.5);
        ctx.strokeStyle = i % 2 === 0 ? config.color : config.secondaryColor;
        ctx.lineWidth = Math.max(2 * scaleFactor, 3 * scaleFactor);
        ctx.beginPath();
        ctx.moveTo(xIn, yIn);
        ctx.lineTo(xOut, yOut);
        ctx.stroke();
      } else if (isRadialLED) {
        // Segmented LED radial dots along each ray
        const segments = 6;
        const litSegs = Math.round(val * segments);
        for (let s = 1; s <= segments; s++) {
          const r = baseRadius + (s / segments) * barHeight;
          const x = posX + Math.cos(angle) * r;
          const y = posY + Math.sin(angle) * r;
          ctx.fillStyle = s <= litSegs ? (s > 4 ? config.secondaryColor : config.color) : 'rgba(30,30,36,0.3)';
          ctx.beginPath();
          ctx.arc(x, y, 2 * scaleFactor, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (isDots) {
        const x2 = posX + Math.cos(angle) * (baseRadius + dir * barHeight);
        const y2 = posY + Math.sin(angle) * (baseRadius + dir * barHeight);
        ctx.fillStyle = i % 2 === 0 ? config.color : config.secondaryColor;
        ctx.beginPath();
        ctx.arc(x2, y2, Math.max(2 * scaleFactor, (2 + val * 5) * scaleFactor), 0, Math.PI * 2);
        ctx.fill();
      } else if (isOutline) {
        // Hollow arc outline bounding the peak
        const x1 = posX + Math.cos(angle) * baseRadius;
        const y1 = posY + Math.sin(angle) * baseRadius;
        const x2 = posX + Math.cos(angle) * (baseRadius + dir * barHeight);
        const y2 = posY + Math.sin(angle) * (baseRadius + dir * barHeight);
        ctx.strokeStyle = config.color;
        ctx.lineWidth = 1.5 * scaleFactor;
        ctx.strokeRect(x2 - 2 * scaleFactor, y2 - 2 * scaleFactor, 4 * scaleFactor, 4 * scaleFactor);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      } else {
        // Standard radial bars
        const x1 = posX + Math.cos(angle) * baseRadius;
        const y1 = posY + Math.sin(angle) * baseRadius;
        const x2 = posX + Math.cos(angle) * (baseRadius + dir * barHeight);
        const y2 = posY + Math.sin(angle) * (baseRadius + dir * barHeight);

        ctx.strokeStyle = i % 2 === 0 ? config.color : config.secondaryColor;
        ctx.lineWidth = Math.max(2 * scaleFactor, (Math.PI * 2 * baseRadius) / count - (2 * scaleFactor));
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
    }
  }

  // 4. Wave & Graph Family Renderer
  private renderWave(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    width: number,
    height: number,
    posX: number,
    posY: number,
    scale: number,
    scaleFactor: number,
    config: SpectrumConfig,
    freqData: Uint8Array | Float32Array,
    count: number,
    multiplier: number,
    style: string
  ) {
    const totalWidth = width * 0.78 * (config.scale ?? 1.0);
    const startX = posX - totalWidth / 2;
    const stepX = totalWidth / Math.max(1, count - 1);
    const isThin = style === 'Graph Thin';
    const isMirror = style === 'Wave Mirror';
    const isNeonWave = style === 'neon-wave';
    const isAsapWave = style === 'Asap Wave';
    const isRipple = style === 'Ripple Waves';
    const time = Date.now() * 0.003;

    if (isRipple) {
      // Concentric expanding ripple waves modulated by frequencies
      ctx.lineWidth = 2 * scaleFactor;
      for (let w = 1; w <= 5; w++) {
        const val = (freqData[w * 3 % count] || 0) / 255;
        const r = (w * 28 * scale + Math.sin(time * 2 + w) * 8 * scale) * (1 + val * 0.5 * multiplier);
        ctx.strokeStyle = w % 2 === 0 ? config.color : config.secondaryColor;
        ctx.globalAlpha = config.opacity * (1 - w * 0.16);
        ctx.beginPath();
        ctx.arc(posX, posY, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      return;
    }

    if (isAsapWave) {
      // Turbulent multi-harmonic wave with phase modulation
      ctx.beginPath();
      ctx.strokeStyle = config.color;
      ctx.lineWidth = 3 * scaleFactor;
      for (let i = 0; i < count; i++) {
        const val = freqData[i] / 255;
        const wave1 = Math.sin(i * 0.15 + time) * 20 * scaleFactor;
        const wave2 = Math.sin(i * 0.3 - time * 1.5) * 12 * scaleFactor;
        const h = val * config.height * scale * multiplier + wave1 + wave2;
        const x = startX + i * stepX;
        const y = posY - h;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      return;
    }

    // Standard waveform / Graph Thin / Neon Wave / Wave Mirror
    ctx.beginPath();
    ctx.strokeStyle = config.color;
    ctx.lineWidth = isThin ? 1.5 * scaleFactor : (isNeonWave ? 5 * scaleFactor : 3.5 * scaleFactor * multiplier);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (let i = 0; i < count; i++) {
      const val = (freqData[i] / 255);
      const h = val * config.height * scale * multiplier;
      const x = startX + i * stepX;
      const y = posY - h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    if (isMirror) {
      ctx.beginPath();
      ctx.strokeStyle = config.secondaryColor;
      for (let i = 0; i < count; i++) {
        const val = (freqData[i] / 255);
        const h = val * config.height * scale * multiplier;
        const x = startX + i * stepX;
        const y = posY + h;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  // 5. Mirror & Dual Family Renderer
  private renderMirror(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    width: number,
    height: number,
    posX: number,
    posY: number,
    scale: number,
    scaleFactor: number,
    config: SpectrumConfig,
    freqData: Uint8Array | Float32Array,
    count: number,
    multiplier: number,
    style: string
  ) {
    const totalWidth = width * 0.75 * (config.scale ?? 1.0);
    const startX = posX - totalWidth / 2;
    const barWidth = Math.max(2.5 * scaleFactor, totalWidth / count - (3 * scaleFactor));
    const isDualH = style === 'Dual Horizontal';
    const isDualV = style === 'Dual Vertical';
    const isDualOverlay = style === 'Dual Overlay';
    const isMirrorOuter = style === 'Mirror Outer';

    if (isDualOverlay) {
      // Dual layer overlapping bars with cross-blended opacity
      for (let i = 0; i < count; i++) {
        const val = freqData[i] / 255;
        const h1 = Math.max(3 * scaleFactor, val * config.height * scale * multiplier);
        const h2 = Math.max(3 * scaleFactor, (freqData[count - 1 - i] / 255) * config.height * scale * multiplier);
        const x = startX + i * (barWidth + 3 * scaleFactor);

        ctx.fillStyle = config.color;
        ctx.globalAlpha = config.opacity * 0.65;
        ctx.fillRect(x, posY - h1, barWidth, h1);

        ctx.fillStyle = config.secondaryColor;
        ctx.globalAlpha = config.opacity * 0.65;
        ctx.fillRect(x + 2 * scaleFactor, posY - h2, barWidth, h2);
      }
      return;
    }

    if (isMirrorOuter) {
      // Mirror radiating outward from center to left and right edges
      const half = Math.floor(count / 2);
      const halfW = totalWidth / 2;
      for (let i = 0; i < half; i++) {
        const val = freqData[i] / 255;
        const h = Math.max(3 * scaleFactor, val * config.height * scale * multiplier);
        const xLeft = posX - (i / half) * halfW;
        const xRight = posX + (i / half) * halfW;

        ctx.fillStyle = config.color;
        ctx.fillRect(xLeft, posY - h, barWidth, h);
        ctx.fillStyle = config.secondaryColor;
        ctx.fillRect(xRight, posY - h, barWidth, h);
      }
      return;
    }

    for (let i = 0; i < count; i++) {
      const val = freqData[i] / 255;
      const halfH = Math.max(3 * scaleFactor, val * config.height * 0.55 * scale * multiplier);
      const x = startX + i * (barWidth + 3 * scaleFactor);

      if (isDualH) {
        // Horizontal left-right mirrors with opposing polarity
        ctx.fillStyle = config.color;
        ctx.fillRect(posX - (i + 1) * (barWidth + 2), posY - halfH, barWidth, halfH * 2);
        ctx.fillStyle = config.secondaryColor;
        ctx.fillRect(posX + i * (barWidth + 2), posY - halfH, barWidth, halfH * 2);
      } else if (isDualV) {
        // Top and bottom dual separated stacks
        ctx.fillStyle = config.color;
        ctx.fillRect(x, posY - halfH - 8 * scaleFactor, barWidth, halfH);
        ctx.fillStyle = config.secondaryColor;
        ctx.fillRect(x, posY + 8 * scaleFactor, barWidth, halfH);
      } else {
        // Center mirror top-down (center-bars)
        ctx.fillStyle = config.color;
        ctx.fillRect(x, posY - halfH, barWidth, halfH);
        ctx.fillStyle = config.secondaryColor;
        ctx.fillRect(x, posY, barWidth, halfH);
      }
    }
  }

  // 6. NCS & EDM Signature Family
  private renderNCS(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    width: number,
    height: number,
    posX: number,
    posY: number,
    scale: number,
    scaleFactor: number,
    config: SpectrumConfig,
    freqData: Uint8Array | Float32Array,
    count: number,
    beatFactor: number,
    multiplier: number,
    style: string
  ) {
    const bassVal = (freqData[0] || 0) / 255;
    const circleRadius = (config.radius * scale) * (1 + bassVal * 0.25 * multiplier);
    const angleStep = (Math.PI * 2) / count;
    const time = Date.now() * 0.003;

    if (style === 'Jonten Spark') {
      // High-energy electric lightning sparks leaping from central circle
      ctx.fillStyle = '#0a0a10';
      ctx.beginPath();
      ctx.arc(posX, posY, circleRadius, 0, Math.PI * 2);
      ctx.fill();

      for (let i = 0; i < count; i += 2) {
        const val = freqData[i] / 255;
        const ang = i * angleStep;
        const sparkDist = circleRadius + val * config.height * 1.2 * scale * multiplier;
        const midR = circleRadius + (sparkDist - circleRadius) * 0.5;
        const jitterAng = ang + (Math.sin(time * 5 + i) * 0.15);

        ctx.strokeStyle = val > 0.5 ? '#ffffff' : config.secondaryColor;
        ctx.lineWidth = 1.5 * scaleFactor;
        ctx.beginPath();
        ctx.moveTo(posX + Math.cos(ang) * circleRadius, posY + Math.sin(ang) * circleRadius);
        ctx.lineTo(posX + Math.cos(jitterAng) * midR, posY + Math.sin(jitterAng) * midR);
        ctx.lineTo(posX + Math.cos(ang) * sparkDist, posY + Math.sin(ang) * sparkDist);
        ctx.stroke();
      }
      return;
    }

    if (style === 'Jonten Ring') {
      // Concentric neon resonant rings modulated by frequencies
      for (let r = 1; r <= 4; r++) {
        const val = (freqData[r * 4 % count] || 0) / 255;
        const curR = circleRadius * (0.5 + r * 0.35) * (1 + val * 0.2);
        ctx.strokeStyle = r % 2 === 0 ? config.color : config.secondaryColor;
        ctx.lineWidth = (3 - r * 0.5) * scaleFactor;
        ctx.beginPath();
        ctx.arc(posX, posY, curR, 0, Math.PI * 2);
        ctx.stroke();
      }
      return;
    }

    if (style === 'Jonten NFC') {
      // Hexagonal NFC tag geometric ring pulsing with audio
      ctx.beginPath();
      ctx.strokeStyle = config.secondaryColor;
      ctx.lineWidth = 3 * scaleFactor;
      for (let s = 0; s <= 6; s++) {
        const ang = (s / 6) * Math.PI * 2;
        const val = (freqData[s % count] || 0) / 255;
        const r = circleRadius * (1 + val * 0.35);
        const x = posX + Math.cos(ang) * r;
        const y = posY + Math.sin(ang) * r;
        if (s === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      return;
    }

    if (style === 'NCS Pulse') {
      // Pulsating audio shockwaves radiating outward
      const pulseCount = 3;
      for (let p = 0; p < pulseCount; p++) {
        const prog = ((time * 0.8 + p / pulseCount) % 1.0);
        const r = circleRadius + prog * config.height * scale * multiplier;
        ctx.strokeStyle = config.color;
        ctx.globalAlpha = config.opacity * (1 - prog);
        ctx.lineWidth = (3 * (1 - prog) + 1) * scaleFactor;
        ctx.beginPath();
        ctx.arc(posX, posY, r, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // Classic NCS / NCS Radial / NCS Mirror
    ctx.fillStyle = '#111118';
    ctx.strokeStyle = config.secondaryColor;
    ctx.lineWidth = 3 * scaleFactor;
    ctx.beginPath();
    ctx.arc(posX, posY, circleRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    for (let i = 0; i < count; i++) {
      const val = freqData[i] / 255;
      const h = Math.max(4 * scaleFactor, val * config.height * scale * multiplier);
      const angle = i * angleStep;

      const x1 = posX + Math.cos(angle) * circleRadius;
      const y1 = posY + Math.sin(angle) * circleRadius;
      const x2 = posX + Math.cos(angle) * (circleRadius + h);
      const y2 = posY + Math.sin(angle) * (circleRadius + h);

      ctx.strokeStyle = i % 2 === 0 ? config.color : config.secondaryColor;
      ctx.lineWidth = Math.max(2.5 * scaleFactor, (Math.PI * 2 * circleRadius) / count - (2 * scaleFactor));
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      if (style === 'NCS Mirror') {
        // Internal inward spike
        const inH = Math.min(circleRadius * 0.45, h * 0.4);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(posX + Math.cos(angle) * (circleRadius - inH), posY + Math.sin(angle) * (circleRadius - inH));
        ctx.stroke();
      }
    }
  }

  // 7. Scientific & Scales Family
  private renderScientific(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    width: number,
    height: number,
    posX: number,
    posY: number,
    scale: number,
    scaleFactor: number,
    config: SpectrumConfig,
    freqData: Uint8Array | Float32Array,
    count: number,
    multiplier: number,
    style: string
  ) {
    const totalWidth = width * 0.72 * (config.scale ?? 1.0);
    const startX = posX - totalWidth / 2;
    const barWidth = Math.max(2 * scaleFactor, totalWidth / count - (3 * scaleFactor));

    for (let i = 0; i < count; i++) {
      // Frequency weighting mapping
      let weight = 1.0;
      if (style === 'Mel Scale') {
        weight = Math.log10(1 + (i / count) * 9);
      } else if (style === 'Bark Scale') {
        const z = (i / count) * 24;
        weight = ((26.81 * z) / (1960 + z)) - 0.53;
        weight = Math.max(0.2, Math.min(1.5, weight * 0.15 + 0.8));
      } else if (style === 'A-Weight') {
        // A-weighting curve approximation: human ear Fletcher-Munson midrange sensitivity
        weight = 0.4 + Math.sin((i / count) * Math.PI) * 0.8;
      } else if (style === 'Discrete FFT') {
        // Raw discrete FFT impulses with stem points
        weight = 1.0;
      }
      
      const val = Math.min(1.0, (freqData[i] / 255) * weight);
      const barHeight = Math.max(3 * scaleFactor, val * config.height * scale * multiplier);
      const x = startX + i * (barWidth + 3 * scaleFactor);

      if (style === 'Discrete FFT') {
        // Discrete stem lines with node heads
        ctx.strokeStyle = config.color;
        ctx.lineWidth = 1.5 * scaleFactor;
        ctx.beginPath();
        ctx.moveTo(x + barWidth / 2, posY);
        ctx.lineTo(x + barWidth / 2, posY - barHeight);
        ctx.stroke();

        ctx.fillStyle = config.secondaryColor;
        ctx.beginPath();
        ctx.arc(x + barWidth / 2, posY - barHeight, 3 * scaleFactor, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }

      ctx.fillStyle = config.color;
      ctx.fillRect(x, posY - barHeight, barWidth, barHeight);

      // Reflex floor reflection
      if (style === 'Reflex Floor') {
        ctx.fillStyle = config.secondaryColor;
        ctx.globalAlpha = config.opacity * 0.32;
        ctx.fillRect(x, posY, barWidth, barHeight * 0.45);
        ctx.globalAlpha = config.opacity;
      }

      if (style === 'Fade Peaks') {
        // High-vis peak line
        ctx.fillStyle = config.secondaryColor;
        ctx.fillRect(x, posY - barHeight - 4 * scaleFactor, barWidth, 2 * scaleFactor);
      }
    }
  }

  // 8. Geometric & 3D Family
  private renderGeometric(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    width: number,
    height: number,
    posX: number,
    posY: number,
    scale: number,
    scaleFactor: number,
    config: SpectrumConfig,
    freqData: Uint8Array | Float32Array,
    count: number,
    beatFactor: number,
    multiplier: number,
    style: string
  ) {
    if (style === 'Spiral') {
      // Archimedean spiral
      const angleStep = 0.15;
      ctx.beginPath();
      ctx.strokeStyle = config.color;
      ctx.lineWidth = 2.5 * scaleFactor;
      for (let i = 0; i < count; i++) {
        const val = freqData[i] / 255;
        const r = (i * 3.5 * scale + val * 35 * scale) * multiplier;
        const ang = i * angleStep;
        const x = posX + Math.cos(ang) * r;
        const y = posY + Math.sin(ang) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    } else if (style === 'Galaxy Spiral') {
      // Dual-arm logarithmic galaxy spiral
      const arms = 2;
      ctx.lineWidth = 2 * scaleFactor;
      for (let a = 0; a < arms; a++) {
        ctx.strokeStyle = a === 0 ? config.color : config.secondaryColor;
        ctx.beginPath();
        for (let i = 0; i < count; i++) {
          const val = freqData[i] / 255;
          const theta = i * 0.12 + (a * Math.PI);
          const r = Math.exp(0.06 * i) * 12 * scale * (1 + val * 0.3 * multiplier);
          const x = posX + Math.cos(theta) * r;
          const y = posY + Math.sin(theta) * r;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    } else if (style === 'DNA Helix') {
      // Intertwined double helix strands with rungs
      const totalWidth = width * 0.72 * (config.scale ?? 1.0);
      const startX = posX - totalWidth / 2;
      const stepX = totalWidth / Math.max(1, count - 1);
      const time = Date.now() * 0.003;

      for (let i = 0; i < count; i++) {
        const val = freqData[i] / 255;
        const x = startX + i * stepX;
        const amp = (28 * scale + val * 55 * scale) * multiplier;
        const waveAngle = i * 0.28 + time;
        const y1 = posY + Math.sin(waveAngle) * amp;
        const y2 = posY - Math.sin(waveAngle) * amp;

        // Helix connecting rungs
        if (i % 3 === 0) {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
          ctx.lineWidth = 1.5 * scaleFactor;
          ctx.beginPath();
          ctx.moveTo(x, y1);
          ctx.lineTo(x, y2);
          ctx.stroke();
        }

        // Nodes on strand 1 & 2
        ctx.fillStyle = config.color;
        ctx.beginPath();
        ctx.arc(x, y1, Math.max(2 * scaleFactor, (2 + val * 4) * scaleFactor), 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = config.secondaryColor;
        ctx.beginPath();
        ctx.arc(x, y2, Math.max(2 * scaleFactor, (2 + val * 4) * scaleFactor), 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (style === 'Lissajous') {
      // 3D Lissajous resonant figure
      ctx.beginPath();
      ctx.strokeStyle = config.color;
      ctx.lineWidth = 2.5 * scaleFactor;
      const a = 3;
      const b = 4;
      const time = Date.now() * 0.0015;
      const baseR = config.radius * 1.5 * scale * multiplier;

      for (let i = 0; i < count; i++) {
        const val = freqData[i] / 255;
        const t = (i / count) * Math.PI * 2 + time;
        const r = baseR * (1 + val * 0.4);
        const x = posX + Math.sin(a * t + Math.PI / 2) * r;
        const y = posY + Math.sin(b * t) * (r * 0.85);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
    } else if (style === 'Neon Flower') {
      // Rose curve / flower petals modulated by audio
      const petals = 6;
      const time = Date.now() * 0.001;
      ctx.beginPath();
      ctx.strokeStyle = config.secondaryColor;
      ctx.lineWidth = 2.5 * scaleFactor;
      for (let theta = 0; theta <= Math.PI * 2; theta += 0.04) {
        const idx = Math.floor(((theta / (Math.PI * 2)) * count)) % count;
        const val = freqData[idx] / 255;
        const r = (config.radius * scale * Math.cos(petals * theta) + val * 60 * scale) * multiplier;
        const x = posX + Math.cos(theta + time) * Math.abs(r);
        const y = posY + Math.sin(theta + time) * Math.abs(r);
        if (theta === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
    } else if (style === 'Warp Speed') {
      // 3D Starfield streaming outward powered by audio
      const time = Date.now() * 0.002;
      for (let i = 0; i < count; i++) {
        const val = freqData[i] / 255;
        const ang = (i / count) * Math.PI * 2 + Math.sin(i);
        const speed = 1.0 + val * 2.0 * multiplier;
        const dist = ((i * 17 + time * 120 * speed) % (config.radius * 2.5 * scale));
        const x = posX + Math.cos(ang) * dist;
        const y = posY + Math.sin(ang) * dist;
        const trailLen = Math.max(3 * scaleFactor, val * 25 * scaleFactor * multiplier);

        ctx.strokeStyle = i % 2 === 0 ? config.color : config.secondaryColor;
        ctx.lineWidth = Math.max(1.5 * scaleFactor, (1.5 + val * 2.5) * scaleFactor);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(ang) * trailLen, y + Math.sin(ang) * trailLen);
        ctx.stroke();
      }
    } else if (style === 'Cyber Grid') {
      // Perspective synthwave horizon grid
      const gridW = width * 0.8 * (config.scale ?? 1.0);
      const startX = posX - gridW / 2;
      const lines = 12;
      ctx.strokeStyle = config.color;
      ctx.lineWidth = 1.5 * scaleFactor;

      // Perspective vertical ribs
      for (let i = 0; i <= lines; i++) {
        const val = (freqData[Math.floor((i / lines) * count)] || 0) / 255;
        const bottomX = startX + (i / lines) * gridW;
        const topX = posX + ((i / lines) - 0.5) * (gridW * 0.35);
        ctx.beginPath();
        ctx.moveTo(topX, posY - config.height * 0.2 * scale);
        ctx.lineTo(bottomX, posY + config.height * 0.6 * scale + val * 20 * scaleFactor);
        ctx.stroke();
      }
      // Horizontal cross rungs
      for (let j = 1; j <= 6; j++) {
        const frac = j / 6;
        const y = posY + (frac * frac) * config.height * 0.6 * scale;
        const curW = gridW * (0.35 + frac * 0.65);
        ctx.beginPath();
        ctx.moveTo(posX - curW / 2, y);
        ctx.lineTo(posX + curW / 2, y);
        ctx.stroke();
      }
    } else if (style === 'Spectrum Arc') {
      // Wide sweeping semicircle arc
      const arcRadius = config.radius * 1.3 * scale;
      const startAngle = Math.PI * 0.8;
      const endAngle = Math.PI * 2.2;
      const totalSweep = endAngle - startAngle;

      for (let i = 0; i < count; i++) {
        const val = freqData[i] / 255;
        const ang = startAngle + (i / count) * totalSweep;
        const h = Math.max(3 * scaleFactor, val * config.height * scale * multiplier);
        const x1 = posX + Math.cos(ang) * arcRadius;
        const y1 = posY + Math.sin(ang) * arcRadius;
        const x2 = posX + Math.cos(ang) * (arcRadius + h);
        const y2 = posY + Math.sin(ang) * (arcRadius + h);

        ctx.strokeStyle = i % 2 === 0 ? config.color : config.secondaryColor;
        ctx.lineWidth = Math.max(2 * scaleFactor, 3 * scaleFactor);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
    } else if (style === 'Orbit Rings') {
      // Orbital tilted ellipses rotating around center
      const rings = 4;
      const time = Date.now() * 0.001;
      for (let r = 1; r <= rings; r++) {
        const val = (freqData[r * 3 % count] || 0) / 255;
        const rx = (r * 35 * scale) * (1 + val * 0.3 * multiplier);
        const ry = rx * 0.45;
        const rot = time * 0.5 + (r * Math.PI / rings);

        ctx.save();
        ctx.translate(posX, posY);
        ctx.rotate(rot);
        ctx.strokeStyle = r % 2 === 0 ? config.color : config.secondaryColor;
        ctx.lineWidth = 2 * scaleFactor;
        ctx.beginPath();
        ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    } else if (style === 'Deep Tunnel') {
      // Rectangular 3D wireframe tunnel receding to infinity
      const depth = 8;
      const time = Date.now() * 0.002;
      for (let d = 1; d <= depth; d++) {
        const prog = ((d / depth) + time * 0.2) % 1.0;
        const val = (freqData[Math.floor(prog * count)] || 0) / 255;
        const sz = (prog * config.radius * 2.8 * scale) * (1 + val * 0.2 * multiplier);
        ctx.strokeStyle = d % 2 === 0 ? config.color : config.secondaryColor;
        ctx.lineWidth = 1.5 * scaleFactor;
        ctx.strokeRect(posX - sz / 2, posY - (sz * 0.6) / 2, sz, sz * 0.6);
      }
    } else if (style === 'Vortex') {
      // Swirling logarithmic spiral vortex
      const rings = 8;
      const time = Date.now() * 0.002;
      for (let r = 1; r <= rings; r++) {
        const val = (freqData[r % count] || 0) / 255;
        const rad = (r * 22 * scale) * (1 + val * 0.4 * multiplier);
        ctx.strokeStyle = r % 2 === 0 ? config.color : config.secondaryColor;
        ctx.lineWidth = 2 * scaleFactor;
        ctx.beginPath();
        ctx.arc(posX, posY, rad, time + r * 0.2, time + r * 0.2 + Math.PI * 1.5);
        ctx.stroke();
      }
    } else {
      // Hex Pulse / Diamond Lattice
      const baseR = config.radius * scale * multiplier;
      const sides = style === 'Diamond Lattice' ? 4 : 6;
      ctx.beginPath();
      ctx.strokeStyle = config.color;
      ctx.lineWidth = 3 * scaleFactor;
      for (let s = 0; s <= sides; s++) {
        const ang = (s / sides) * Math.PI * 2 + (style === 'Diamond Lattice' ? Math.PI / 4 : 0);
        const val = (freqData[s % count] || 0) / 255;
        const rad = baseR + val * config.height * 0.4 * scale;
        const x = posX + Math.cos(ang) * rad;
        const y = posY + Math.sin(ang) * rad;
        if (s === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  // 9. Special FX & Energy Fields
  private renderSpecialFX(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    width: number,
    height: number,
    posX: number,
    posY: number,
    scale: number,
    scaleFactor: number,
    config: SpectrumConfig,
    freqData: Uint8Array | Float32Array,
    count: number,
    beatFactor: number,
    multiplier: number,
    style: string
  ) {
    if (style === 'Api Bars') {
      // Flame lick jagged bars with fiery particle peaks
      const totalWidth = width * 0.75 * (config.scale ?? 1.0);
      const startX = posX - totalWidth / 2;
      const barWidth = Math.max(3 * scaleFactor, totalWidth / count - (3 * scaleFactor));
      const time = Date.now() * 0.006;

      for (let i = 0; i < count; i++) {
        const val = freqData[i] / 255;
        const flicker = Math.sin(time + i * 1.5) * 8 * scaleFactor;
        const barH = Math.max(5 * scaleFactor, val * config.height * scale * multiplier + flicker);
        const x = startX + i * (barWidth + 3 * scaleFactor);

        // Gradient flame body
        const grad = ctx.createLinearGradient(x, posY, x, posY - barH);
        grad.addColorStop(0, '#f97316');
        grad.addColorStop(0.65, '#ef4444');
        grad.addColorStop(1, '#fef08a');
        ctx.fillStyle = grad;

        // Jagged flame shape
        ctx.beginPath();
        ctx.moveTo(x, posY);
        ctx.lineTo(x, posY - barH * 0.85);
        ctx.lineTo(x + barWidth * 0.5, posY - barH);
        ctx.lineTo(x + barWidth, posY - barH * 0.85);
        ctx.lineTo(x + barWidth, posY);
        ctx.closePath();
        ctx.fill();

        // Spark sparkler above peak
        if (val > 0.4) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(x + barWidth * 0.5 - 1.5 * scaleFactor, posY - barH - (4 + Math.random() * 8) * scaleFactor, 3 * scaleFactor, 3 * scaleFactor);
        }
      }
    } else if (style === 'Api Radial') {
      // Radial sunburst flame blades
      const baseRadius = config.radius * scale;
      const angleStep = (Math.PI * 2) / count;
      const time = Date.now() * 0.005;

      for (let i = 0; i < count; i++) {
        const val = freqData[i] / 255;
        const flicker = Math.sin(time + i * 2) * 6 * scaleFactor;
        const flameLen = Math.max(4 * scaleFactor, val * config.height * scale * multiplier + flicker);
        const ang = i * angleStep;

        const x1 = posX + Math.cos(ang) * baseRadius;
        const y1 = posY + Math.sin(ang) * baseRadius;
        const x2 = posX + Math.cos(ang) * (baseRadius + flameLen);
        const y2 = posY + Math.sin(ang) * (baseRadius + flameLen);

        ctx.strokeStyle = val > 0.6 ? '#fef08a' : (val > 0.3 ? '#f97316' : '#ef4444');
        ctx.lineWidth = Math.max(2 * scaleFactor, (Math.PI * 2 * baseRadius) / count - (2 * scaleFactor));
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
    } else if (style === 'Plasma Ring') {
      // Electric arcing plasma discharge rays around circle
      const radius = config.radius * scale;
      const time = Date.now() * 0.004;
      for (let i = 0; i < count; i += 2) {
        const val = freqData[i] / 255;
        const angle = (i / count) * Math.PI * 2;
        const len = radius + val * config.height * scale * multiplier;
        const midR = radius + (len - radius) * 0.5;
        const jitter = Math.sin(time * 6 + i * 2) * 6 * scaleFactor;

        ctx.strokeStyle = config.color;
        ctx.lineWidth = 2 * scaleFactor;
        ctx.beginPath();
        ctx.moveTo(posX + Math.cos(angle) * radius, posY + Math.sin(angle) * radius);
        ctx.lineTo(posX + Math.cos(angle + 0.03) * midR + jitter, posY + Math.sin(angle + 0.03) * midR + jitter);
        ctx.lineTo(posX + Math.cos(angle) * len, posY + Math.sin(angle) * len);
        ctx.stroke();
      }
    } else if (style === 'Starburst') {
      // 8-point diffraction star spikes with audio expansion
      const spikes = 8;
      for (let s = 0; s < spikes; s++) {
        const val = (freqData[s * 2 % count] || 0) / 255;
        const ang = (s / spikes) * Math.PI * 2;
        const spikeLen = (config.radius * scale + val * config.height * 1.5 * scale) * multiplier;

        ctx.strokeStyle = s % 2 === 0 ? config.color : config.secondaryColor;
        ctx.lineWidth = 2.5 * scaleFactor;
        ctx.beginPath();
        ctx.moveTo(posX, posY);
        ctx.lineTo(posX + Math.cos(ang) * spikeLen, posY + Math.sin(ang) * spikeLen);
        ctx.stroke();
      }
    } else if (style === 'Aurora') {
      // Layered undulating translucent northern lights
      const totalWidth = width * 0.85 * (config.scale ?? 1.0);
      const startX = posX - totalWidth / 2;
      const time = Date.now() * 0.002;

      for (let layer = 0; layer < 3; layer++) {
        ctx.save();
        ctx.globalAlpha = config.opacity * (0.35 + layer * 0.15);
        ctx.fillStyle = layer === 0 ? config.color : (layer === 1 ? config.secondaryColor : '#06b6d4');
        ctx.beginPath();
        ctx.moveTo(startX, posY + 40 * scaleFactor);

        for (let i = 0; i < count; i++) {
          const val = freqData[i] / 255;
          const x = startX + (i / (count - 1)) * totalWidth;
          const wave = Math.sin(time * 2 + i * 0.15 + layer) * 20 * scaleFactor;
          const y = posY - val * config.height * 0.7 * scale * multiplier + wave;
          ctx.lineTo(x, y);
        }

        ctx.lineTo(startX + totalWidth, posY + 40 * scaleFactor);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    } else if (style === 'Kaleidoscope') {
      // 8-fold radial reflection symmetry
      const segments = 8;
      const anglePerSeg = (Math.PI * 2) / segments;
      const baseR = config.radius * 0.7 * scale;

      for (let s = 0; s < segments; s++) {
        ctx.save();
        ctx.translate(posX, posY);
        ctx.rotate(s * anglePerSeg);

        for (let i = 0; i < Math.floor(count / segments); i++) {
          const val = freqData[i] / 255;
          const h = val * config.height * 0.5 * scale * multiplier;
          const rad = baseR + i * 6 * scale;

          ctx.strokeStyle = i % 2 === 0 ? config.color : config.secondaryColor;
          ctx.lineWidth = 2 * scaleFactor;
          ctx.beginPath();
          ctx.arc(0, 0, rad, 0, (val * 0.3) + 0.05);
          ctx.stroke();
        }
        ctx.restore();
      }
    } else if (style === 'Radar Sweep') {
      const r = config.radius * scale * multiplier;
      ctx.strokeStyle = config.color;
      ctx.lineWidth = 2 * scaleFactor;
      ctx.beginPath();
      ctx.arc(posX, posY, r, 0, Math.PI * 2);
      ctx.stroke();
      const sweepAngle = (Date.now() * 0.002) % (Math.PI * 2);
      ctx.beginPath();
      ctx.moveTo(posX, posY);
      ctx.lineTo(posX + Math.cos(sweepAngle) * r, posY + Math.sin(sweepAngle) * r);
      ctx.stroke();
    } else {
      // Default fallback: neon waves
      this.renderWave(ctx, width, height, posX, posY, scale, scaleFactor, config, freqData, count, multiplier, style);
    }
  }
}
