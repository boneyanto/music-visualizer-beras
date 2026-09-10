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

    await projectStore.addAudioTracks(target.files);
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

<div class="h-32 border-t border-neutral-800 bg-neutral-900/95 flex flex-col shrink-0 select-none z-20">
  <!-- Timeline Header / Controls -->
  <div class="h-8 border-b border-neutral-800/80 px-3 sm:px-4 flex items-center justify-between text-xs text-neutral-400">
    <div class="flex items-center gap-2 sm:gap-3">
      <span class="font-semibold text-neutral-200 flex items-center gap-1.5 text-[11px] sm:text-xs">
        <Music class="w-3.5 h-3.5 text-cyan-400" />
        Multi-Track Audio ({projectStore.project.audio.tracks?.length || 0})
      </span>

      <button 
        onclick={() => fileInput.click()}
        class="px-2 py-0.5 sm:px-2.5 sm:py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-[10px] sm:text-[11px] font-medium flex items-center gap-1.5 transition-colors border border-neutral-700 cursor-pointer"
      >
        <Plus class="w-3 h-3 text-cyan-400" />
        <span>Add MP3 / WAV</span>
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
        class="px-2 py-0.5 sm:px-2.5 sm:py-1 rounded text-[10px] sm:text-[11px] font-medium flex items-center gap-1.5 transition-colors border cursor-pointer bg-neutral-800 hover:bg-neutral-700 text-cyan-300 border-neutral-700"
      >
        <ListMusic class="w-3 h-3 text-cyan-400" />
        <span>Playlist ({projectStore.project.audio.tracks?.length || 0})</span>
      </button>
    </div>

    <!-- Audio Track Summary & Counter -->
    <div class="flex items-center gap-2 sm:gap-3">
      {#if projectStore.project.audio.tracks && projectStore.project.audio.tracks.length > 0}
        <span class="text-[10px] sm:text-[11px] text-cyan-400 font-mono">
          Total: {Math.floor(projectStore.project.audio.duration / 60)}:{(Math.floor(projectStore.project.audio.duration % 60)).toString().padStart(2, '0')}
        </span>
        <button 
          onclick={handleDeleteAllTracks}
          class={`flex items-center gap-1 text-[10px] sm:text-[11px] px-1.5 py-0.5 rounded transition-all cursor-pointer ${
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
  <div class="flex-1 p-2 sm:p-2.5 flex flex-col gap-1.5 overflow-hidden relative">

    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div 
      class="h-10 w-full bg-neutral-950/80 rounded-lg border border-neutral-800 relative cursor-pointer overflow-hidden group"
      onclick={handleTimelineClick}
    >
      {#if projectStore.isProcessingAudio}
        <div class="absolute inset-0 flex items-center justify-center gap-2 bg-neutral-950/90 text-cyan-400 text-xs">
          <Loader2 class="w-3.5 h-3.5 animate-spin" />
          <span class="text-[11px]">Combining Audio & Analyzing... {Math.round(projectStore.analysisProgress * 100)}%</span>
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
              style={`height: ${Math.max(3, (freqVal / 255) * 26)}px;`}
            ></div>
          {/each}
        </div>
      {:else}
        <div class="absolute inset-0 flex items-center justify-center text-neutral-500 text-[11px] px-2 text-center">
          Drop audio files atau klik "Add MP3 / WAV" untuk memuat waveform
        </div>
      {/if}

      <!-- Playhead indicator -->
      {#if projectStore.project.audio.duration > 0}
        <div 
          class="absolute top-0 bottom-0 w-0.5 bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)] z-10 pointer-events-none"
          style={`left: ${(projectStore.currentTime / projectStore.project.audio.duration) * 100}%;`}
        >
          <div class="w-2.5 h-2.5 bg-cyan-400 rounded-sm -translate-x-[4px] -translate-y-0.5 transform rotate-45"></div>
        </div>
      {/if}
    </div>

    <!-- Multi-track Layer Overview (Compact single line) -->
    <div class="grid grid-cols-4 gap-1.5 text-[10px]">
      <div class="px-2 py-1 rounded bg-neutral-950/80 border border-neutral-800/80 flex items-center justify-between text-neutral-400">
        <span class="truncate">🎬 Background</span>
        <span class="text-neutral-500 truncate ml-1">{projectStore.project.background.type}</span>
      </div>
      <div class="px-2 py-1 rounded bg-neutral-950/80 border border-neutral-800/80 flex items-center justify-between text-neutral-400">
        <span>📊 Spectrum</span>
        <span class={projectStore.project.overlays.spectrum.enabled ? 'text-cyan-400 font-medium' : 'text-neutral-600'}>
          {projectStore.project.overlays.spectrum.enabled ? 'Active' : 'Off'}
        </span>
      </div>
      <div class="px-2 py-1 rounded bg-neutral-950/80 border border-neutral-800/80 flex items-center justify-between text-neutral-400">
        <span>✨ Particles</span>
        <span class={projectStore.project.overlays.particle.enabled ? 'text-cyan-400 font-medium' : 'text-neutral-600'}>
          {projectStore.project.overlays.particle.enabled ? 'Active' : 'Off'}
        </span>
      </div>
      <div class="px-2 py-1 rounded bg-neutral-950/80 border border-neutral-800/80 flex items-center justify-between text-neutral-400">
        <span>🎤 Lyrics</span>
        <span class={projectStore.project.lyrics.config.enabled ? 'text-cyan-400 font-medium' : 'text-neutral-600'}>
          {projectStore.project.lyrics.config.enabled ? 'Active' : 'Off'}
        </span>
      </div>
    </div>
  </div>
</div>

