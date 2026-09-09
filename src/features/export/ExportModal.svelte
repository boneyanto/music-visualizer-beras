<script lang="ts">
  import { projectStore } from '../../lib/stores/project.svelte';
  import { videoExporter } from './exporter.svelte';
  import { 
    Download, 
    X, 
    CheckCircle2, 
    AlertCircle, 
    Loader2, 
    Film, 
    Sliders, 
    Cpu,
    Sparkles,
    Gauge,
    Hourglass,
    Zap,
    Maximize2,
    Clock,
    ShieldAlert,
    Lock
  } from '@lucide/svelte';
  import { licenseManager } from '../licensing';

  interface Props {
    onOpenLicense?: () => void;
  }

  let { onOpenLicense }: Props = $props();

  let exportedBlob = $state<Blob | null>(null);
  let savedFilePath = $state<string | null>(null);
  let showModal = $state(false);


  export function open() {
    showModal = true;
    exportedBlob = null;
    savedFilePath = null;
    videoExporter.errorMessage = null;
  }

  export function close() {
    if (videoExporter.isExporting) {
      videoExporter.cancelExport();
    }
    if (exportedBlob) {
      exportedBlob = null;
    }
    savedFilePath = null;
    showModal = false;
  }

  async function handleStartExport(e?: Event) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    try {
      exportedBlob = await videoExporter.startExport();
      if (exportedBlob) {
        await handleDownload();
      }
    } catch (err: any) {
      console.error('Export error caught:', err);
    }
  }

  async function handleDownload(e?: Event) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (exportedBlob) {
      const sanitizedTitle = (projectStore.project.title || 'visualizer')
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '_');
      const now = new Date();
      const pad = (n: number) => n.toString().padStart(2, '0');
      const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
      savedFilePath = await videoExporter.downloadBlob(exportedBlob, `${timestamp}_${sanitizedTitle}.mp4`);
    }
  }

  function formatDuration(seconds: number): string {
    if (seconds <= 0) return '0s';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    if (m > 0) {
      return `${m}m ${s}s`;
    }
    return `${s}s`;
  }

  function formatETA(seconds: number): string {
    if (seconds <= 0) return 'Loading...';
    return formatDuration(seconds);
  }
</script>

