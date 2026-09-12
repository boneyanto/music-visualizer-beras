<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { projectStore } from '../stores/project.svelte';
  import { audioEngine } from '../audio/player';
  import { backgroundManager } from '../../features/backdrop';
  import { imageOverlayManager, videoOverlayManager } from '../../features/overlays';
  import { textOverlayManager } from '../../features/texts';
  import { tracklistOverlayRenderer } from '../../features/tracklist';
  import { ParticleSystem } from '../../features/particles';
  import { SpectrumRenderer } from '../../features/spectrum';
  import { LyricRenderer } from '../../features/lyrics';
  import { videoExporter } from '../../features/export';
  import { Play, Pause, RotateCcw } from '@lucide/svelte';

  let canvasRef: HTMLCanvasElement;
  let animId: number;
  let isBeatHit = $state(false);

  const particles = new ParticleSystem(1920, 1080);
  const spectrum = new SpectrumRenderer();
  const lyrics = new LyricRenderer();

  const fallbackFreq = new Uint8Array(128);

  async function togglePlay() {
    if (projectStore.isPlaying) {
      audioEngine.pause();
    } else {
      if (projectStore.audioBuffer) {
        await audioEngine.play(projectStore.audioBuffer, projectStore.currentTime);
      } else {
        projectStore.isPlaying = true;
      }
    }
  }

  function handleRestart() {
    projectStore.currentTime = 0;
    if (projectStore.audioBuffer) {
      audioEngine.seek(0, projectStore.audioBuffer);
    }
  }

  let lastStoreTimeUpdate = 0;
  let lastFrameTime = 0;
  let frameTimer: any = null;

  function scheduleNextFrame() {
    if (videoExporter.isExporting) return;
    if (animId || frameTimer) return;

    // Power-Saving Idle Sleep:
    // When playing: schedule 60 FPS (16.6ms) for smooth playback.
    // When paused / idle: do NOT loop continuously! The canvas is completely at rest (0% CPU).
    if (!projectStore.isPlaying) {
      return;
    }

    const targetInterval = 1000 / 60;
    const now = performance.now();
    const elapsed = now - lastFrameTime;
    const remaining = Math.max(0, targetInterval - elapsed);

    if (remaining <= 2) {
      animId = requestAnimationFrame(renderFrame);
    } else {
      frameTimer = setTimeout(() => {
        frameTimer = null;
        animId = requestAnimationFrame(renderFrame);
      }, remaining);
    }
  }

  // Force render a single frame on demand (e.g. when paused and user tweaks sliders)
  function requestSingleRender() {
    if (videoExporter.isExporting) return;
    if (!animId && !frameTimer) {
      animId = requestAnimationFrame(renderFrame);
    }
  }

  function renderFrame(timestamp: number = performance.now()) {
    animId = 0;
    if (!canvasRef) return;

    // Zero-Overhead Render Shutter: Halt completely during export
    if (videoExporter.isExporting) {
      return;
    }

    lastFrameTime = timestamp;

    const ctx = canvasRef.getContext('2d');
    if (!ctx) return;

    const width = projectStore.project.exportSettings.width;
    const height = projectStore.project.exportSettings.height;

    // Resize canvas internal buffer if needed
    if (canvasRef.width !== width || canvasRef.height !== height) {
      canvasRef.width = width;
      canvasRef.height = height;
      particles.resize(width, height);
    }

    // High-Precision Local Audio Clock (Zero-lag reading directly from hardware audio engine)
    let curTime = projectStore.currentTime;
    if (projectStore.isPlaying) {
      if (projectStore.audioBuffer) {
        curTime = audioEngine.getCurrentTime();
      } else {
        curTime += 1 / 60;
        if (curTime > (projectStore.project.audio.duration || 180)) {
          curTime = 0;
        }
      }

      // Throttle Svelte 5 rune state update to ~15 FPS (every 66ms)
      // This eliminates heavy DOM re-renders and CPU thread locks on Windows WebView2!
      const now = performance.now();
      if (now - lastStoreTimeUpdate >= 66) {
        projectStore.currentTime = curTime;
        lastStoreTimeUpdate = now;
      }
    } else {
      curTime = projectStore.currentTime;
    }

    // Smooth Continuous Beat Interpolation (Deterministic Exponential Decay with Resting Clamp)
    let beatFactor = 1.0;

    if (projectStore.beats.length > 0) {
      const beats = projectStore.beats;
      let low = 0, high = beats.length - 1;
      let closestPastBeat = -1;
      while (low <= high) {
        const mid = (low + high) >> 1;
        if (beats[mid] <= curTime + 0.02) {
          closestPastBeat = beats[mid];
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }

      if (closestPastBeat >= 0) {
        const deltaT = curTime - closestPastBeat;
        if (deltaT >= 0 && deltaT < 0.32) {
          const energy = Math.exp(-deltaT / 0.16);
          if (energy > 0.01) {
            beatFactor = 1.0 + energy * 0.25;
            isBeatHit = deltaT < 0.08;
          } else {
            isBeatHit = false;
          }
        } else {
          isBeatHit = false;
        }
      } else {
        isBeatHit = false;
      }
    } else {
      const beatInterval = 0.5; // 120 BPM fallback
      const phase = (curTime % beatInterval);
      if (phase < 0.32) {
        const energy = Math.exp(-phase / 0.16);
        if (energy > 0.01) {
          beatFactor = 1.0 + energy * 0.25;
          isBeatHit = phase < 0.08;
        } else {
          isBeatHit = false;
        }
      } else {
        isBeatHit = false;
      }
    }

    // Direct read of pre-smoothed frequency frames (O(1), zero loop overhead)
    let currentFreq: Uint8Array;
    if (projectStore.frequencyFrames.length > 0) {
      const frameIdx = Math.min(
        projectStore.frequencyFrames.length - 1,
        Math.floor(curTime / projectStore.frameDuration)
      );
      currentFreq = projectStore.frequencyFrames[frameIdx] || fallbackFreq;
    } else {
      for (let i = 0; i < fallbackFreq.length; i++) {
        const wave = Math.sin(curTime * 6 + i * 0.2);
        fallbackFreq[i] = Math.max(20, Math.min(255, Math.floor((wave * 0.5 + 0.5) * 180 * beatFactor)));
      }
      currentFreq = fallbackFreq;
    }

    // Sync video overlays & background video playback state
    videoOverlayManager.syncPlayback(projectStore.isPlaying, curTime);
    backgroundManager.syncPlayback(projectStore.isPlaying, curTime);

    // 1. Clear & Render Background
    backgroundManager.render(
      ctx,
      width,
      height,
      projectStore.project.background,
      curTime,
      beatFactor
    );

    // 2. Render Video Overlays
    const videoBeatMap: Record<string, number> = {};
    if (projectStore.project.overlays.videos) {
      for (const v of projectStore.project.overlays.videos) {
        const sens = v.beatSensitivity ?? 1.0;
        videoBeatMap[v.id] = 1.0 + (beatFactor - 1.0) * sens;
      }
      videoOverlayManager.render(
        ctx,
        width,
        height,
        projectStore.project.overlays.videos,
        curTime,
        videoBeatMap
      );
    }

    // 3. Render Image Overlays
    imageOverlayManager.render(
      ctx,
      width,
      height,
      projectStore.project.overlays.images || [],
      curTime,
      beatFactor
    );

    // 4. Render Text Overlays
    textOverlayManager.render(
      ctx,
      width,
      height,
      projectStore.project.overlays.texts || [],
      curTime,
      beatFactor
    );

    // 4b. Render Tracklist Playlist Overlay (with active now-playing animation)
    tracklistOverlayRenderer.render(
      ctx,
      width,
      height,
      projectStore.project.overlays.tracklist,
      projectStore.project.audio.tracks,
      curTime,
      beatFactor
    );

    // 5. Render Particle, Spectrum, Lyrics
    particles.updateAndRender(ctx, projectStore.project.overlays.particle, beatFactor, projectStore.isPlaying);
    if (projectStore.project.overlays.spectrums && projectStore.project.overlays.spectrums.length > 0) {
      for (let i = 0; i < projectStore.project.overlays.spectrums.length; i++) {
        spectrum.render(ctx, width, height, projectStore.project.overlays.spectrums[i], currentFreq, beatFactor);
      }
    } else if (projectStore.project.overlays.spectrum) {
      spectrum.render(ctx, width, height, projectStore.project.overlays.spectrum, currentFreq, beatFactor);
    }
    lyrics.render(
      ctx, 
      width, 
      height, 
      projectStore.project.lyrics.config, 
      projectStore.project.lyrics.segments, 
      curTime, 
      beatFactor
    );

    scheduleNextFrame();
  }

  $effect(() => {
    // Automatically load background assets whenever items change or rehydrate
    const bgItems = projectStore.project.background?.items;
    if (bgItems && bgItems.length > 0) {
      bgItems.forEach((item) => {
        if (item.url) {
          backgroundManager.loadAsset(item).catch(() => {});
        }
      });
    }
  });

  $effect(() => {
    // Automatically preload overlay images whenever items change or rehydrate
    const imgItems = projectStore.project.overlays?.images;
    if (imgItems && imgItems.length > 0) {
      imgItems.forEach((item) => {
        if (item.url) {
          imageOverlayManager.preloadImage(item).catch(() => {});
        }
      });
    }
  });

  $effect(() => {
    // Invalidate text overlay cache whenever texts list or properties change
    const texts = projectStore.project.overlays?.texts;
    if (texts) {
      // Touch properties to track reactivity
      texts.forEach(t => `${t.text}-${t.fontFamily}-${t.fontSize}-${t.color}-${t.stroke}-${t.strokeWidth}-${t.strokeColor}-${t.shadow}`);
      textOverlayManager.clearCache();
    }
  });

  $effect(() => {
    // Zero-Overhead Render Shutter: Resume preview rendering when export ends, or pause when export starts
    if (videoExporter.isExporting) {
      if (animId) {
        cancelAnimationFrame(animId);
        animId = 0;
      }
      if (frameTimer) {
        clearTimeout(frameTimer);
        frameTimer = null;
      }
    } else {
      requestSingleRender();
    }
  });

  // Wake up loop when user clicks Play / Pause
  $effect(() => {
    if (projectStore.isPlaying) {
      scheduleNextFrame();
    } else {
      // Render one final frame so the pause state visually matches
      requestSingleRender();
    }
  });

  // Re-render single frame whenever currentTime is scrubbed while paused
  $effect(() => {
    const _t = projectStore.currentTime;
    if (!projectStore.isPlaying) {
      requestSingleRender();
    }
  });

  // Re-render single frame when overlays or settings change while paused
  $effect(() => {
    // Touch reactive properties
    const _p = projectStore.project;
    if (!projectStore.isPlaying) {
      requestSingleRender();
    }
  });

  onMount(() => {
    requestSingleRender();
  });

  onDestroy(() => {
    if (animId) cancelAnimationFrame(animId);
    if (frameTimer) clearTimeout(frameTimer);
  });
</script>

<div class="flex-1 flex flex-col bg-neutral-950 relative overflow-hidden select-none">
  <!-- Top Preview Bar -->
  <div class="h-10 px-4 flex items-center justify-between border-b border-neutral-900/60 bg-neutral-900/30 text-xs text-neutral-400">
    <div class="flex items-center gap-2">
      <span class="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
      <span>Preview (Canvas 2D Realtime)</span>
    </div>
    <div class="flex items-center gap-3">
      <span>Resolution: {projectStore.project.exportSettings.resolution}</span>
      <span>FPS: {projectStore.project.exportSettings.fps}</span>
    </div>
  </div>

  <!-- Central Visualizer Area -->
  <div class="flex-1 flex items-center justify-center p-4 relative overflow-hidden min-h-0">
    <div 
      class="relative shadow-2xl rounded-xl overflow-hidden border border-neutral-800 bg-neutral-900 flex items-center justify-center group"
      style={`aspect-ratio: ${projectStore.project.exportSettings.width} / ${projectStore.project.exportSettings.height}; max-height: 100%; max-width: 100%;`}
    >
      <canvas 
        bind:this={canvasRef} 
        class="w-full h-full object-contain block"
        width={projectStore.project.exportSettings.width}
        height={projectStore.project.exportSettings.height}
      ></canvas>

      <!-- Center Floating Play/Pause Button -->
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div 
        onclick={togglePlay}
        class="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
      >
        <div class="w-16 h-16 rounded-full bg-cyan-500/90 hover:bg-cyan-400 text-neutral-950 flex items-center justify-center shadow-2xl shadow-cyan-500/40 transform group-hover:scale-105 transition-all">
          {#if projectStore.isPlaying}
            <Pause class="w-8 h-8 fill-current" />
          {:else}
            <Play class="w-8 h-8 fill-current ml-1" />
          {/if}
        </div>
      </div>
    </div>
  </div>

  <!-- Bottom Playback Controls -->
  <div class="h-14 px-6 border-t border-neutral-900 bg-neutral-900/90 flex items-center justify-between shrink-0 z-10">
    <div class="flex items-center gap-3">
      <button 
        onclick={togglePlay}
        class="w-10 h-10 rounded-full bg-cyan-500 hover:bg-cyan-400 text-neutral-950 flex items-center justify-center transition-all shadow-lg shadow-cyan-500/20 active:scale-95 cursor-pointer"
        title={projectStore.isPlaying ? 'Pause' : 'Play'}
      >
        {#if projectStore.isPlaying}
          <Pause class="w-5 h-5 fill-current" />
        {:else}
          <Play class="w-5 h-5 fill-current ml-0.5" />
        {/if}
      </button>

      <button 
        onclick={handleRestart}
        class="p-2 rounded-lg text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors cursor-pointer"
        title="Restart (0:00)"
      >
        <RotateCcw class="w-4 h-4" />
      </button>

      <div class="text-xs font-mono text-neutral-300">
        <span>{Math.floor(projectStore.currentTime / 60)}:{(Math.floor(projectStore.currentTime % 60)).toString().padStart(2, '0')}</span>
        <span class="text-neutral-500"> / </span>
        <span class="text-neutral-500">{Math.floor(projectStore.project.audio.duration / 60)}:{(Math.floor(projectStore.project.audio.duration % 60)).toString().padStart(2, '0')}</span>
      </div>
    </div>

    <!-- Live Beat Indicator -->
    <div class="flex items-center gap-2 px-3 py-1.5 rounded-full bg-neutral-950/80 border border-neutral-800">
      <span class="text-[11px] font-medium text-neutral-400">BEAT</span>
      <div 
        class={`w-2.5 h-2.5 rounded-full transition-all duration-75 ${isBeatHit ? 'bg-fuchsia-500 scale-125 shadow-md shadow-fuchsia-500' : 'bg-neutral-700 scale-100'}`}
      ></div>
    </div>
  </div>
</div>
