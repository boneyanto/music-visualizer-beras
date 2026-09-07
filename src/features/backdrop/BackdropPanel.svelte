<script lang="ts">
  import { projectStore } from '../../lib/stores/project.svelte';
  import { db } from '../../lib/db/database';
  import { backgroundManager } from './background.svelte';
  import type { BackgroundItem } from '../../lib/types/project';
  import { Plus, Trash2, Activity } from '@lucide/svelte';

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
</script>

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
