<script lang="ts">
  import { licenseManager } from '../services/license.svelte';
  import { isDesktop } from '../utils/platform';
  import { 
    ShieldCheck, 
    Key, 
    Copy, 
    Check, 
    X, 
    AlertCircle, 
    CreditCard, 
    Sparkles, 
    Lock,
    ExternalLink,
    Loader2,
    Send
  } from '@lucide/svelte';

  let showModal = $state(false);
  let inputKey = $state('');
  let copiedHwid = $state(false);
  let copiedRekening = $state(false);
  let copiedTelegram = $state(false);
  let isSubmitting = $state(false);
  let successMessage = $state<string | null>(null);

  async function openTelegramUrl(e?: MouseEvent) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const url = 'https://t.me/nurdiyantodyas';
    if (isDesktop()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('open_external_url', { url });
        return;
      } catch (invokeErr) {
        console.warn('Native open_external_url failed, trying plugin-opener:', invokeErr);
        try {
          const { openUrl } = await import('@tauri-apps/plugin-opener');
          await openUrl(url);
          return;
        } catch (openerErr) {
          console.warn('Plugin opener also failed:', openerErr);
        }
      }
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  }



  export function open() {
    showModal = true;
    inputKey = '';
    successMessage = null;
    licenseManager.errorMessage = null;
  }

  export function close() {
    showModal = false;
  }

  async function copyToClipboard(text: string, type: 'hwid' | 'rekening' | 'telegram') {
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'hwid') {
        copiedHwid = true;
        setTimeout(() => copiedHwid = false, 2500);
      } else if (type === 'rekening') {
        copiedRekening = true;
        setTimeout(() => copiedRekening = false, 2500);
      } else {
        copiedTelegram = true;
        setTimeout(() => copiedTelegram = false, 2500);
      }
    } catch (err) {
      console.warn('Clipboard failed:', err);
    }
  }


  async function handleActivate() {
    if (!inputKey.trim()) return;
    isSubmitting = true;
    try {
      const ok = await licenseManager.activate(inputKey);
      if (ok) {
        successMessage = 'Lisensi PRO Berhasil Diaktifkan! Watermark sekarang dinonaktifkan permanen.';
        setTimeout(() => {
          showModal = false;
        }, 2000);
      }
    } finally {
      isSubmitting = false;
    }
  }
</script>

