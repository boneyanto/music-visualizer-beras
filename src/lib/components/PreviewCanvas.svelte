<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { projectStore } from '../stores/project.svelte';
  import { audioEngine } from '../audio/player';
  import { backgroundManager } from '../engine/background.svelte';
  import { imageOverlayManager } from '../engine/imageOverlay.svelte';
  import { videoOverlayManager } from '../engine/videoOverlay.svelte';
  import { textOverlayManager } from '../engine/textOverlay.svelte';
  import { tracklistOverlayRenderer } from '../engine/tracklistOverlay.svelte';
  import { ParticleSystem } from '../engine/particles';
  import { SpectrumRenderer } from '../engine/spectrum';
  import { LyricRenderer } from '../engine/lyrics';
  import { videoExporter } from '../engine/exporter.svelte';
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

  function renderFrame() {
    if (!canvasRef) return;

    // Liberate 100% of GPU & CPU for export worker while video export is running
    if (videoExporter.isExporting) {
      animId = requestAnimationFrame(renderFrame);
      return;
    }

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

    // Sync time with audio engine
    if (projectStore.isPlaying) {
      if (projectStore.audioBuffer) {
        projectStore.currentTime = audioEngine.getCurrentTime();
      } else {
        projectStore.currentTime += 1 / 60;
        if (projectStore.currentTime > (projectStore.project.audio.duration || 180)) {
          projectStore.currentTime = 0;
        }
      }
    }

    // Smooth Continuous Beat Interpolation
    let rawBeatTarget = 1.0;
    if (projectStore.beats.length > 0) {
      const curTime = projectStore.currentTime;
      const nearBeat = projectStore.beats.some((b) => Math.abs(b - curTime) < 0.06);
      if (nearBeat) {
        rawBeatTarget = 1.35;
        isBeatHit = true;
      } else {
        isBeatHit = false;
      }
    } else {
      const beatPhase = (projectStore.currentTime * 2.0) % 1;
      rawBeatTarget = beatPhase < 0.12 ? 1.25 : 1.0;
      isBeatHit = beatPhase < 0.12;
    }

    const beatFactor = 1.0 + (rawBeatTarget - 1.0) * 0.7;

    // Current FFT frequency spectrum
    let currentFreq: Uint8Array;
    if (projectStore.frequencyFrames.length > 0) {
      const frameIdx = Math.min(
        projectStore.frequencyFrames.length - 1,
        Math.floor(projectStore.currentTime / projectStore.frameDuration)
      );
      currentFreq = projectStore.frequencyFrames[frameIdx] || fallbackFreq;
    } else {
      for (let i = 0; i < fallbackFreq.length; i++) {
        const wave = Math.sin(projectStore.currentTime * 6 + i * 0.2);
        fallbackFreq[i] = Math.max(20, Math.min(255, Math.floor((wave * 0.5 + 0.5) * 180 * beatFactor)));
      }
      currentFreq = fallbackFreq;
    }

    // Sync video overlays playback state
    videoOverlayManager.syncPlayback(projectStore.isPlaying, projectStore.currentTime);

    // 1. Clear & Render Background
    backgroundManager.render(
      ctx,
      width,
      height,
      projectStore.project.background,
      projectStore.currentTime,
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
        projectStore.currentTime,
        videoBeatMap
      );
    }

    // 3. Render Image Overlays
    imageOverlayManager.render(
      ctx,
      width,
      height,
      projectStore.project.overlays.images || [],
      projectStore.currentTime,
      beatFactor
    );

    // 4. Render Text Overlays
    textOverlayManager.render(
      ctx,
      width,
      height,
      projectStore.project.overlays.texts || [],
      projectStore.currentTime,
      beatFactor
    );

    // 4b. Render Tracklist Playlist Overlay (with active now-playing animation)
    tracklistOverlayRenderer.render(
      ctx,
      width,
      height,
      projectStore.project.overlays.tracklist,
      projectStore.project.audio.tracks,
      projectStore.currentTime,
      beatFactor
    );

    // 5. Render Particle, Spectrum, Lyrics
    particles.updateAndRender(ctx, projectStore.project.overlays.particle, beatFactor);
    spectrum.render(ctx, width, height, projectStore.project.overlays.spectrum, currentFreq, beatFactor);
    lyrics.render(
      ctx, 
      width, 
      height, 
      projectStore.project.lyrics.config, 
      projectStore.project.lyrics.segments, 
      projectStore.currentTime, 
      beatFactor
    );

    animId = requestAnimationFrame(renderFrame);
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

  onMount(() => {
    animId = requestAnimationFrame(renderFrame);
  });

  onDestroy(() => {
    if (animId) cancelAnimationFrame(animId);
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
