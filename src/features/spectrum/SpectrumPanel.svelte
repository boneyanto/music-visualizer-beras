<script lang="ts">
  import { projectStore } from '../../lib/stores/project.svelte';
  import { Move } from '@lucide/svelte';
</script>

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

  <!-- Mirror Symmetrical -->
  <div class="p-3 bg-neutral-950/60 rounded-lg border border-neutral-800/80 flex items-center justify-between">
    <div>
      <span class="text-neutral-300 font-medium block">Mirror Mode</span>
      <span class="text-[10px] text-neutral-500 block">Spektrum simetris kiri & kanan</span>
    </div>
    <input 
      type="checkbox" 
      bind:checked={projectStore.project.overlays.spectrum.mirror}
      onchange={() => projectStore.saveToDB()}
      class="accent-cyan-500 w-4 h-4 cursor-pointer"
    />
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