{#if showModal}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div 
    class="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
    onclick={(e) => e.target === e.currentTarget && close()}
  >
    <div class="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col text-neutral-100 animate-in zoom-in-95 duration-200">
      
      <!-- Header -->
      <div class="p-5 border-b border-neutral-800 flex items-center justify-between bg-neutral-950/60">
        <div class="flex items-center gap-3">
          <div class={`w-10 h-10 rounded-xl flex items-center justify-center shadow-lg ${licenseManager.isLicensed ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'}`}>
            {#if licenseManager.isLicensed}
              <ShieldCheck class="w-5 h-5" />
            {:else}
              <Lock class="w-5 h-5" />
            {/if}
          </div>
          <div>
            <div class="flex items-center gap-2">
              <h2 class="text-sm font-bold text-neutral-100">Aktivasi Lisensi Beras Visualizer</h2>
              {#if licenseManager.isLicensed}
                <span class="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-semibold uppercase tracking-wider">
                  PRO Active
                </span>
              {:else}
                <span class="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 font-semibold uppercase tracking-wider">
                  Free Edition
                </span>
              {/if}
            </div>
            <p class="text-[11px] text-neutral-400 mt-0.5">
              {licenseManager.isLicensed ? 'Aplikasi berlisensi penuh. Watermark bebas 100%.' : 'Free use menyertakan watermark acak saat render video.'}
            </p>
          </div>
        </div>
        <button 
          type="button"
          onclick={close}
          class="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors cursor-pointer"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Content -->
      <div class="p-6 space-y-5">
        
        {#if successMessage}
          <div class="p-3.5 bg-emerald-950/60 border border-emerald-800/80 rounded-xl text-xs text-emerald-300 flex items-center gap-2.5">
            <Check class="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successMessage}</span>
          </div>
        {/if}

        {#if licenseManager.errorMessage}
          <div class="p-3.5 bg-rose-950/60 border border-rose-800/80 rounded-xl text-xs text-rose-300 flex items-center gap-2.5">
            <AlertCircle class="w-4 h-4 text-rose-400 shrink-0" />
            <span>{licenseManager.errorMessage}</span>
          </div>
        {/if}

        <!-- HWID Box -->
        <div class="space-y-1.5">
          <div class="text-xs font-semibold text-neutral-300 flex items-center justify-between">
            <span>Hardware ID (HWID) Perangkat Anda:</span>
            <span class="text-[10px] text-neutral-500 font-normal">Terkunci ke mesin ini</span>
          </div>
          <div class="flex items-center gap-2">

            <div class="flex-1 bg-neutral-950 border border-neutral-800 rounded-xl px-3.5 py-2.5 font-mono text-xs text-cyan-400 select-all tracking-wider font-semibold truncate">
              {licenseManager.hwid || 'Mendeteksi HWID...'}
            </div>
            <button 
              type="button"
              onclick={() => copyToClipboard(licenseManager.hwid, 'hwid')}
              class="px-3.5 py-2.5 bg-neutral-800 hover:bg-neutral-700 active:scale-95 text-neutral-200 text-xs font-medium rounded-xl border border-neutral-700 flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
              title="Salin HWID"
            >
              {#if copiedHwid}
                <Check class="w-3.5 h-3.5 text-emerald-400" />
                <span class="text-emerald-400">Tersalin</span>
              {:else}
                <Copy class="w-3.5 h-3.5 text-neutral-400" />
                <span>Salin</span>
              {/if}
            </button>
          </div>
          <p class="text-[10px] text-neutral-500">
            Kirimkan HWID ini ke penjual untuk menerbitkan Serial Key Anda.
          </p>
        </div>

        <!-- Pembayaran Mandiri Box -->
        <div class="bg-gradient-to-br from-neutral-950 to-neutral-900 border border-neutral-800 rounded-xl p-4 space-y-3">
          <div class="flex items-center gap-2 text-xs font-semibold text-neutral-200">
            <CreditCard class="w-4 h-4 text-amber-400" />
            <span>Instruksi Pembayaran Lisensi PRO:</span>
          </div>
          
          <div class="bg-neutral-900/90 border border-neutral-800/80 rounded-lg p-3 flex items-center justify-between">
            <div class="space-y-0.5">
              <div class="text-[10px] text-neutral-400 uppercase tracking-wider">Bank Mandiri</div>
              <div class="text-sm font-bold font-mono text-neutral-100 tracking-wider">
                1540015755162
              </div>
              <div class="text-xs text-amber-400 font-medium">a.n nurdiyanto</div>
            </div>
            <button 
              type="button"
              onclick={() => copyToClipboard('1540015755162', 'rekening')}
              class="px-2.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[11px] rounded-lg border border-neutral-700 flex items-center gap-1 transition-colors cursor-pointer"
            >
              {#if copiedRekening}
                <Check class="w-3 h-3 text-emerald-400" />
                <span class="text-emerald-400">Tersalin</span>
              {:else}
                <Copy class="w-3 h-3 text-neutral-400" />
                <span>Salin Rekening</span>
              {/if}
            </button>
          </div>

          <!-- Telegram Contact Box -->
          <div class="bg-cyan-950/40 border border-cyan-800/60 rounded-lg p-3 flex items-center justify-between">
            <div class="flex items-center gap-2.5">
              <div class="w-8 h-8 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
                <Send class="w-4 h-4" />
              </div>
              <div class="space-y-0.5">
                <div class="text-[10px] text-cyan-400 uppercase font-semibold tracking-wider">Kontak Pembelian & Konfirmasi</div>
                <div class="text-xs font-bold text-neutral-100">Telegram: <span class="text-cyan-300 font-mono">@nurdiyantodyas</span></div>
              </div>
            </div>
            <div class="flex items-center gap-1.5">
              <button 
                type="button"
                onclick={() => copyToClipboard('@nurdiyantodyas', 'telegram')}
                class="px-2 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[10px] rounded-lg border border-neutral-700 flex items-center gap-1 transition-colors cursor-pointer"
                title="Salin username Telegram"
              >
                {#if copiedTelegram}
                  <Check class="w-3 h-3 text-emerald-400" />
                  <span class="text-emerald-400">Tersalin</span>
                {:else}
                  <Copy class="w-3 h-3 text-neutral-400" />
                  <span>Salin</span>
                {/if}
              </button>
              <button 
                type="button"
                onclick={openTelegramUrl}
                class="px-2.5 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-[10px] font-semibold rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
              >
                <span>Buka</span>
                <ExternalLink class="w-2.5 h-2.5" />
              </button>

            </div>
          </div>

          <div class="text-[11px] text-neutral-400 leading-relaxed space-y-1">
            <p>1. Salin HWID Anda di atas dan lakukan pembayaran ke rekening Mandiri tersebut.</p>
            <p>2. Kirimkan HWID & bukti transfer ke Telegram <strong class="text-neutral-200">@nurdiyantodyas</strong>.</p>
            <p>3. Masukkan Serial Key yang Anda terima ke kolom aktivasi di bawah.</p>
          </div>
        </div>


        <!-- Aktivasi Input -->
        <div class="space-y-2">
          <label for="license-input" class="text-xs font-semibold text-neutral-300 flex items-center gap-1.5">
            <Key class="w-3.5 h-3.5 text-cyan-400" />
            <span>Masukkan Serial Key:</span>
          </label>
          <div class="flex items-center gap-2">
            <input 
              id="license-input"
              type="text" 
              bind:value={inputKey}
              placeholder="PRO-XXXX-XXXX-XXXX-XXXX"
              class="flex-1 bg-neutral-950 border border-neutral-800 focus:border-cyan-500 rounded-xl px-3.5 py-2.5 font-mono text-xs text-neutral-100 placeholder:text-neutral-600 outline-none transition-all uppercase tracking-wider"
              disabled={isSubmitting || licenseManager.isLicensed}
              onkeydown={(e) => { if (e.key === 'Enter') handleActivate(); }}
            />
            <button 
              type="button"
              onclick={handleActivate}
              disabled={isSubmitting || !inputKey.trim() || licenseManager.isLicensed}
              class="px-4 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-xl shadow-md shadow-cyan-500/20 transition-all cursor-pointer flex items-center gap-1.5 shrink-0"
            >
              {#if isSubmitting}
                <Loader2 class="w-3.5 h-3.5 animate-spin" />
                <span>Memvalidasi...</span>
              {:else if licenseManager.isLicensed}
                <Check class="w-3.5 h-3.5 text-emerald-300" />
                <span>Teraktivasi</span>
              {:else}
                <Sparkles class="w-3.5 h-3.5" />
                <span>Aktifkan PRO</span>
              {/if}
            </button>
          </div>
        </div>

      </div>

      <!-- Footer -->
      <div class="p-4 bg-neutral-950/80 border-t border-neutral-800 flex items-center justify-between text-[11px] text-neutral-500">
        <span>Lisensi berlaku selamanya untuk 1 perangkat HWID</span>
        <button 
          type="button"
          onclick={close}
          class="px-3 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors cursor-pointer"
        >
          Tutup
        </button>
      </div>

    </div>
  </div>
{/if}
