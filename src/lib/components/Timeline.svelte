<script lang="ts">
  import { projectStore } from '../stores/project.svelte';
  import { audioEngine } from '../audio/player';
  import { 
    Upload, 
    Music, 
    Activity, 
    Loader2, 
    Plus, 
    Trash2, 
    ListMusic 
  } from '@lucide/svelte';

  interface Props {
    onOpenPlaylist?: () => void;
  }

  let { onOpenPlaylist }: Props = $props();

  let fileInput: HTMLInputElement;
  let isConfirmingDelete = $state(false);
  let deleteTimer: any = null;

  function handleDeleteAllTracks() {
    if (!isConfirmingDelete) {
      isConfirmingDelete = true;
      if (deleteTimer) clearTimeout(deleteTimer);
      deleteTimer = setTimeout(() => {
        isConfirmingDelete = false;
      }, 3500);
    } else {
      isConfirmingDelete = false;
      if (deleteTimer) clearTimeout(deleteTimer);
      projectStore.clearAllAudioTracks();
    }
  }

  async function handleAudioUpload(e: Event) {
    const target = e.target as HTMLInputElement;
    if (!target.files || target.files.length === 0) return;

    for (let i = 0; i < target.files.length; i++) {
      await projectStore.addAudioTrack(target.files[i]);
    }
  }

  function handleTimelineClick(e: MouseEvent) {
    if (!projectStore.audioBuffer) return;
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const progress = Math.max(0, Math.min(1, clickX / rect.width));
    const targetTime = progress * projectStore.project.audio.duration;
    
    audioEngine.seek(targetTime, projectStore.audioBuffer);
  }
</script>

