<script lang="ts">
  import { projectStore } from '../stores/project.svelte';
  import { db } from '../db/database';
  import { backgroundManager } from '../engine/background.svelte';
  import { imageOverlayManager } from '../engine/imageOverlay.svelte';
  import { videoOverlayManager } from '../engine/videoOverlay.svelte';
  import { SubtitleService } from '../services/subtitle';
  import type { BackgroundItem, ImageOverlayItem, VideoOverlayItem } from '../types/project';
  import { 
    Layers, 
    Sparkles, 
    Music2, 
    Type, 
    UploadCloud, 
    Video, 
    Sliders, 
    Plus, 
    Trash2, 
    Move, 
    Activity,
    Zap,
    ChevronUp,
    ChevronDown,
    Music,
    FolderOpen,
    Download
  } from '@lucide/svelte';

  let { onOpenLyrics }: { onOpenLyrics?: () => void } = $props();
  let sidebarSubtitleInput = $state<HTMLInputElement>();

  async function handleSidebarImportSubtitle(e: Event) {
    const target = e.target as HTMLInputElement;
    if (target.files && target.files[0]) {
      const file = target.files[0];
      try {
        const text = await file.text();
        const parsed = SubtitleService.parseSubtitleText(text);
        if (!parsed || parsed.length === 0) {
          alert('Tidak ada baris subtitle valid di file ini.');
          return;
        }

        projectStore.project.lyrics.segments = parsed;
        projectStore.project.lyrics.config.enabled = true;
        projectStore.saveToDB();
        alert(`Berhasil memuat ${parsed.length} baris subtitle!`);
      } catch (err: any) {
        alert('Gagal membaca file subtitle: ' + err.message);
      }
      target.value = '';
    }
  }

  async function handleBackgroundUpload(e: Event) {
    const target = e.target as HTMLInputElement;
    if (!target.files || target.files.length === 0) return;

    const isMulti = projectStore.project.background.type.startsWith('multi');
    if (!isMulti) {
      for (const item of projectStore.project.background.items) {
        if (item.url && item.url.startsWith('blob:')) {
          URL.revokeObjectURL(item.url);
        }
        backgroundManager.releaseAsset(item.id);
      }
      projectStore.project.background.items = [];
    }

    for (let i = 0; i < target.files.length; i++) {
      const file = target.files[i];
      const id = 'bg-' + Math.random().toString(36).substring(2, 9);
      const url = URL.createObjectURL(file);
      const isVideo = file.type.startsWith('video');

      const newItem: BackgroundItem = {
        id,
        name: file.name,
        type: isVideo ? 'video' : 'image',
        url,
        file,
        duration: 5.0,
      };

      await backgroundManager.loadAsset(newItem);

      try {
        await db.assets.put({
          id,
          projectId: projectStore.project.id,
          name: file.name,
          type: isVideo ? 'video' : 'image',
          blob: file,
          createdAt: Date.now(),
        });
      } catch (err) {
        console.warn('Could not cache asset in IndexedDB:', err);
      }

      if (!isMulti) {
        projectStore.project.background.items = [newItem];
        break;
      } else {
        projectStore.project.background.items.push(newItem);
      }
    }
    projectStore.saveToDB();
  }

  function removeBackgroundItem(id: string) {
    const item = projectStore.project.background.items.find((i) => i.id === id);
    if (item?.url && item.url.startsWith('blob:')) {
      URL.revokeObjectURL(item.url);
    }
    backgroundManager.releaseAsset(id);
    projectStore.project.background.items = projectStore.project.background.items.filter((item) => item.id !== id);
    db.assets.delete(id).catch(() => {});
    projectStore.saveToDB();
  }

  async function handleImageOverlayUpload(e: Event) {
    const target = e.target as HTMLInputElement;
    if (!target.files || target.files.length === 0) return;

    for (let i = 0; i < target.files.length; i++) {
      const file = target.files[i];
      const id = 'overlay-' + Math.random().toString(36).substring(2, 9);
      const url = URL.createObjectURL(file);

      const newItem: ImageOverlayItem = {
        id,
        name: file.name,
        url,
        file,
        x: 0.5,
        y: 0.5,
        scale: 0.5,
        opacity: 1.0,
        rotation: 0,
        animation: 'none',
        followBeat: false,
        beatSensitivity: 1.0,
      };

      await imageOverlayManager.preloadImage(newItem);

      try {
        await db.assets.put({
          id,
          projectId: projectStore.project.id,
          name: file.name,
          type: 'image',
          blob: file,
          createdAt: Date.now(),
        });
      } catch (err) {
        console.warn('Could not cache overlay in IndexedDB:', err);
      }

      projectStore.project.overlays.images.push(newItem);
    }
    projectStore.saveToDB();
  }

  function removeImageOverlay(id: string) {
    const item = projectStore.project.overlays.images.find((img) => img.id === id);
    if (item?.url && item.url.startsWith('blob:')) {
      URL.revokeObjectURL(item.url);
    }
    imageOverlayManager.releaseAsset(id);
    projectStore.project.overlays.images = projectStore.project.overlays.images.filter((img) => img.id !== id);
    db.assets.delete(id).catch(() => {});
    projectStore.saveToDB();
  }

  async function handleVideoOverlayUpload(e: Event) {
    const target = e.target as HTMLInputElement;
    if (!target.files || target.files.length === 0) return;

    for (let i = 0; i < target.files.length; i++) {
      const file = target.files[i];
      const id = 'vid-overlay-' + Math.random().toString(36).substring(2, 9);
      const url = URL.createObjectURL(file);

      const newItem: VideoOverlayItem = {
        id,
        name: file.name,
        url,
        file,
        x: 0.5,
        y: 0.5,
        scale: 0.6,
        opacity: 1.0,
        blendMode: 'source-over',
        chromaKey: {
          enabled: false,
          color: '#00ff00',
          similarity: 0.4,
          smoothness: 0.1,
        },
        animation: 'none',
        followBeat: false,
        beatSensitivity: 1.0,
      };

      await videoOverlayManager.loadVideo(newItem);

      try {
        await db.assets.put({
          id,
          projectId: projectStore.project.id,
          name: file.name,
          type: 'video',
          blob: file,
          createdAt: Date.now(),
        });
      } catch (err) {
        console.warn('Could not cache video in IndexedDB:', err);
      }

      if (!projectStore.project.overlays.videos) {
        projectStore.project.overlays.videos = [];
      }
      projectStore.project.overlays.videos.push(newItem);
    }
    projectStore.saveToDB();
  }

  function removeVideoOverlay(id: string) {
    const item = projectStore.project.overlays.videos?.find((v) => v.id === id);
    if (item?.url && item.url.startsWith('blob:')) {
      URL.revokeObjectURL(item.url);
    }
    videoOverlayManager.releaseAsset(id);
    projectStore.project.overlays.videos = projectStore.project.overlays.videos.filter((v) => v.id !== id);
    db.assets.delete(id).catch(() => {});
    projectStore.saveToDB();
  }
</script>