{#if showModal}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div 
    class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200"
  >
    <div class="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[88vh] text-neutral-100 animate-in zoom-in-95 duration-200">
      
      <!-- Header (Fixed) -->
      <div class="p-4 sm:p-5 border-b border-neutral-800 flex items-center justify-between bg-neutral-950/60 shrink-0">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 shrink-0">
            <Film class="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 class="text-sm font-semibold text-neutral-100">Export Video</h2>
            <p class="text-[10px] sm:text-[11px] text-neutral-400">High performance client-side offline GPU encoding</p>
          </div>
        </div>
        <button 
          type="button"
          onclick={close}
          class="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors cursor-pointer shrink-0"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Content (Scrollable) -->
      <div class="p-4 sm:p-6 space-y-4 sm:space-y-5 flex-1 overflow-y-auto min-h-0">
        
        <!-- Free Watermark Warning Notice -->
        {#if !licenseManager.isLicensed}
          <div class="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center justify-between text-xs text-amber-300">
            <div class="flex items-center gap-2.5">
              <ShieldAlert class="w-4 h-4 text-amber-400 shrink-0" />
              <div>
                <span class="font-semibold text-amber-200">Mode Free Use Aktif:</span>
                <span class="text-neutral-300 ml-1">Video akan memiliki watermark acak.</span>
              </div>
            </div>
            <button
              type="button"
              onclick={() => onOpenLicense?.()}
              class="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-semibold rounded-lg text-[11px] transition-colors cursor-pointer border border-amber-500/30 shrink-0"
            >
              Hapus Watermark (PRO)
            </button>
          </div>
        {/if}

        <!-- Video Specs & Direct Resolution Quick Selector -->
        {#if !videoExporter.isExporting && !exportedBlob}

          <div class="space-y-3 p-3.5 bg-neutral-950 rounded-xl border border-neutral-800 text-xs">
            <div class="flex items-center justify-between">
              <span class="text-neutral-300 font-semibold flex items-center gap-1.5">
                <Maximize2 class="w-3.5 h-3.5 text-cyan-400" />
                Pilih Resolusi Render:
              </span>
              <span class="text-[10px] font-mono text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/60">
                {projectStore.project.exportSettings.width}x{projectStore.project.exportSettings.height}
              </span>
            </div>

            <div class="grid grid-cols-2 gap-2">
              <button 
                type="button"
                onclick={() => projectStore.updateExportResolution('1280x720')}
                class={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${projectStore.project.exportSettings.resolution === '1280x720' ? 'border-cyan-500 bg-cyan-500/10 text-cyan-300 shadow-sm' : 'border-neutral-800 bg-neutral-900/60 text-neutral-400 hover:border-neutral-700'}`}
              >
                <div class="font-bold flex items-center justify-between text-xs">
                  <span>720p HD (16:9)</span>
                  <span class="text-[9px] px-1 rounded bg-amber-500/20 text-amber-300 font-semibold uppercase">Super Cepat 🚀</span>
                </div>
                <div class="text-[10px] text-neutral-500 mt-0.5">1280x720 • Speed hingga 7x–12x</div>
              </button>

              <button 
                type="button"
                onclick={() => projectStore.updateExportResolution('1920x1080')}
                class={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${projectStore.project.exportSettings.resolution === '1920x1080' ? 'border-cyan-500 bg-cyan-500/10 text-cyan-300 shadow-sm' : 'border-neutral-800 bg-neutral-900/60 text-neutral-400 hover:border-neutral-700'}`}
              >
                <div class="font-bold flex items-center justify-between text-xs">
                  <span>1080p FHD (16:9)</span>
                  <span class="text-[9px] px-1 rounded bg-cyan-500/20 text-cyan-300 font-semibold uppercase">Crisp Ultra</span>
                </div>
                <div class="text-[10px] text-neutral-500 mt-0.5">1920x1080 • Kualitas YouTube Maksimal</div>
              </button>
            </div>

            <!-- Other Formats Selector -->
            <div class="flex items-center justify-between pt-1 border-t border-neutral-900 text-[11px]">
              <span class="text-neutral-500">Format Lainnya:</span>
              <div class="flex gap-1.5">
                <button 
                  type="button"
                  onclick={() => projectStore.updateExportResolution('720x1280')}
                  class={`px-2 py-0.5 rounded text-[10px] font-medium border cursor-pointer ${projectStore.project.exportSettings.resolution === '720x1280' ? 'border-cyan-500 bg-cyan-500/20 text-cyan-300' : 'border-neutral-800 text-neutral-400'}`}
                >
                  720p TikTok (9:16)
                </button>
                <button 
                  type="button"
                  onclick={() => projectStore.updateExportResolution('1080x1920')}
                  class={`px-2 py-0.5 rounded text-[10px] font-medium border cursor-pointer ${projectStore.project.exportSettings.resolution === '1080x1920' ? 'border-cyan-500 bg-cyan-500/20 text-cyan-300' : 'border-neutral-800 text-neutral-400'}`}
                >
                  1080p Reels (9:16)
                </button>
                <button 
                  type="button"
                  onclick={() => projectStore.updateExportResolution('1080x1080')}
                  class={`px-2 py-0.5 rounded text-[10px] font-medium border cursor-pointer ${projectStore.project.exportSettings.resolution === '1080x1080' ? 'border-cyan-500 bg-cyan-500/20 text-cyan-300' : 'border-neutral-800 text-neutral-400'}`}
                >
                  Square (1:1)
                </button>
              </div>
            </div>

            <!-- Frame Rate Quick Selector -->
            <div class="flex items-center justify-between pt-2 border-t border-neutral-900 text-[11px]">
              <span class="text-neutral-500 flex items-center gap-1">
                <Film class="w-3 h-3 text-cyan-400" />
                Frame Rate:
              </span>
              <div class="flex gap-1.5">
                <button 
                  type="button"
                  onclick={() => { projectStore.project.exportSettings.fps = 24; projectStore.saveToDB(); }}
                  class={`px-2.5 py-0.5 rounded text-[10px] font-semibold border cursor-pointer ${projectStore.project.exportSettings.fps === 24 ? 'border-cyan-500 bg-cyan-500/20 text-cyan-300' : 'border-neutral-800 text-neutral-400 hover:border-neutral-700'}`}
                >
                  24 FPS 🎬 (Tercepat)
                </button>
                <button 
                  type="button"
                  onclick={() => { projectStore.project.exportSettings.fps = 30; projectStore.saveToDB(); }}
                  class={`px-2.5 py-0.5 rounded text-[10px] font-semibold border cursor-pointer ${projectStore.project.exportSettings.fps === 30 ? 'border-cyan-500 bg-cyan-500/20 text-cyan-300' : 'border-neutral-800 text-neutral-400 hover:border-neutral-700'}`}
                >
                  30 FPS (Standar)
                </button>
                <button 
                  type="button"
                  onclick={() => { projectStore.project.exportSettings.fps = 60; projectStore.saveToDB(); }}
                  class={`px-2.5 py-0.5 rounded text-[10px] font-semibold border cursor-pointer ${projectStore.project.exportSettings.fps === 60 ? 'border-cyan-500 bg-cyan-500/20 text-cyan-300' : 'border-neutral-800 text-neutral-400 hover:border-neutral-700'}`}
                >
                  60 FPS (Smooth)
                </button>
              </div>
            </div>
          </div>
        {:else}
          <!-- Video Specs Card During Render -->
          <div class="grid grid-cols-3 gap-3 p-3 bg-neutral-950/80 rounded-xl border border-neutral-800/80 text-xs">
            <div>
              <span class="text-neutral-500 text-[10px] block uppercase">Resolution</span>
              <span class="font-semibold text-neutral-200">{projectStore.project.exportSettings.resolution}</span>
            </div>
            <div>
              <span class="text-neutral-500 text-[10px] block uppercase">Frame Rate</span>
              <span class="font-semibold text-neutral-200">{projectStore.project.exportSettings.fps} FPS</span>
            </div>
            <div>
              <span class="text-neutral-500 text-[10px] block uppercase">Duration</span>
              <span class="font-semibold text-neutral-200">{Math.round(projectStore.project.audio.duration || 10)}s</span>
            </div>
          </div>
        {/if}

        <!-- Progress or Status -->
        {#if videoExporter.isExporting}
          <div class="space-y-3.5 p-4 bg-neutral-950 rounded-xl border border-cyan-800/40 shadow-lg shadow-cyan-950/30 animate-in fade-in">
            <div class="flex items-center justify-between text-xs">
              <span class="text-neutral-200 font-semibold flex items-center gap-2">
                <Loader2 class="w-4 h-4 text-cyan-400 animate-spin" />
                {#if videoExporter.stage === 'preparing'}
                  Menyiapkan Media & Audio...
                {:else if videoExporter.stage === 'encoding_audio'}
                  Mengompres Audio Track (AAC)...
                {:else if videoExporter.stage === 'finalizing'}
                  Menyusun & Menyimpan File MP4 (Mohon tunggu, jangan tutup aplikasi)...
                {:else}
                  Encoding Video Frames...
                {/if}
              </span>
              <span class="font-mono text-cyan-400 font-bold text-sm">{Math.round(videoExporter.progress * 100)}%</span>
            </div>

            {#if videoExporter.stage === 'finalizing'}
              <div class="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] flex items-center gap-2 animate-pulse">
                <Hourglass class="w-4 h-4 shrink-0 text-amber-400" />
                <span><b>Sedang Menggabungkan Audio & Video:</b> Mohon jangan tutup aplikasi sampai file MP4 selesai disimpan.</span>
              </div>
            {/if}

            <!-- Progress Bar -->
            <div class="w-full h-3 bg-neutral-800 rounded-full overflow-hidden p-0.5 border border-neutral-700/50">
              <div 
                class="h-full bg-gradient-to-r from-cyan-500 via-indigo-500 to-fuchsia-500 transition-all duration-150 rounded-full shadow-[0_0_12px_rgba(6,182,212,0.6)]"
                style={`width: ${videoExporter.progress * 100}%;`}
              ></div>
            </div>

            <!-- Speed, Elapsed & ETA Telemetry Dashboard (4 Columns) -->
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
              <div class="p-2 rounded-lg bg-neutral-900 border border-neutral-800/80 flex items-center gap-2">
                <Gauge class="w-4 h-4 text-cyan-400 shrink-0" />
                <div class="min-w-0">
                  <div class="text-[9px] text-neutral-500 uppercase font-medium">Speed Render</div>
                  <div class="font-mono text-xs font-bold text-cyan-300">
                    {videoExporter.currentFPS} FPS <span class="text-[10px] text-neutral-400 font-normal">({videoExporter.speedMultiplier}x)</span>
                  </div>
                </div>
              </div>

              <div class="p-2 rounded-lg bg-neutral-900 border border-neutral-800/80 flex items-center gap-2">
                <Clock class="w-4 h-4 text-emerald-400 shrink-0" />
                <div class="min-w-0">
                  <div class="text-[9px] text-neutral-500 uppercase font-medium">Waktu Berjalan</div>
                  <div class="font-mono text-xs font-bold text-emerald-300">
                    {formatDuration(videoExporter.elapsedSeconds)}
                  </div>
                </div>
              </div>

              <div class="p-2 rounded-lg bg-neutral-900 border border-neutral-800/80 flex items-center gap-2">
                <Hourglass class="w-4 h-4 text-amber-400 shrink-0" />
                <div class="min-w-0">
                  <div class="text-[9px] text-neutral-500 uppercase font-medium">Sisa Estimasi</div>
                  <div class="font-mono text-xs font-bold text-amber-300">
                    {formatETA(videoExporter.etaSeconds)}
                  </div>
                </div>
              </div>

              <div class="p-2 rounded-lg bg-neutral-900 border border-neutral-800/80 flex items-center gap-2">
                <Film class="w-4 h-4 text-indigo-400 shrink-0" />
                <div class="min-w-0">
                  <div class="text-[9px] text-neutral-500 uppercase font-medium">Progres Frame</div>
                  <div class="font-mono text-xs font-bold text-neutral-200 truncate">
                    {videoExporter.currentFrame}/{videoExporter.totalFrames}
                  </div>
                </div>
              </div>
            </div>
          </div>
        {:else if exportedBlob}
          <div class="p-4 bg-emerald-950/20 border border-emerald-800/30 rounded-xl flex items-center gap-3 text-emerald-300 text-xs animate-in zoom-in-95">
            <CheckCircle2 class="w-6 h-6 text-emerald-400 shrink-0" />
            <div>
              <div class="font-semibold text-emerald-200 text-sm">Video Selesai & Auto Downloaded!</div>
              <div class="text-[11px] text-emerald-400/80 mt-0.5">
                Total waktu render: <strong>{formatDuration(videoExporter.finalRenderTimeSeconds)}</strong> • Ukuran file: {(exportedBlob.size / (1024 * 1024)).toFixed(2)} MB
              </div>
              {#if savedFilePath}
                <div class="mt-2 text-[11px] bg-emerald-950/60 p-2 rounded-lg border border-emerald-800/40 text-emerald-200 break-all select-all">
                  📁 Disimpan di: <strong>{savedFilePath}</strong>
                </div>
              {/if}
            </div>
          </div>
        {:else if videoExporter.errorMessage}
          <div class="p-4 bg-rose-950/20 border border-rose-800/30 rounded-xl flex items-center gap-3 text-rose-300 text-xs animate-in zoom-in-95">
            <AlertCircle class="w-4 h-4 text-rose-400 shrink-0" />
            <div>
              <div class="font-semibold text-rose-200">Render Gagal</div>
              <div class="text-[11px] text-rose-400/80 mt-0.5">{videoExporter.errorMessage}</div>
            </div>
          </div>
        {:else}
          <!-- Tech Info -->
          <div class="flex items-start gap-3 p-3 bg-cyan-950/20 border border-cyan-800/30 rounded-xl text-xs text-cyan-200">
            <Cpu class="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <div class="text-[11px] leading-relaxed">
              Rendering berjalan dan <strong>Auto-Download</strong> begitu encoding selesai.
            </div>
          </div>
        {/if}
      </div>

      <!-- Footer Buttons (Fixed) -->
      <div class="p-4 sm:p-5 border-t border-neutral-800 bg-neutral-950/60 flex items-center justify-end gap-2.5 sm:gap-3 shrink-0">
        <button 
          type="button"
          onclick={close}
          class="px-3.5 py-2 rounded-xl text-xs font-medium text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors cursor-pointer"
        >
          {exportedBlob ? 'Tutup & Bersihkan RAM' : 'Batal'}
        </button>

        {#if videoExporter.isExporting}
          <button 
            type="button"
            onclick={() => videoExporter.cancelExport()}
            class="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-lg shadow-rose-600/20 transition-colors cursor-pointer"
          >
            Cancel Render
          </button>
        {:else if exportedBlob}
          <button 
            type="button"
            onclick={handleDownload}
            class="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition-all active:scale-95 cursor-pointer"
          >
            <Download class="w-4 h-4" />
            Download Lagi
          </button>
        {:else}
          <button 
            type="button"
            onclick={handleStartExport}
            class="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 bg-cyan-500 hover:bg-cyan-400 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-cyan-500/20 transition-all active:scale-95 cursor-pointer"
          >
            <Sparkles class="w-4 h-4" />
            Mulai Render MP4
          </button>
        {/if}
      </div>
    </div>
  </div>
{/if}
