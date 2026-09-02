import type { ParticleConfig } from '../types/project';

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  baseSize: number;
  alpha: number;
  color: string;
  rotation: number;
  vRot: number;
  shape?: 'star' | 'circle' | 'square' | 'petal';
}

const CONFETTI_COLORS = ['#38bdf8', '#f43f5e', '#fbbf24', '#34d399', '#a855f7', '#ec4899', '#f97316'];
const SPARK_COLORS = ['#ffedd5', '#fed7aa', '#fef08a', '#f59e0b', '#ef4444'];
const BOKEH_COLORS = ['#67e8f9', '#a78bfa', '#f472b6', '#fde047', '#6ee7b7'];

export class ParticleSystem {
  particles: Particle[] = [];
  width: number = 1920;
  height: number = 1080;
  currentPreset: string = '';

  constructor(width: number, height: number) {
    this.resize(width, height);
  }

  resize(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  init(config: ParticleConfig) {
    this.particles = [];
    this.currentPreset = config.preset;
    for (let i = 0; i < config.count; i++) {
      this.particles.push(this.createParticle(config));
    }
  }

  private createParticle(config: ParticleConfig): Particle {
    const scaleFactor = Math.min(this.width / 1920, this.height / 1080);
    const baseSize = (config.size || 6) * scaleFactor;
    let size = Math.max(1, (Math.random() * 0.8 + 0.4) * baseSize);
    let vx = (Math.random() - 0.5) * config.speed * 2 * scaleFactor;
    let vy = (Math.random() - 0.5) * config.speed * 2 * scaleFactor;
    let color = config.color || '#ffffff';
    let rotation = Math.random() * Math.PI * 2;
    let vRot = (Math.random() - 0.5) * 0.08;
    let shape: Particle['shape'] = 'circle';

    if (config.preset === 'bokeh') {
      size = Math.max(8 * scaleFactor, (Math.random() * 1.5 + 0.8) * baseSize * 2.5);
      vx = (Math.random() - 0.5) * config.speed * 0.6 * scaleFactor;
      vy = -Math.abs((Math.random() * 0.6 + 0.2) * config.speed * scaleFactor);
      color = config.color && config.color !== '#ffffff' 
        ? config.color 
        : BOKEH_COLORS[Math.floor(Math.random() * BOKEH_COLORS.length)];
    } else if (config.preset === 'confetti') {
      size = Math.max(3 * scaleFactor, (Math.random() * 0.8 + 0.6) * baseSize * 1.5);
      vx = (Math.random() - 0.5) * config.speed * 2.5 * scaleFactor;
      vy = (Math.random() * 1.8 + 0.8) * config.speed * scaleFactor;
      vRot = (Math.random() - 0.5) * 0.15;
      color = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
      shape = 'square';
    } else if (config.preset === 'snow') {
      size = Math.max(1.5 * scaleFactor, (Math.random() * 0.9 + 0.3) * baseSize);
      vx = Math.sin(Math.random() * Math.PI * 2) * config.speed * 0.7 * scaleFactor;
      vy = (Math.random() * 1.2 + 0.8) * config.speed * scaleFactor;
      color = config.color || '#ffffff';
    } else if (config.preset === 'sparks') {
      size = Math.max(1.5 * scaleFactor, (Math.random() * 0.7 + 0.3) * baseSize);
      vx = (Math.random() - 0.5) * config.speed * 4 * scaleFactor;
      vy = -Math.abs((Math.random() * 3 + 1) * config.speed * scaleFactor);
      color = config.color && config.color !== '#ffffff'
        ? config.color
        : SPARK_COLORS[Math.floor(Math.random() * SPARK_COLORS.length)];
      shape = 'star';
    } else {
      // floating-dust
      if (config.gravity === 'up') vy = -Math.abs(vy) - 0.5 * config.speed * scaleFactor;
      else if (config.gravity === 'down') vy = Math.abs(vy) + 0.5 * config.speed * scaleFactor;
    }

    return {
      x: Math.random() * this.width,
      y: Math.random() * this.height,
      vx,
      vy,
      size,
      baseSize: size,
      alpha: Math.random() * (config.opacity ?? 0.8) + 0.2,
      color,
      rotation,
      vRot,
      shape,
    };
  }

  updateAndRender(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    config: ParticleConfig,
    rawBeatFactor: number = 1.0
  ) {
    if (!config.enabled) return;

    if (this.particles.length !== config.count || this.currentPreset !== config.preset) {
      this.init(config);
    }

    const scaleFactor = Math.min(this.width / 1920, this.height / 1080);
    const sensitivity = config.beatSensitivity ?? 1.0;
    const beatFactor = 1.0 + (rawBeatFactor - 1.0) * sensitivity;

    ctx.save();

    switch (config.preset) {
      case 'bokeh':
        this.renderBokeh(ctx, config, beatFactor, scaleFactor);
        break;
      case 'confetti':
        this.renderConfetti(ctx, config, beatFactor, scaleFactor);
        break;
      case 'snow':
        this.renderSnow(ctx, config, beatFactor, scaleFactor);
        break;
      case 'sparks':
        this.renderSparks(ctx, config, beatFactor, scaleFactor);
        break;
      default:
        this.renderFloatingDust(ctx, config, beatFactor, scaleFactor);
        break;
    }

    ctx.restore();
  }

  private renderBokeh(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    config: ParticleConfig,
    beatFactor: number,
    scaleFactor: number
  ) {
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      p.x += p.vx * (config.followBeat ? 1 + (beatFactor - 1) * 0.35 : 1.0);
      p.y += p.vy * (config.followBeat ? 1 + (beatFactor - 1) * 0.35 : 1.0);

      if (p.x < -60 * scaleFactor) p.x = this.width + 60 * scaleFactor;
      if (p.x > this.width + 60 * scaleFactor) p.x = -60 * scaleFactor;
      if (p.y < -60 * scaleFactor) p.y = this.height + 60 * scaleFactor;
      if (p.y > this.height + 60 * scaleFactor) p.y = -60 * scaleFactor;

      const currentSize = config.followBeat ? p.baseSize * (1 + (beatFactor - 1) * 0.35) : p.baseSize;
      ctx.fillStyle = p.color;

      // Outer halo
      ctx.globalAlpha = p.alpha * (config.opacity ?? 0.6) * 0.25;
      ctx.beginPath();
      ctx.arc(p.x, p.y, currentSize * 1.4, 0, Math.PI * 2);
      ctx.fill();

      // Inner core
      ctx.globalAlpha = p.alpha * (config.opacity ?? 0.6) * 0.75;
      ctx.beginPath();
      ctx.arc(p.x, p.y, currentSize, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private renderConfetti(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    config: ParticleConfig,
    beatFactor: number,
    scaleFactor: number
  ) {
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      p.x += (p.vx + Math.sin(p.rotation) * 0.8 * scaleFactor) * (config.followBeat ? 1 + (beatFactor - 1) * 0.4 : 1.0);
      p.y += p.vy * (config.followBeat ? 1 + (beatFactor - 1) * 0.4 : 1.0);
      p.rotation += p.vRot;

      if (p.x < -30 * scaleFactor) p.x = this.width + 30 * scaleFactor;
      if (p.x > this.width + 30 * scaleFactor) p.x = -30 * scaleFactor;
      if (p.y > this.height + 30 * scaleFactor) {
        p.y = -30 * scaleFactor;
        p.x = Math.random() * this.width;
      }

      const currentSize = config.followBeat ? p.baseSize * (1 + (beatFactor - 1) * 0.25) : p.baseSize;
      ctx.globalAlpha = p.alpha * (config.opacity ?? 0.8);
      ctx.fillStyle = p.color;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.fillRect(-currentSize, -currentSize * 0.4, currentSize * 2, currentSize * 0.8);
      ctx.restore();
    }
  }

  private renderSnow(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    config: ParticleConfig,
    beatFactor: number,
    scaleFactor: number
  ) {
    ctx.fillStyle = config.color || '#ffffff';
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      p.rotation += p.vRot;
      p.x += (p.vx + Math.sin(p.rotation * 2) * 0.6 * scaleFactor) * (config.followBeat ? 1 + (beatFactor - 1) * 0.2 : 1.0);
      p.y += p.vy * (config.followBeat ? 1 + (beatFactor - 1) * 0.2 : 1.0);

      if (p.x < -20 * scaleFactor) p.x = this.width + 20 * scaleFactor;
      if (p.x > this.width + 20 * scaleFactor) p.x = -20 * scaleFactor;
      if (p.y > this.height + 20 * scaleFactor) {
        p.y = -20 * scaleFactor;
        p.x = Math.random() * this.width;
      }

      const currentSize = config.followBeat ? p.baseSize * (1 + (beatFactor - 1) * 0.2) : p.baseSize;
      ctx.globalAlpha = p.alpha * (config.opacity ?? 0.8);

      ctx.beginPath();
      ctx.arc(p.x, p.y, currentSize, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private renderSparks(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    config: ParticleConfig,
    beatFactor: number,
    scaleFactor: number
  ) {
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      p.x += p.vx * (config.followBeat ? 1 + (beatFactor - 1) * 0.8 : 1.0);
      p.y += p.vy * (config.followBeat ? 1 + (beatFactor - 1) * 0.8 : 1.0);

      if (p.x < -30 * scaleFactor) p.x = this.width + 30 * scaleFactor;
      if (p.x > this.width + 30 * scaleFactor) p.x = -30 * scaleFactor;
      if (p.y < -30 * scaleFactor) {
        p.y = this.height + 30 * scaleFactor;
        p.x = Math.random() * this.width;
      }

      const currentSize = config.followBeat ? p.baseSize * (1 + (beatFactor - 1) * 0.5) : p.baseSize;
      ctx.globalAlpha = p.alpha * (config.opacity ?? 0.9);
      ctx.strokeStyle = p.color;
      ctx.lineWidth = Math.max(1.5 * scaleFactor, currentSize * 0.6);

      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 3, p.y - p.vy * 3);
      ctx.stroke();
    }
  }

  private renderFloatingDust(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    config: ParticleConfig,
    beatFactor: number,
    scaleFactor: number
  ) {
    ctx.fillStyle = config.color || '#ffffff';
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      p.x += p.vx * (config.followBeat ? 1 + (beatFactor - 1) * 0.35 : 1.0);
      p.y += p.vy * (config.followBeat ? 1 + (beatFactor - 1) * 0.35 : 1.0);

      if (p.x < -20 * scaleFactor) p.x = this.width + 20 * scaleFactor;
      if (p.x > this.width + 20 * scaleFactor) p.x = -20 * scaleFactor;
      if (p.y < -20 * scaleFactor) p.y = this.height + 20 * scaleFactor;
      if (p.y > this.height + 20 * scaleFactor) p.y = -20 * scaleFactor;

      const currentSize = config.followBeat ? p.baseSize * (1 + (beatFactor - 1) * 0.25) : p.baseSize;
      ctx.globalAlpha = p.alpha * (config.opacity ?? 0.8);

      ctx.beginPath();
      ctx.arc(p.x, p.y, currentSize, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