<aside class="w-80 border-l border-neutral-800 bg-neutral-900/90 flex flex-col shrink-0 h-full overflow-y-auto select-none text-xs">
  <!-- Tab Header Title -->
  <div class="p-4 border-b border-neutral-800 flex items-center justify-between">
    <div class="flex items-center gap-2">
      {#if projectStore.activeTab === 'background'}
        <Layers class="w-4 h-4 text-cyan-400" />
        <span class="font-semibold text-neutral-200">Background Layer</span>
      {:else if projectStore.activeTab === 'spectrum'}
        <Music2 class="w-4 h-4 text-cyan-400" />
        <span class="font-semibold text-neutral-200">Audio Spectrum</span>
      {:else if projectStore.activeTab === 'particles'}
        <Sparkles class="w-4 h-4 text-cyan-400" />
        <span class="font-semibold text-neutral-200">Particle Effects</span>
      {:else if projectStore.activeTab === 'images'}
        <UploadCloud class="w-4 h-4 text-cyan-400" />
        <span class="font-semibold text-neutral-200">Image & Video Overlays</span>
      {:else if projectStore.activeTab === 'texts'}
        <Type class="w-4 h-4 text-cyan-400" />
        <span class="font-semibold text-neutral-200">Text Overlays</span>
      {:else if projectStore.activeTab === 'lyrics'}
        <Type class="w-4 h-4 text-cyan-400" />
        <span class="font-semibold text-neutral-200">Lyric Style & Typography</span>
      {:else if projectStore.activeTab === 'tracklist-overlay'}
        <Sliders class="w-4 h-4 text-cyan-400" />
        <span class="font-semibold text-neutral-200">Tracklist Overlay & Now Playing</span>
      {:else if projectStore.activeTab === 'export'}
        <Zap class="w-4 h-4 text-cyan-400" />
        <span class="font-semibold text-neutral-200">WebCodecs Video Export</span>
      {/if}
    </div>
  </div>

  <div class="p-4 space-y-6 flex-1">
    <!-- BACKGROUND TAB -->
    {#if projectStore.activeTab === 'background'}
      <div class="space-y-4">
        <div>
          <span class="block text-neutral-400 mb-1.5 font-medium">Type</span>
          <select 
            bind:value={projectStore.project.background.type}
            onchange={() => projectStore.saveToDB()}
            class="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-2 text-neutral-200 focus:border-cyan-500 outline-none cursor-pointer"
          >
            <option value="single-image">Single Image</option>
            <option value="multi-image">Multi Image (Slideshow)</option>
            <option value="single-video">Single Video</option>
            <option value="multi-video">Multi Video (Sequence)</option>
          </select>
        </div>

        <!-- Asset Uploader -->
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-neutral-400 font-medium">Background Assets ({projectStore.project.background.items.length})</span>
            <label class="px-2 py-1 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 text-[11px] font-medium flex items-center gap-1 cursor-pointer hover:bg-cyan-500/20 transition-colors">
              <Plus class="w-3 h-3" />
              Add Media
              <input 
                type="file" 
                accept="image/*,video/*" 
                multiple={projectStore.project.background.type.startsWith('multi')}
                class="hidden" 
                onchange={handleBackgroundUpload} 
              />
            </label>
          </div>

          <!-- Asset List -->
          <div class="space-y-1.5 max-h-48 overflow-y-auto">
            {#each projectStore.project.background.items as item, index}
              <div class="flex items-center justify-between p-2 rounded-lg bg-neutral-950 border border-neutral-800 text-xs group">
                <div class="flex items-center gap-2 min-w-0">
                  <span class="text-[10px] font-mono text-neutral-500 w-4">{index + 1}.</span>
                  <span class="truncate font-medium text-neutral-200">{item.name}</span>
                  <span class="text-[9px] px-1 rounded bg-neutral-800 text-neutral-400 uppercase">{item.type}</span>
                </div>
                <div class="flex items-center gap-1 opacity-80 group-hover:opacity-100">
                  <button 
                    onclick={() => removeBackgroundItem(item.id)}
                    class="p-1 rounded text-neutral-500 hover:text-rose-400 hover:bg-neutral-800 cursor-pointer"
                    title="Remove"
                  >
                    <Trash2 class="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            {/each}

            {#if projectStore.project.background.items.length === 0}
              <div class="p-4 rounded-lg border border-dashed border-neutral-800 text-center text-neutral-500 text-[11px]">
                No background assets added yet.
              </div>
            {/if}
          </div>
        </div>

        {#if projectStore.project.background.type.startsWith('multi')}
          <div>
            <span class="block text-neutral-400 mb-1.5 font-medium">Transition Effect</span>
            <select 
              bind:value={projectStore.project.background.transition}
              onchange={() => projectStore.saveToDB()}
              class="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-2 text-neutral-200 focus:border-cyan-500 outline-none cursor-pointer"
            >
              <option value="crossfade">Smooth Crossfade</option>
              <option value="fade">Fade to Black</option>
              <option value="cut">Instant Cut</option>
            </select>
          </div>
        {/if}

        <div>
          <span class="block text-neutral-400 mb-1.5 font-medium">Scale Mode</span>
          <div class="grid grid-cols-3 gap-1 bg-neutral-950 p-1 rounded-lg border border-neutral-800">
            {#each ['cover', 'contain', 'stretch'] as mode}
              <button 
                class={`py-1 rounded capitalize font-medium cursor-pointer ${projectStore.project.background.scaleMode === mode ? 'bg-neutral-800 text-cyan-400' : 'text-neutral-400 hover:text-neutral-200'}`}
                onclick={() => { projectStore.project.background.scaleMode = mode as any; projectStore.saveToDB(); }}
              >
                {mode}
              </button>
            {/each}
          </div>
        </div>

        <!-- Background Brightness Adjustment -->
        <div class="space-y-1.5">
          <div class="flex justify-between text-neutral-400 text-[11px]">
            <span>Background Brightness</span>
            <span>{Math.round((projectStore.project.background.brightness ?? 1.0) * 100)}%</span>
          </div>
          <input 
            type="range" 
            min="0.1" 
            max="2.0" 
            step="0.05" 
            bind:value={projectStore.project.background.brightness} 
            onchange={() => projectStore.saveToDB()} 
            class="w-full accent-cyan-500 cursor-pointer" 
          />
        </div>

        <!-- Follow Beat Toggle & Sensitivity -->
        <div class="p-3 bg-neutral-950/60 rounded-lg border border-neutral-800/80 space-y-2">
          <div class="flex items-center justify-between">
            <div>
              <div class="font-medium text-neutral-200 flex items-center gap-1.5">
                <Activity class="w-3.5 h-3.5 text-fuchsia-400" />
                Follow Beat
              </div>
              <div class="text-[11px] text-neutral-500">Auto pulse/scale on audio beat</div>
            </div>
            <input 
              type="checkbox" 
              bind:checked={projectStore.project.background.followBeat}
              onchange={() => projectStore.saveToDB()}
              class="accent-cyan-500 w-4 h-4 cursor-pointer"
            />
          </div>

          {#if projectStore.project.background.followBeat}
            <div>
              <div class="flex justify-between text-neutral-400 text-[11px] mb-1">
                <span>Beat Pulse Sensitivity</span>
                <span>{(projectStore.project.background.beatSensitivity ?? 1.0).toFixed(1)}x</span>
              </div>
              <input 
                type="range" 
                min="0.2" 
                max="3.0" 
                step="0.1" 
                bind:value={projectStore.project.background.beatSensitivity}
                onchange={() => projectStore.saveToDB()}
                class="w-full accent-fuchsia-500 cursor-pointer"
              />
            </div>
          {/if}
        </div>
      </div>

    <!-- SPECTRUM TAB -->
    {:else if projectStore.activeTab === 'spectrum'}
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <span class="font-medium text-neutral-300">Enable Spectrum</span>
          <input 
            type="checkbox" 
            bind:checked={projectStore.project.overlays.spectrum.enabled}
            onchange={() => projectStore.saveToDB()}
            class="accent-cyan-500 w-4 h-4 cursor-pointer"
          />
        </div>

        <div>
          <span class="block text-neutral-400 mb-1.5 font-medium">Style</span>
          <select 
            bind:value={projectStore.project.overlays.spectrum.style}
            onchange={() => projectStore.saveToDB()}
            class="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-2 text-neutral-200 focus:border-cyan-500 outline-none cursor-pointer"
          >
            <option value="circular">Circular Spectrum (Classic)</option>
            <option value="bars">Equalizer Bars (Bottom)</option>
            <option value="center-bars">Center Mirror Bars (Monstercat / NCS)</option>
            <option value="neon-wave">Neon Wave (Glowing Smooth Curve)</option>
            <option value="double-circular">Double Starburst Circle (In & Out)</option>
            <option value="digital-eq">Digital LED Blocks (Hi-Fi Equalizer)</option>
            <option value="dots-ring">Dots Constellation Ring</option>
            <option value="pulse-rings">Concentric Sound Ripples</option>
            <option value="radial-bars">Radial Orbit Bars</option>
            <option value="waveform">Waveform Oscilloscope</option>
          </select>
        </div>

        <!-- Position & Scale -->
        <div class="p-3 bg-neutral-950 rounded-xl border border-neutral-800 space-y-3">
          <div class="font-medium text-neutral-200 flex items-center gap-1.5">
            <Move class="w-3.5 h-3.5 text-cyan-400" />
            Position & Size (Interactive)
          </div>

          <div>
            <div class="flex justify-between text-neutral-400 mb-1 text-[11px]">
              <span>Horizontal X</span>
              <span>{Math.round(projectStore.project.overlays.spectrum.x * 100)}%</span>
            </div>
            <input 
              type="range" 
              min="0.1" 
              max="0.9" 
              step="0.01" 
              bind:value={projectStore.project.overlays.spectrum.x}
              onchange={() => projectStore.saveToDB()}
              class="w-full accent-cyan-500 cursor-pointer"
            />
          </div>

          <div>
            <div class="flex justify-between text-neutral-400 mb-1 text-[11px]">
              <span>Vertical Y</span>
              <span>{Math.round(projectStore.project.overlays.spectrum.y * 100)}%</span>
            </div>
            <input 
              type="range" 
              min="0.1" 
              max="0.9" 
              step="0.01" 
              bind:value={projectStore.project.overlays.spectrum.y}
              onchange={() => projectStore.saveToDB()}
              class="w-full accent-cyan-500 cursor-pointer"
            />
          </div>

          <div>
            <div class="flex justify-between text-neutral-400 mb-1 text-[11px]">
              <span>Scale Size</span>
              <span>{projectStore.project.overlays.spectrum.scale.toFixed(2)}x</span>
            </div>
            <input 
              type="range" 
              min="0.3" 
              max="2.5" 
              step="0.05" 
              bind:value={projectStore.project.overlays.spectrum.scale}
              onchange={() => projectStore.saveToDB()}
              class="w-full accent-cyan-500 cursor-pointer"
            />
          </div>
        </div>

        <div>
          <div class="flex justify-between text-neutral-400 mb-1">
            <span>Bar Count</span>
            <span>{projectStore.project.overlays.spectrum.barCount}</span>
          </div>
          <input 
            type="range" 
            min="16" 
            max="128" 
            step="4"
            bind:value={projectStore.project.overlays.spectrum.barCount}
            onchange={() => projectStore.saveToDB()}
            class="w-full accent-cyan-500 cursor-pointer"
          />
        </div>

        <div>
          <div class="flex justify-between text-neutral-400 mb-1">
            <span>Height Scale</span>
            <span>{projectStore.project.overlays.spectrum.height}px</span>
          </div>
          <input 
            type="range" 
            min="40" 
            max="300" 
            bind:value={projectStore.project.overlays.spectrum.height}
            onchange={() => projectStore.saveToDB()}
            class="w-full accent-cyan-500 cursor-pointer"
          />
        </div>

        <div class="grid grid-cols-2 gap-2">
          <div>
            <span class="block text-neutral-400 mb-1">Primary Color</span>
            <div class="flex items-center gap-2 bg-neutral-950 p-1.5 rounded-lg border border-neutral-800">
              <input type="color" bind:value={projectStore.project.overlays.spectrum.color} onchange={() => projectStore.saveToDB()} class="w-6 h-6 bg-transparent border-0 cursor-pointer" />
              <span class="font-mono text-[11px]">{projectStore.project.overlays.spectrum.color}</span>
            </div>
          </div>
          <div>
            <span class="block text-neutral-400 mb-1">Secondary Color</span>
            <div class="flex items-center gap-2 bg-neutral-950 p-1.5 rounded-lg border border-neutral-800">
              <input type="color" bind:value={projectStore.project.overlays.spectrum.secondaryColor} onchange={() => projectStore.saveToDB()} class="w-6 h-6 bg-transparent border-0 cursor-pointer" />
              <span class="font-mono text-[11px]">{projectStore.project.overlays.spectrum.secondaryColor}</span>
            </div>
          </div>
        </div>

        <!-- Follow Beat -->
        <div class="p-3 bg-neutral-950/60 rounded-lg border border-neutral-800/80 space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-neutral-300 font-medium">Follow Beat</span>
            <input 
              type="checkbox" 
              bind:checked={projectStore.project.overlays.spectrum.followBeat}
              onchange={() => projectStore.saveToDB()}
              class="accent-cyan-500 w-4 h-4 cursor-pointer"
            />
          </div>

          {#if projectStore.project.overlays.spectrum.followBeat}
            <div>
              <div class="flex justify-between text-neutral-400 text-[11px] mb-1">
                <span>Spectrum Beat Sensitivity</span>
                <span>{(projectStore.project.overlays.spectrum.beatSensitivity ?? 1.2).toFixed(1)}x</span>
              </div>
              <input 
                type="range" 
                min="0.2" 
                max="3.0" 
                step="0.1" 
                bind:value={projectStore.project.overlays.spectrum.beatSensitivity}
                onchange={() => projectStore.saveToDB()}
                class="w-full accent-cyan-500 cursor-pointer"
              />
            </div>
          {/if}
        </div>
      </div>

    <!-- PARTICLES TAB -->
    {:else if projectStore.activeTab === 'particles'}
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <span class="font-medium text-neutral-300">Enable Particles</span>
          <input 
            type="checkbox" 
            bind:checked={projectStore.project.overlays.particle.enabled}
            onchange={() => projectStore.saveToDB()}
            class="accent-cyan-500 w-4 h-4 cursor-pointer"
          />
        </div>

        <div>
          <span class="block text-neutral-400 mb-1.5 font-medium">Preset</span>
          <select 
            bind:value={projectStore.project.overlays.particle.preset}
            onchange={() => projectStore.saveToDB()}
            class="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-2 text-neutral-200 focus:border-cyan-500 outline-none cursor-pointer"
          >
            <option value="floating-dust">Floating Dust</option>
            <option value="confetti">Confetti</option>
            <option value="bokeh">Bokeh Glow</option>
            <option value="snow">Snow</option>
            <option value="sparks">Beat Sparks</option>
          </select>
        </div>

        <div>
          <div class="flex justify-between text-neutral-400 mb-1">
            <span>Particle Count</span>
            <span>{projectStore.project.overlays.particle.count}</span>
          </div>
          <input 
            type="range" 
            min="10" 
            max="300" 
            bind:value={projectStore.project.overlays.particle.count}
            onchange={() => projectStore.saveToDB()}
            class="w-full accent-cyan-500 cursor-pointer"
          />
        </div>

        <div>
          <div class="flex justify-between text-neutral-400 mb-1">
            <span>Particle Size</span>
            <span>{projectStore.project.overlays.particle.size}px</span>
          </div>
          <input 
            type="range" 
            min="1" 
            max="30" 
            bind:value={projectStore.project.overlays.particle.size}
            onchange={() => projectStore.saveToDB()}
            class="w-full accent-cyan-500 cursor-pointer"
          />
        </div>

        <div>
          <div class="flex justify-between text-neutral-400 mb-1">
            <span>Particle Speed</span>
            <span>{(projectStore.project.overlays.particle.speed ?? 1.0).toFixed(1)}x</span>
          </div>
          <input 
            type="range" 
            min="0.2" 
            max="3.0" 
            step="0.1"
            bind:value={projectStore.project.overlays.particle.speed}
            onchange={() => projectStore.saveToDB()}
            class="w-full accent-cyan-500 cursor-pointer"
          />
        </div>

        <div class="grid grid-cols-2 gap-2">
          <div>
            <span class="block text-neutral-400 mb-1">Color Tint</span>
            <div class="flex items-center gap-1.5 bg-neutral-950 p-1.5 rounded-lg border border-neutral-800">
              <input 
                type="color" 
                bind:value={projectStore.project.overlays.particle.color} 
                onchange={() => projectStore.saveToDB()} 
                class="w-6 h-6 bg-transparent border-0 cursor-pointer" 
              />
              <span class="font-mono text-[11px]">{projectStore.project.overlays.particle.color}</span>
            </div>
          </div>
          <div>
            <span class="block text-neutral-400 mb-1">Opacity: {Math.round((projectStore.project.overlays.particle.opacity ?? 0.8) * 100)}%</span>
            <input 
              type="range" 
              min="0.1" 
              max="1.0" 
              step="0.05"
              bind:value={projectStore.project.overlays.particle.opacity}
              onchange={() => projectStore.saveToDB()}
              class="w-full accent-cyan-500 cursor-pointer mt-2"
            />
          </div>
        </div>

        <!-- Follow Beat -->
        <div class="p-3 bg-neutral-950/60 rounded-lg border border-neutral-800/80 space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-neutral-300 font-medium">Follow Beat</span>
            <input 
              type="checkbox" 
              bind:checked={projectStore.project.overlays.particle.followBeat}
              onchange={() => projectStore.saveToDB()}
              class="accent-cyan-500 w-4 h-4 cursor-pointer"
            />
          </div>

          {#if projectStore.project.overlays.particle.followBeat}
            <div>
              <div class="flex justify-between text-neutral-400 text-[11px] mb-1">
                <span>Particle Beat Sensitivity</span>
                <span>{(projectStore.project.overlays.particle.beatSensitivity ?? 1.0).toFixed(1)}x</span>
              </div>
              <input 
                type="range" 
                min="0.2" 
                max="3.0" 
                step="0.1" 
                bind:value={projectStore.project.overlays.particle.beatSensitivity}
                onchange={() => projectStore.saveToDB()}
                class="w-full accent-cyan-500 cursor-pointer"
              />
            </div>
          {/if}
        </div>
      </div>

    <!-- IMAGE & VIDEO OVERLAYS TAB -->
    {:else if projectStore.activeTab === 'images'}
      <div class="space-y-6">
        <!-- VIDEO OVERLAYS -->
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-neutral-300 font-semibold flex items-center gap-1.5">
              <Video class="w-3.5 h-3.5 text-cyan-400" />
              Video Overlays ({projectStore.project.overlays.videos?.length || 0})
            </span>
            <label class="px-2 py-1 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 text-[11px] font-medium flex items-center gap-1 cursor-pointer hover:bg-cyan-500/20 transition-colors">
              <Plus class="w-3 h-3" />
              Add Video
              <input 
                type="file" 
                accept="video/*" 
                multiple 
                class="hidden" 
                onchange={handleVideoOverlayUpload} 
              />
            </label>
          </div>

          <div class="space-y-3 max-h-72 overflow-y-auto">
            {#each projectStore.project.overlays.videos || [] as vid}
              <div class="p-3 bg-neutral-950 rounded-xl border border-neutral-800 space-y-2.5">
                <div class="flex items-center justify-between">
                  <span class="truncate font-medium text-cyan-300 text-xs">{vid.name}</span>
                  <button onclick={() => removeVideoOverlay(vid.id)} class="text-neutral-500 hover:text-rose-400 p-1 cursor-pointer">
                    <Trash2 class="w-3.5 h-3.5" />
                  </button>
                </div>

                <div>
                  <span class="text-neutral-500 block mb-1 text-[10px]">Blend Mode</span>
                  <select 
                    bind:value={vid.blendMode}
                    onchange={() => projectStore.saveToDB()}
                    class="w-full bg-neutral-900 border border-neutral-800 rounded p-1.5 text-neutral-200 text-[11px] outline-none"
                  >
                    <option value="source-over">Normal</option>
                    <option value="screen">Screen (Hide Black)</option>
                    <option value="lighten">Lighten</option>
                    <option value="multiply">Multiply (Hide White)</option>
                    <option value="overlay">Overlay</option>
                    <option value="color-dodge">Color Dodge</option>
                  </select>
                </div>

                <!-- Chroma Key -->
                <div class="p-2 rounded bg-neutral-900/60 border border-neutral-800 space-y-2">
                  <div class="flex items-center justify-between">
                    <span class="text-neutral-300 font-medium text-[11px]">Chroma Key (Green Screen)</span>
                    <input type="checkbox" bind:checked={vid.chromaKey.enabled} onchange={() => projectStore.saveToDB()} class="accent-emerald-500 w-3.5 h-3.5 cursor-pointer" />
                  </div>

                  {#if vid.chromaKey.enabled}
                    <div class="grid grid-cols-2 gap-2">
                      <div>
                        <span class="text-neutral-500 block mb-1 text-[10px]">Key Color</span>
                        <div class="flex items-center gap-1.5 bg-neutral-950 p-1 rounded border border-neutral-800">
                          <input type="color" bind:value={vid.chromaKey.color} onchange={() => projectStore.saveToDB()} class="w-5 h-5 bg-transparent border-0 cursor-pointer" />
                          <span class="font-mono text-[10px]">{vid.chromaKey.color}</span>
                        </div>
                      </div>
                      <div>
                        <span class="text-neutral-500 block mb-1 text-[10px]">Tolerance: {Math.round(vid.chromaKey.similarity * 100)}%</span>
                        <input type="range" min="0.05" max="0.8" step="0.02" bind:value={vid.chromaKey.similarity} onchange={() => projectStore.saveToDB()} class="w-full accent-emerald-500 cursor-pointer" />
                      </div>
                    </div>
                  {/if}
                </div>

                <div class="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <span class="text-neutral-500 block mb-1">X: {Math.round(vid.x * 100)}%</span>
                    <input type="range" min="0.05" max="0.95" step="0.01" bind:value={vid.x} onchange={() => projectStore.saveToDB()} class="w-full accent-cyan-500 cursor-pointer" />
                  </div>
                  <div>
                    <span class="text-neutral-500 block mb-1">Y: {Math.round(vid.y * 100)}%</span>
                    <input type="range" min="0.05" max="0.95" step="0.01" bind:value={vid.y} onchange={() => projectStore.saveToDB()} class="w-full accent-cyan-500 cursor-pointer" />
                  </div>
                </div>

                <!-- Scale & Animation Mode -->
                <div class="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <span class="text-neutral-500 block mb-1">Scale: {vid.scale.toFixed(2)}x</span>
                    <input type="range" min="0.1" max="2.0" step="0.05" bind:value={vid.scale} onchange={() => projectStore.saveToDB()} class="w-full accent-cyan-500 cursor-pointer" />
                  </div>
                  <div>
                    <span class="text-neutral-500 block mb-1">Animation</span>
                    <select 
                      bind:value={vid.animation}
                      onchange={() => projectStore.saveToDB()}
                      class="w-full bg-neutral-900 border border-neutral-800 rounded p-1.5 text-neutral-200 outline-none cursor-pointer"
                    >
                      <option value="none">Static (None)</option>
                      <option value="pulse-beat">Pulse on Beat</option>
                      <option value="floating">Gentle Floating</option>
                      <option value="shimmer">Shimmer Fade</option>
                      <option value="glow-pulse">Glow Pulse</option>
                    </select>
                  </div>
                </div>

                <div class="space-y-1 text-[11px]">
                  <span class="text-neutral-500 block">Opacity: {Math.round(vid.opacity * 100)}%</span>
                  <input type="range" min="0.1" max="1.0" step="0.05" bind:value={vid.opacity} onchange={() => projectStore.saveToDB()} class="w-full accent-cyan-500 cursor-pointer" />
                </div>
              </div>
            {/each}

            {#if !projectStore.project.overlays.videos || projectStore.project.overlays.videos.length === 0}
              <div class="p-3 text-center text-neutral-500 border border-dashed border-neutral-800 rounded-xl text-[11px]">
                No video overlays added. Add Chroma Key green screen / blend videos.
              </div>
            {/if}
          </div>
        </div>

        <!-- IMAGE OVERLAYS -->
        <div class="space-y-3 pt-3 border-t border-neutral-800">
          <div class="flex items-center justify-between">
            <span class="text-neutral-300 font-semibold flex items-center gap-1.5">
              <UploadCloud class="w-3.5 h-3.5 text-cyan-400" />
              Image Overlays ({projectStore.project.overlays.images.length})
            </span>
            <label class="px-2 py-1 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 text-[11px] font-medium flex items-center gap-1 cursor-pointer hover:bg-cyan-500/20 transition-colors">
              <Plus class="w-3 h-3" />
              Add Image
              <input 
                type="file" 
                accept="image/*" 
                multiple 
                class="hidden" 
                onchange={handleImageOverlayUpload} 
              />
            </label>
          </div>

          <div class="space-y-3 max-h-72 overflow-y-auto">
            {#each projectStore.project.overlays.images as img}
              <div class="p-3 bg-neutral-950 rounded-xl border border-neutral-800 space-y-3">
                <div class="flex items-center justify-between">
                  <span class="truncate font-medium text-neutral-200 text-xs">{img.name}</span>
                  <button 
                    onclick={() => removeImageOverlay(img.id)}
                    class="text-neutral-500 hover:text-rose-400 p-1 cursor-pointer"
                  >
                    <Trash2 class="w-3.5 h-3.5" />
                  </button>
                </div>

                <div class="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <span class="text-neutral-500 block mb-1">X: {Math.round(img.x * 100)}%</span>
                    <input type="range" min="0.05" max="0.95" step="0.01" bind:value={img.x} onchange={() => projectStore.saveToDB()} class="w-full accent-cyan-500 cursor-pointer" />
                  </div>
                  <div>
                    <span class="text-neutral-500 block mb-1">Y: {Math.round(img.y * 100)}%</span>
                    <input type="range" min="0.05" max="0.95" step="0.01" bind:value={img.y} onchange={() => projectStore.saveToDB()} class="w-full accent-cyan-500 cursor-pointer" />
                  </div>
                </div>

                <!-- Scale & Animation Mode -->
                <div class="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <span class="text-neutral-500 block mb-1">Scale: {img.scale.toFixed(2)}x</span>
                    <input type="range" min="0.1" max="2.0" step="0.05" bind:value={img.scale} onchange={() => projectStore.saveToDB()} class="w-full accent-cyan-500 cursor-pointer" />
                  </div>
                  <div>
                    <span class="text-neutral-500 block mb-1">Animation</span>
                    <select 
                      bind:value={img.animation}
                      onchange={() => projectStore.saveToDB()}
                      class="w-full bg-neutral-900 border border-neutral-800 rounded p-1.5 text-neutral-200 outline-none cursor-pointer"
                    >
                      <option value="none">Static (None)</option>
                      <option value="pulse-beat">Pulse on Beat</option>
                      <option value="floating">Gentle Floating</option>
                      <option value="shimmer">Shimmer Fade</option>
                      <option value="glow-pulse">Glow Pulse</option>
                    </select>
                  </div>
                </div>

                <div class="space-y-1 text-[11px]">
                  <span class="text-neutral-500 block">Opacity: {Math.round(img.opacity * 100)}%</span>
                  <input type="range" min="0.1" max="1.0" step="0.05" bind:value={img.opacity} onchange={() => projectStore.saveToDB()} class="w-full accent-cyan-500 cursor-pointer" />
                </div>

                <div class="flex items-center justify-between pt-1 border-t border-neutral-900">
                  <span class="text-[11px] text-neutral-400">Pulse on Beat (Audio reactive)</span>
                  <input type="checkbox" bind:checked={img.followBeat} onchange={() => projectStore.saveToDB()} class="accent-cyan-500 w-3.5 h-3.5 cursor-pointer" />
                </div>

                {#if img.followBeat}
                  <div class="space-y-1 text-[11px] pt-1">
                    <div class="flex justify-between text-neutral-400">
                      <span>Beat Power (Sensitivity)</span>
                      <span class="text-cyan-400 font-mono">{(img.beatSensitivity ?? 1.0).toFixed(1)}x</span>
                    </div>
                    <input 
                      type="range" 
                      min="0.2" 
                      max="3.0" 
                      step="0.1" 
                      bind:value={img.beatSensitivity} 
                      onchange={() => projectStore.saveToDB()} 
                      class="w-full accent-cyan-500 cursor-pointer" 
                    />
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      </div>

    <!-- TEXT OVERLAYS TAB -->
    {:else if projectStore.activeTab === 'texts'}
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <span class="text-neutral-300 font-semibold flex items-center gap-1.5">
            <Type class="w-3.5 h-3.5 text-cyan-400" />
            Text Overlays ({projectStore.project.overlays.texts?.length || 0})
          </span>
          <button 
            onclick={() => projectStore.addTextOverlay()}
            class="px-2.5 py-1 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-neutral-950 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
          >
            <Plus class="w-3.5 h-3.5" />
            Add Text
          </button>
        </div>

        <div class="space-y-3 max-h-[calc(100vh-220px)] overflow-y-auto">
          {#each projectStore.project.overlays.texts || [] as item}
            <div class="p-3 bg-neutral-950 rounded-xl border border-neutral-800 space-y-3">
              <div class="flex items-center justify-between gap-2">
                <input 
                  type="text" 
                  bind:value={item.text}
                  onchange={() => projectStore.saveToDB()}
                  placeholder="Enter text..."
                  class="flex-1 bg-neutral-900 border border-neutral-800 rounded px-2 py-1 text-xs text-neutral-200 focus:border-cyan-500 outline-none"
                />
                <button 
                  onclick={() => projectStore.removeTextOverlay(item.id)}
                  class="text-neutral-500 hover:text-rose-400 p-1 cursor-pointer"
                  title="Delete"
                >
                  <Trash2 class="w-3.5 h-3.5" />
                </button>
              </div>

              <!-- Font & Animation -->
              <div class="grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <span class="text-neutral-500 block mb-1">Font Family</span>
                  <select 
                    bind:value={item.fontFamily}
                    onchange={() => projectStore.saveToDB()}
                    class="w-full bg-neutral-900 border border-neutral-800 rounded p-1.5 text-neutral-200 outline-none cursor-pointer"
                  >
                    <option value="Inter">Inter</option>
                    <option value="Montserrat">Montserrat</option>
                    <option value="Bebas Neue">Bebas Neue</option>
                    <option value="Oswald">Oswald</option>
                    <option value="Poppins">Poppins</option>
                    <option value="Space Grotesk">Space Grotesk</option>
                    <option value="Playfair Display">Playfair Display</option>
                    <option value="Roboto Mono">Roboto Mono</option>
                  </select>
                </div>

                <div>
                  <span class="text-neutral-500 block mb-1">Animation</span>
                  <select 
                    bind:value={item.animation}
                    onchange={() => projectStore.saveToDB()}
                    class="w-full bg-neutral-900 border border-neutral-800 rounded p-1.5 text-neutral-200 outline-none cursor-pointer"
                  >
                    <option value="none">Static (None)</option>
                    <option value="pulse-beat">Pulse on Beat</option>
                    <option value="floating">Gentle Floating</option>
                    <option value="shimmer">Shimmer Fade</option>
                    <option value="typewriter">Typing Animation</option>
                    <option value="glow-pulse">Glow Pulse</option>
                  </select>
                </div>
              </div>

              <!-- Alignment & Font Size -->
              <div class="grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <span class="text-neutral-500 block mb-1">Alignment</span>
                  <select 
                    bind:value={item.alignment}
                    onchange={() => projectStore.saveToDB()}
                    class="w-full bg-neutral-900 border border-neutral-800 rounded p-1.5 text-neutral-200 outline-none cursor-pointer"
                  >
                    <option value="left">Left</option>
                    <option value="center">Center</option>
                    <option value="right">Right</option>
                  </select>
                </div>

                <div>
                  <span class="text-neutral-500 block mb-1">Size: {item.fontSize}px</span>
                  <input 
                    type="range" 
                    min="16" 
                    max="140" 
                    step="2" 
                    bind:value={item.fontSize} 
                    onchange={() => projectStore.saveToDB()} 
                    class="w-full accent-cyan-500 cursor-pointer mt-1" 
                  />
                </div>
              </div>

              <!-- Coordinates X and Y -->
              <div class="p-2 bg-neutral-900/60 rounded border border-neutral-800 space-y-2 text-[11px]">
                <div class="flex justify-between text-neutral-400">
                  <span>Horizontal X ({Math.round(item.x * 100)}%)</span>
                </div>
                <input 
                  type="range" 
                  min="0.05" 
                  max="0.95" 
                  step="0.01" 
                  bind:value={item.x} 
                  onchange={() => projectStore.saveToDB()} 
                  class="w-full accent-cyan-500 cursor-pointer" 
                />

                <div class="flex justify-between text-neutral-400">
                  <span>Vertical Y ({Math.round(item.y * 100)}%)</span>
                </div>
                <input 
                  type="range" 
                  min="0.05" 
                  max="0.95" 
                  step="0.01" 
                  bind:value={item.y} 
                  onchange={() => projectStore.saveToDB()} 
                  class="w-full accent-cyan-500 cursor-pointer" 
                />
              </div>

              <!-- Color, Opacity & Rotation -->
              <div class="grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <span class="text-neutral-500 block mb-1">Text Color</span>
                  <div class="flex items-center gap-1.5 bg-neutral-900 p-1 rounded border border-neutral-800">
                    <input type="color" bind:value={item.color} onchange={() => projectStore.saveToDB()} class="w-5 h-5 bg-transparent border-0 cursor-pointer" />
                    <span class="font-mono text-[10px]">{item.color}</span>
                  </div>
                </div>

                <div>
                  <span class="text-neutral-500 block mb-1">Opacity: {Math.round(item.opacity * 100)}%</span>
                  <input type="range" min="0.1" max="1.0" step="0.05" bind:value={item.opacity} onchange={() => projectStore.saveToDB()} class="w-full accent-cyan-500 cursor-pointer mt-1" />
                </div>
              </div>

              <!-- Shadow & Follow Beat -->
              <div class="space-y-1.5 pt-2 border-t border-neutral-900 text-[11px]">
                <div class="flex items-center justify-between">
                  <span class="text-neutral-400">Drop Shadow / Glow</span>
                  <input type="checkbox" bind:checked={item.shadow} onchange={() => projectStore.saveToDB()} class="accent-cyan-500 w-3.5 h-3.5 cursor-pointer" />
                </div>

                <div class="flex items-center justify-between">
                  <span class="text-neutral-400">Follow Audio Beat</span>
                  <input type="checkbox" bind:checked={item.followBeat} onchange={() => projectStore.saveToDB()} class="accent-cyan-500 w-3.5 h-3.5 cursor-pointer" />
                </div>

                {#if item.followBeat}
                  <div class="space-y-1 text-[11px] pt-1">
                    <div class="flex justify-between text-neutral-400">
                      <span>Beat Power (Sensitivity)</span>
                      <span class="text-cyan-400 font-mono">{(item.beatSensitivity ?? 1.0).toFixed(1)}x</span>
                    </div>
                    <input 
                      type="range" 
                      min="0.2" 
                      max="3.0" 
                      step="0.1" 
                      bind:value={item.beatSensitivity} 
                      onchange={() => projectStore.saveToDB()} 
                      class="w-full accent-cyan-500 cursor-pointer" 
                    />
                  </div>
                {/if}
              </div>
            </div>
          {/each}

          {#if !projectStore.project.overlays.texts || projectStore.project.overlays.texts.length === 0}
            <div class="p-6 text-center text-neutral-500 border border-dashed border-neutral-800 rounded-xl text-xs space-y-2">
              <Type class="w-6 h-6 mx-auto opacity-50" />
              <p>Belum ada Text Overlay.</p>
              <p class="text-[11px]">Klik "Add Text" di atas untuk menambahkan judul, watermark, atau catatan custom.</p>
            </div>
          {/if}
        </div>
      </div>

    <!-- LYRICS TAB -->
    {:else if projectStore.activeTab === 'lyrics'}
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <span class="font-medium text-neutral-300">Enable Lyrics</span>
          <input 
            type="checkbox" 
            bind:checked={projectStore.project.lyrics.config.enabled}
            onchange={() => projectStore.saveToDB()}
            class="accent-cyan-500 w-4 h-4 cursor-pointer"
          />
        </div>

        <!-- STT Auto Lyrics & Subtitle Management -->
        <div class="p-3 bg-gradient-to-r from-cyan-950/40 to-indigo-950/40 rounded-xl border border-cyan-800/30 space-y-2.5">
          <div class="flex items-center justify-between">
            <div class="font-medium text-cyan-200 flex items-center gap-1.5">
              <Sparkles class="w-3.5 h-3.5 text-cyan-400" />
              Groq Whisper STT & Subtitle
            </div>
            <span class="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-mono">
              {projectStore.project.lyrics.segments.length} Lines
            </span>
          </div>
          <p class="text-[11px] text-neutral-400">Transkripsi otomatis, edit kata, atau impor subtitle .SRT / .VTT eksternal.</p>
          
          <div class="grid grid-cols-2 gap-2">
            <button 
              type="button"
              onclick={() => sidebarSubtitleInput?.click()}
              class="py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-medium rounded-lg flex items-center justify-center gap-1.5 border border-neutral-700 shadow-sm transition-all cursor-pointer"
              title="Import file subtitle .srt atau .vtt"
            >
              <FolderOpen class="w-3.5 h-3.5 text-cyan-400" />
              Import .SRT
            </button>
            <input 
              bind:this={sidebarSubtitleInput}
              type="file" 
              accept=".srt,.vtt,text/plain"
              class="hidden"
              onchange={handleSidebarImportSubtitle}
            />

            <button 
              onclick={() => onOpenLyrics?.()}
              class="py-2 bg-cyan-500 hover:bg-cyan-400 text-neutral-950 font-semibold rounded-lg flex items-center justify-center gap-1.5 shadow-md shadow-cyan-500/20 transition-all cursor-pointer"
            >
              <Type class="w-3.5 h-3.5" />
              Transcribe / Edit
            </button>
          </div>
        </div>

        <div>
          <span class="block text-neutral-400 mb-1.5 font-medium">Typography / Font Family</span>
          <select 
            bind:value={projectStore.project.lyrics.config.fontFamily}
            onchange={() => projectStore.saveToDB()}
            class="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-2 text-neutral-200 focus:border-cyan-500 outline-none cursor-pointer"
          >
            <option value="Inter">Inter (Clean Sans)</option>
            <option value="Montserrat">Montserrat (Modern Bold)</option>
            <option value="Bebas Neue">Bebas Neue (Tall Impact)</option>
            <option value="Oswald">Oswald (Condensed)</option>
            <option value="Poppins">Poppins (Rounded)</option>
            <option value="Space Grotesk">Space Grotesk (Tech)</option>
            <option value="Playfair Display">Playfair Display (Serif)</option>
            <option value="Roboto Mono">Roboto Mono (Monospace)</option>
          </select>
        </div>

        <div>
          <span class="block text-neutral-400 mb-1.5 font-medium">Style</span>
          <select 
            bind:value={projectStore.project.lyrics.config.style}
            onchange={() => projectStore.saveToDB()}
            class="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-2 text-neutral-200 focus:border-cyan-500 outline-none cursor-pointer"
          >
            <option value="karaoke">Karaoke Highlight</option>
            <option value="fade-line">Fade In/Out per Line</option>
            <option value="typewriter">Typewriter Effect</option>
            <option value="bounce-word">Bounce on Beat</option>
            <option value="bottom-bar">Classic Bottom Bar</option>
          </select>
        </div>

        <!-- Position & Scale -->
        <div class="p-3 bg-neutral-950 rounded-xl border border-neutral-800 space-y-3">
          <div class="font-medium text-neutral-200 flex items-center gap-1.5">
            <Move class="w-3.5 h-3.5 text-cyan-400" />
            Position & Font Size (Interactive)
          </div>

          <div>
            <div class="flex justify-between text-neutral-400 mb-1 text-[11px]">
              <span>Horizontal X</span>
              <span>{Math.round(projectStore.project.lyrics.config.x * 100)}%</span>
            </div>
            <input 
              type="range" 
              min="0.1" 
              max="0.9" 
              step="0.01" 
              bind:value={projectStore.project.lyrics.config.x}
              onchange={() => projectStore.saveToDB()}
              class="w-full accent-cyan-500 cursor-pointer"
            />
          </div>

          <div>
            <div class="flex justify-between text-neutral-400 mb-1 text-[11px]">
              <span>Vertical Y</span>
              <span>{Math.round(projectStore.project.lyrics.config.y * 100)}%</span>
            </div>
            <input 
              type="range" 
              min="0.1" 
              max="0.95" 
              step="0.01" 
              bind:value={projectStore.project.lyrics.config.y}
              onchange={() => projectStore.saveToDB()}
              class="w-full accent-cyan-500 cursor-pointer"
            />
          </div>

          <div>
            <div class="flex justify-between text-neutral-400 mb-1 text-[11px]">
              <span>Font Size</span>
              <span>{projectStore.project.lyrics.config.fontSize}px</span>
            </div>
            <input 
              type="range" 
              min="18" 
              max="96" 
              bind:value={projectStore.project.lyrics.config.fontSize}
              onchange={() => projectStore.saveToDB()}
              class="w-full accent-cyan-500 cursor-pointer"
            />
          </div>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <div>
            <span class="block text-neutral-400 mb-1">Base Color</span>
            <div class="flex items-center gap-2 bg-neutral-950 p-1.5 rounded-lg border border-neutral-800">
              <input type="color" bind:value={projectStore.project.lyrics.config.color} onchange={() => projectStore.saveToDB()} class="w-6 h-6 bg-transparent border-0 cursor-pointer" />
              <span class="font-mono text-[11px]">{projectStore.project.lyrics.config.color}</span>
            </div>
          </div>
          <div>
            <span class="block text-neutral-400 mb-1">Highlight Color</span>
            <div class="flex items-center gap-2 bg-neutral-950 p-1.5 rounded-lg border border-neutral-800">
              <input type="color" bind:value={projectStore.project.lyrics.config.highlightColor} onchange={() => projectStore.saveToDB()} class="w-6 h-6 bg-transparent border-0 cursor-pointer" />
              <span class="font-mono text-[11px]">{projectStore.project.lyrics.config.highlightColor}</span>
            </div>
          </div>
        </div>

        <!-- Follow Beat -->
        <div class="p-3 bg-neutral-950/60 rounded-lg border border-neutral-800/80 space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-neutral-300 font-medium">Follow Beat (Bounce)</span>
            <input 
              type="checkbox" 
              bind:checked={projectStore.project.lyrics.config.followBeat}
              onchange={() => projectStore.saveToDB()}
              class="accent-cyan-500 w-4 h-4 cursor-pointer"
            />
          </div>

          {#if projectStore.project.lyrics.config.followBeat}
            <div>
              <div class="flex justify-between text-neutral-400 text-[11px] mb-1">
                <span>Bounce Sensitivity</span>
                <span>{(projectStore.project.lyrics.config.beatSensitivity ?? 1.0).toFixed(1)}x</span>
              </div>
              <input 
                type="range" 
                min="0.2" 
                max="3.0" 
                step="0.1" 
                bind:value={projectStore.project.lyrics.config.beatSensitivity}
                onchange={() => projectStore.saveToDB()}
                class="w-full accent-cyan-500 cursor-pointer"
              />
            </div>
          {/if}
        </div>
      </div>

    <!-- TRACKLIST OVERLAY & NOW PLAYING TAB -->
    {:else if projectStore.activeTab === 'tracklist-overlay'}
      {@const tl = projectStore.project.overlays.tracklist}
      {#if tl}
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <div>
              <span class="font-medium text-neutral-200 block">Enable Tracklist Overlay</span>
              <span class="text-[11px] text-neutral-500">Tampilkan semua judul lagu di video</span>
            </div>
            <input 
              type="checkbox" 
              bind:checked={tl.enabled}
              onchange={() => projectStore.saveToDB()}
              class="accent-cyan-500 w-4 h-4 cursor-pointer"
            />
          </div>

          <!-- Active Songs Count Info -->
          <div class="p-2.5 bg-neutral-950 rounded-lg border border-neutral-800 flex items-center justify-between text-[11px]">
            <span class="text-neutral-400">Total Lagu di Playlist:</span>
            <span class="font-semibold text-cyan-400">{projectStore.project.audio.tracks?.length || 0} Tracks</span>
          </div>

          <!-- Header Title Settings -->
          <div class="p-3 bg-neutral-950 rounded-xl border border-neutral-800 space-y-2.5">
            <div class="flex items-center justify-between">
              <span class="font-medium text-neutral-200">Tracklist Header Title</span>
              <input 
                type="checkbox" 
                bind:checked={tl.showTitle}
                onchange={() => projectStore.saveToDB()}
                class="accent-cyan-500 w-3.5 h-3.5 cursor-pointer"
              />
            </div>

            {#if tl.showTitle}
              <input 
                type="text" 
                bind:value={tl.title}
                onchange={() => projectStore.saveToDB()}
                placeholder="TRACKLIST / PLAYLIST"
                class="w-full bg-neutral-900 border border-neutral-800 rounded px-2.5 py-1.5 text-neutral-200 outline-none focus:border-cyan-500"
              />

              <div>
                <div class="flex justify-between text-neutral-400 mb-1 text-[11px]">
                  <span>Header Font Size</span>
                  <span>{tl.titleFontSize || 36}px</span>
                </div>
                <input 
                  type="range" 
                  min="20" 
                  max="72" 
                  bind:value={tl.titleFontSize} 
                  onchange={() => projectStore.saveToDB()} 
                  class="w-full accent-cyan-500 cursor-pointer" 
                />
              </div>
            {/if}
          </div>

          <!-- Now Playing Animation Selector -->
          <div class="p-3 bg-gradient-to-r from-cyan-950/30 to-indigo-950/30 rounded-xl border border-cyan-800/30 space-y-2.5">
            <div class="flex items-center gap-1.5 font-semibold text-cyan-300">
              <Sparkles class="w-3.5 h-3.5 text-cyan-400" />
              Now Playing Animation
            </div>
            <p class="text-[11px] text-neutral-400">Animasi eksklusif hanya pada judul lagu yang sedang aktif diputar.</p>
            
            <select 
              bind:value={tl.nowPlayingAnimation}
              onchange={() => projectStore.saveToDB()}
              class="w-full bg-neutral-900 border border-neutral-800 rounded-lg p-2 text-neutral-200 focus:border-cyan-500 outline-none cursor-pointer text-xs"
            >
              <option value="glow-badge">✨ Glow & Pulsing Badge Dot</option>
              <option value="equalizer-indicator">📊 Animated Mini Equalizer Bars</option>
              <option value="bounce-pulse">💥 Bounce / Scale on Beat</option>
              <option value="sliding-accent">➡️ Dynamic Subtle Slide</option>
              <option value="karaoke-gradient">🎵 Highlight Glow Only</option>
            </select>
          </div>

          <!-- Typography & Styling -->
          <div>
            <span class="block text-neutral-400 mb-1.5 font-medium">Font Family</span>
            <select 
              bind:value={tl.fontFamily}
              onchange={() => projectStore.saveToDB()}
              class="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-2 text-neutral-200 focus:border-cyan-500 outline-none cursor-pointer"
            >
              <option value="Inter">Inter (Modern Clean)</option>
              <option value="Montserrat">Montserrat (Bold Modern)</option>
              <option value="Bebas Neue">Bebas Neue (Tall Impact)</option>
              <option value="Oswald">Oswald (Condensed)</option>
              <option value="Poppins">Poppins (Rounded)</option>
              <option value="Space Grotesk">Space Grotesk (Futuristic)</option>
              <option value="Playfair Display">Playfair Display (Serif)</option>
              <option value="Roboto Mono">Roboto Mono (Monospace)</option>
            </select>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <div>
              <span class="block text-neutral-400 mb-1">Alignment</span>
              <select 
                bind:value={tl.alignment}
                onchange={() => projectStore.saveToDB()}
                class="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-2 text-neutral-200 focus:border-cyan-500 outline-none cursor-pointer"
              >
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </div>
            <div>
              <span class="block text-neutral-400 mb-1">Track Font Size ({tl.fontSize}px)</span>
              <input 
                type="range" 
                min="16" 
                max="64" 
                bind:value={tl.fontSize} 
                onchange={() => projectStore.saveToDB()} 
                class="w-full accent-cyan-500 cursor-pointer mt-2" 
              />
            </div>
          </div>

          <!-- Position Coordinates & Line Spacing -->
          <div class="p-3 bg-neutral-950 rounded-xl border border-neutral-800 space-y-3">
            <div class="font-medium text-neutral-200 flex items-center gap-1.5">
              <Move class="w-3.5 h-3.5 text-cyan-400" />
              Position & Spacing (Interactive)
            </div>

            <div>
              <div class="flex justify-between text-neutral-400 mb-1 text-[11px]">
                <span>Horizontal X</span>
                <span>{Math.round(tl.x * 100)}%</span>
              </div>
              <input 
                type="range" 
                min="0.02" 
                max="0.8" 
                step="0.01" 
                bind:value={tl.x}
                onchange={() => projectStore.saveToDB()}
                class="w-full accent-cyan-500 cursor-pointer"
              />
            </div>

            <div>
              <div class="flex justify-between text-neutral-400 mb-1 text-[11px]">
                <span>Vertical Y</span>
                <span>{Math.round(tl.y * 100)}%</span>
              </div>
              <input 
                type="range" 
                min="0.05" 
                max="0.8" 
                step="0.01" 
                bind:value={tl.y}
                onchange={() => projectStore.saveToDB()}
                class="w-full accent-cyan-500 cursor-pointer"
              />
            </div>

            <div>
              <div class="flex justify-between text-neutral-400 mb-1 text-[11px]">
                <span>Line Spacing / Gap</span>
                <span>{tl.lineSpacing}px</span>
              </div>
              <input 
                type="range" 
                min="24" 
                max="90" 
                step="2" 
                bind:value={tl.lineSpacing}
                onchange={() => projectStore.saveToDB()}
                class="w-full accent-cyan-500 cursor-pointer"
              />
            </div>
          </div>

          <!-- Color Settings (Inactive, Active, Header Accent) -->
          <div class="grid grid-cols-3 gap-2">
            <div>
              <span class="block text-neutral-400 mb-1 text-[10px]">Track Color</span>
              <div class="flex items-center gap-1 bg-neutral-950 p-1 rounded border border-neutral-800">
                <input type="color" bind:value={tl.color} onchange={() => projectStore.saveToDB()} class="w-5 h-5 bg-transparent border-0 cursor-pointer" />
                <span class="font-mono text-[9px] truncate">{tl.color}</span>
              </div>
            </div>
            <div>
              <span class="block text-cyan-400 mb-1 text-[10px]">Active Now Playing</span>
              <div class="flex items-center gap-1 bg-neutral-950 p-1 rounded border border-cyan-800/40">
                <input type="color" bind:value={tl.activeColor} onchange={() => projectStore.saveToDB()} class="w-5 h-5 bg-transparent border-0 cursor-pointer" />
                <span class="font-mono text-[9px] truncate">{tl.activeColor}</span>
              </div>
            </div>
            <div>
              <span class="block text-neutral-400 mb-1 text-[10px]">Header Accent</span>
              <div class="flex items-center gap-1 bg-neutral-950 p-1 rounded border border-neutral-800">
                <input type="color" bind:value={tl.accentColor} onchange={() => projectStore.saveToDB()} class="w-5 h-5 bg-transparent border-0 cursor-pointer" />
                <span class="font-mono text-[9px] truncate">{tl.accentColor}</span>
              </div>
            </div>
          </div>

          <!-- Format Options (Numbers, Durations, Beat Reaction) -->
          <div class="p-3 bg-neutral-950 rounded-xl border border-neutral-800 space-y-2 text-[11px]">
            <div class="flex items-center justify-between">
              <span class="text-neutral-300">Show Track Numbers (01, 02...)</span>
              <input type="checkbox" bind:checked={tl.showNumbers} onchange={() => projectStore.saveToDB()} class="accent-cyan-500 w-3.5 h-3.5 cursor-pointer" />
            </div>

            <div class="flex items-center justify-between">
              <span class="text-neutral-300">Show Track Duration (03:45)</span>
              <input type="checkbox" bind:checked={tl.showDuration} onchange={() => projectStore.saveToDB()} class="accent-cyan-500 w-3.5 h-3.5 cursor-pointer" />
            </div>

            <div class="flex items-center justify-between">
              <span class="text-neutral-300">Drop Shadow / Glow</span>
              <input type="checkbox" bind:checked={tl.shadow} onchange={() => projectStore.saveToDB()} class="accent-cyan-500 w-3.5 h-3.5 cursor-pointer" />
            </div>

            <div class="flex items-center justify-between">
              <span class="text-neutral-300">Follow Audio Beat</span>
              <input type="checkbox" bind:checked={tl.followBeat} onchange={() => projectStore.saveToDB()} class="accent-cyan-500 w-3.5 h-3.5 cursor-pointer" />
            </div>
          </div>
        </div>
      {/if}

    <!-- EXPORT TAB -->
    {:else if projectStore.activeTab === 'export'}
      <div class="space-y-4">
        <div>
          <span class="block text-neutral-400 mb-1.5 font-medium">Resolution & Aspect</span>
          <select 
            value={projectStore.project.exportSettings.resolution}
            onchange={(e) => projectStore.updateExportResolution(e.currentTarget.value as any)}
            class="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-2 text-neutral-200 focus:border-cyan-500 outline-none cursor-pointer"
          >
            <option value="1280x720">16:9 HD (720p - 1280x720) 🚀 Super Cepat</option>
            <option value="1920x1080">16:9 Landscape (1080p - 1920x1080) Full HD</option>
            <option value="720x1280">9:16 Portrait (720p - 720x1280) TikTok Cepat</option>
            <option value="1080x1920">9:16 Portrait (1080p - 1080x1920) Reels/Shorts</option>
            <option value="1080x1080">1:1 Square (1080x1080) Instagram</option>
          </select>
        </div>

        <div>
          <span class="block text-neutral-400 mb-1.5 font-medium">Frame Rate</span>
          <div class="grid grid-cols-2 gap-2">
            <button 
              class={`py-2 rounded-lg border font-semibold cursor-pointer ${projectStore.project.exportSettings.fps === 30 ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400' : 'border-neutral-800 bg-neutral-950 text-neutral-400'}`}
              onclick={() => { projectStore.project.exportSettings.fps = 30; projectStore.saveToDB(); }}
            >
              30 FPS
            </button>
            <button 
              class={`py-2 rounded-lg border font-semibold cursor-pointer ${projectStore.project.exportSettings.fps === 60 ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400' : 'border-neutral-800 bg-neutral-950 text-neutral-400'}`}
              onclick={() => { projectStore.project.exportSettings.fps = 60; projectStore.saveToDB(); }}
            >
              60 FPS
            </button>
          </div>
        </div>

        <div class="p-3 bg-neutral-950/60 rounded-lg border border-neutral-800 text-[11px] text-neutral-400 space-y-1">
          <div class="text-neutral-300 font-medium">WebCodecs + Mediabunny Pipeline</div>
          <div>Rendering chunked off-thread di Web Worker dengan GPU Hardware acceleration & zero memory leak.</div>
        </div>
      </div>
    {/if}
  </div>
</aside>