<div class="h-44 border-t border-neutral-800 bg-neutral-900/95 flex flex-col shrink-0 select-none z-20">
  <!-- Timeline Header / Controls -->
  <div class="h-9 border-b border-neutral-800/80 px-4 flex items-center justify-between text-xs text-neutral-400">
    <div class="flex items-center gap-3">
      <span class="font-semibold text-neutral-200 flex items-center gap-1.5">
        <Music class="w-3.5 h-3.5 text-cyan-400" />
        Multi-Track Audio ({projectStore.project.audio.tracks?.length || 0})
      </span>

      <button 
        onclick={() => fileInput.click()}
        class="px-2.5 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-[11px] font-medium flex items-center gap-1.5 transition-colors border border-neutral-700 cursor-pointer"
      >
        <Plus class="w-3 h-3 text-cyan-400" />
        Add MP3 / WAV Files
      </button>
      <input 
        bind:this={fileInput} 
        type="file" 
        accept="audio/*" 
        multiple
        class="hidden" 
        onchange={handleAudioUpload} 
      />

      <button 
        onclick={() => onOpenPlaylist?.()}
        class="px-2.5 py-1 rounded text-[11px] font-medium flex items-center gap-1.5 transition-colors border cursor-pointer bg-neutral-800 hover:bg-neutral-700 text-cyan-300 border-neutral-700"
      >
        <ListMusic class="w-3 h-3 text-cyan-400" />
        Atur Urutan Lagu & Playlist ({projectStore.project.audio.tracks?.length || 0})
      </button>
    </div>

    <!-- Audio Track Summary & Counter -->
    <div class="flex items-center gap-3">
      {#if projectStore.project.audio.tracks && projectStore.project.audio.tracks.length > 0}
        <span class="text-[11px] text-cyan-400 font-mono">
          Total: {Math.floor(projectStore.project.audio.duration / 60)}:{(Math.floor(projectStore.project.audio.duration % 60)).toString().padStart(2, '0')}
        </span>
        <button 
          onclick={handleDeleteAllTracks}
          class={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded transition-all cursor-pointer ${
            isConfirmingDelete 
              ? 'bg-rose-600 text-white animate-pulse' 
              : 'text-neutral-500 hover:text-rose-400'
          }`}
          title="Hapus Semua Lagu"
        >
          <Trash2 class="w-3.5 h-3.5" />
          {#if isConfirmingDelete}
            <span>Yakin Hapus?</span>
          {/if}
        </button>
      {/if}
    </div>
  </div>

  <!-- Tracks & Waveform Area -->
  <div class="flex-1 p-3 flex flex-col gap-2 overflow-y-auto relative">


    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div 
      class="h-16 w-full bg-neutral-950/80 rounded-lg border border-neutral-800 relative cursor-pointer overflow-hidden group"
      onclick={handleTimelineClick}
    >
      {#if projectStore.isProcessingAudio}
        <div class="absolute inset-0 flex items-center justify-center gap-2 bg-neutral-950/90 text-cyan-400 text-xs">
          <Loader2 class="w-4 h-4 animate-spin" />
          <span>Combining Audio & Analyzing Spectral Flux... {Math.round(projectStore.analysisProgress * 100)}%</span>
        </div>
      {:else if projectStore.beats.length > 0}
        <!-- Real Beat Markers on Timeline -->
        <div class="absolute inset-0 pointer-events-none">
          {#each projectStore.beats as beat}
            <div 
              class="absolute top-0 bottom-0 w-[1px] bg-fuchsia-500/40"
              style={`left: ${(beat / projectStore.project.audio.duration) * 100}%;`}
            ></div>
          {/each}
        </div>

        <!-- Waveform ticks -->
        <div class="absolute inset-0 flex items-center justify-around px-2 opacity-50 group-hover:opacity-75 transition-opacity pointer-events-none">
          {#each Array(100) as _, i}
            {@const frameIdx = Math.floor((i / 100) * projectStore.frequencyFrames.length)}
            {@const freqVal = projectStore.frequencyFrames[frameIdx] ? projectStore.frequencyFrames[frameIdx][0] : 10}
            <div 
              class="w-1 bg-cyan-400 rounded-full transition-all" 
              style={`height: ${Math.max(4, (freqVal / 255) * 44)}px;`}
            ></div>
          {/each}
        </div>
      {:else}
        <div class="absolute inset-0 flex items-center justify-center text-neutral-500 text-xs">
          Drop multiple audio files or click "Add MP3 / WAV Files" to auto-concatenate & compute unified waveform
        </div>
      {/if}

      <!-- Playhead indicator -->
      {#if projectStore.project.audio.duration > 0}
        <div 
          class="absolute top-0 bottom-0 w-0.5 bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)] z-10 pointer-events-none"
          style={`left: ${(projectStore.currentTime / projectStore.project.audio.duration) * 100}%;`}
        >
          <div class="w-3 h-3 bg-cyan-400 rounded-sm -translate-x-[5px] -translate-y-1 transform rotate-45"></div>
        </div>
      {/if}
    </div>

    <!-- Multi-track Layer Overview -->
    <div class="grid grid-cols-4 gap-2 text-[11px]">
      <div class="p-1.5 rounded bg-neutral-950 border border-neutral-800/80 flex items-center justify-between text-neutral-400">
        <span>🎬 Background</span>
        <span class="text-neutral-500">{projectStore.project.background.type}</span>
      </div>
      <div class="p-1.5 rounded bg-neutral-950 border border-neutral-800/80 flex items-center justify-between text-neutral-400">
        <span>📊 Spectrum</span>
        <span class={projectStore.project.overlays.spectrum.enabled ? 'text-cyan-400' : 'text-neutral-600'}>
          {projectStore.project.overlays.spectrum.enabled ? 'Active' : 'Off'}
        </span>
      </div>
      <div class="p-1.5 rounded bg-neutral-950 border border-neutral-800/80 flex items-center justify-between text-neutral-400">
        <span>✨ Particles</span>
        <span class={projectStore.project.overlays.particle.enabled ? 'text-cyan-400' : 'text-neutral-600'}>
          {projectStore.project.overlays.particle.enabled ? 'Active' : 'Off'}
        </span>
      </div>
      <div class="p-1.5 rounded bg-neutral-950 border border-neutral-800/80 flex items-center justify-between text-neutral-400">
        <span>🎤 Lyrics</span>
        <span class={projectStore.project.lyrics.config.enabled ? 'text-cyan-400' : 'text-neutral-600'}>
          {projectStore.project.lyrics.config.enabled ? 'Active' : 'Off'}
        </span>
      </div>
    </div>
  </div>
</div>

