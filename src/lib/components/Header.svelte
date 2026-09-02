<script lang="ts">
  import { onMount } from 'svelte';
  import { projectStore } from '../stores/project.svelte';
  import { 
    Sparkles, 
    Music2, 
    Download, 
    Layers, 
    FileText, 
    Save, 
    FolderOpen, 
    Check, 
    UploadCloud 
  } from '@lucide/svelte';

  interface Props {
    onExport?: () => void;
  }

  let { onExport }: Props = $props();
  let jsonFileInput: HTMLInputElement;

  async function handleImportJSON(e: Event) {
    const target = e.target as HTMLInputElement;
    if (target.files && target.files[0]) {
      try {
        await projectStore.importProjectJSON(target.files[0]);
      } catch (err: any) {
        alert('Failed to import JSON: ' + err.message);
      }
    }
  }

  onMount(() => {
    projectStore.loadFromDB();
  });
</script>

<header class="h-14 border-b border-neutral-800 bg-neutral-900/80 backdrop-blur-md px-4 flex items-center justify-between shrink-0 z-30">
  <div class="flex items-center gap-3">
    <div class="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-500 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-cyan-500/20">
      <Sparkles class="w-4 h-4 text-white" />
    </div>
    <div class="flex flex-col">
      <div class="flex items-center gap-2">
        <input 
          type="text" 
          bind:value={projectStore.project.title}
          onchange={() => projectStore.saveToDB()}
          class="bg-transparent text-sm font-semibold text-neutral-100 hover:bg-neutral-800/60 focus:bg-neutral-800 px-1.5 py-0.5 rounded outline-none transition-colors border border-transparent focus:border-neutral-700"
        />
        <span class="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-mono">
          {projectStore.project.exportSettings.resolution}
        </span>
      </div>
      <div class="flex items-center gap-2 text-[10px] text-neutral-400 px-1.5">
        <span>{projectStore.project.audio.fileName || 'No audio loaded'}</span>
        <span class="text-neutral-600">•</span>
        {#if projectStore.isAutosaving}
          <span class="text-cyan-400 flex items-center gap-1 animate-pulse">Saving...</span>
        {:else}
          <span class="text-neutral-500 flex items-center gap-1">
            <Check class="w-2.5 h-2.5 text-emerald-500" />
            Auto-saved
          </span>
        {/if}
      </div>
    </div>
  </div>

  <!-- Navigation / Mode Tabs -->
  <div class="flex items-center bg-neutral-950/80 p-1 rounded-xl border border-neutral-800/80 shadow-inner">
    <button 
      class={`px-3 py-1 text-xs font-medium rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${projectStore.activeTab === 'background' ? 'bg-neutral-800 text-cyan-400 shadow-sm' : 'text-neutral-400 hover:text-neutral-200'}`}
      onclick={() => projectStore.activeTab = 'background'}
    >
      <Layers class="w-3.5 h-3.5" />
      Background
    </button>
    <button 
      class={`px-3 py-1 text-xs font-medium rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${projectStore.activeTab === 'spectrum' ? 'bg-neutral-800 text-cyan-400 shadow-sm' : 'text-neutral-400 hover:text-neutral-200'}`}
      onclick={() => projectStore.activeTab = 'spectrum'}
    >
      <Music2 class="w-3.5 h-3.5" />
      Spectrum
    </button>
    <button 
      class={`px-3 py-1 text-xs font-medium rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${projectStore.activeTab === 'particles' ? 'bg-neutral-800 text-cyan-400 shadow-sm' : 'text-neutral-400 hover:text-neutral-200'}`}
      onclick={() => projectStore.activeTab = 'particles'}
    >
      <Sparkles class="w-3.5 h-3.5" />
      Particles
    </button>
    <button 
      class={`px-3 py-1 text-xs font-medium rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${projectStore.activeTab === 'images' ? 'bg-neutral-800 text-cyan-400 shadow-sm' : 'text-neutral-400 hover:text-neutral-200'}`}
      onclick={() => projectStore.activeTab = 'images'}
    >
      <UploadCloud class="w-3.5 h-3.5" />
      Media Overlays
    </button>
    <button 
      class={`px-3 py-1 text-xs font-medium rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${projectStore.activeTab === 'texts' ? 'bg-neutral-800 text-cyan-400 shadow-sm' : 'text-neutral-400 hover:text-neutral-200'}`}
      onclick={() => projectStore.activeTab = 'texts'}
    >
      <FileText class="w-3.5 h-3.5" />
      Text Overlays
    </button>
    <button 
      class={`px-3 py-1 text-xs font-medium rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${projectStore.activeTab === 'lyrics' ? 'bg-neutral-800 text-cyan-400 shadow-sm' : 'text-neutral-400 hover:text-neutral-200'}`}
      onclick={() => projectStore.activeTab = 'lyrics'}
    >
      <FileText class="w-3.5 h-3.5" />
      Lyrics
    </button>

    <button 
      class={`px-3 py-1 text-xs font-medium rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${projectStore.activeTab === 'tracklist-overlay' ? 'bg-neutral-800 text-cyan-400 shadow-sm' : 'text-neutral-400 hover:text-neutral-200'}`}
      onclick={() => projectStore.activeTab = 'tracklist-overlay'}
    >
      <FileText class="w-3.5 h-3.5" />
      Tracklist Overlay
    </button>
    <button 
      class={`px-3 py-1 text-xs font-medium rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${projectStore.activeTab === 'tracklist-png' ? 'bg-neutral-800 text-cyan-400 shadow-sm' : 'text-neutral-400 hover:text-neutral-200'}`}
      onclick={() => projectStore.activeTab = 'tracklist-png'}
    >
      <Download class="w-3.5 h-3.5" />
      Tracklist PNG
    </button>

  </div>

  <!-- Project File Actions (Export/Import JSON) & Render Video -->
  <div class="flex items-center gap-2">
    <!-- Import JSON -->
    <button 
      onclick={() => jsonFileInput.click()}
      class="px-2.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-medium flex items-center gap-1.5 transition-colors border border-neutral-700 cursor-pointer"
      title="Import Project JSON"
    >
      <FolderOpen class="w-3.5 h-3.5" />
      Open JSON
    </button>
    <input 
      bind:this={jsonFileInput} 
      type="file" 
      accept=".json,application/json" 
      class="hidden" 
      onchange={handleImportJSON} 
    />

    <!-- Export JSON -->
    <button 
      onclick={() => projectStore.exportProjectJSON()}
      class="px-2.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-medium flex items-center gap-1.5 transition-colors border border-neutral-700 cursor-pointer"
      title="Save / Backup Project JSON"
    >
      <Save class="w-3.5 h-3.5" />
      Save JSON
    </button>

    <button 
      onclick={() => onExport?.()}
      class="px-3.5 py-1.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-md shadow-cyan-500/20 transition-all active:scale-95 cursor-pointer ml-1"
    >
      <Download class="w-3.5 h-3.5" />
      Export Video
    </button>
  </div>
</header>

