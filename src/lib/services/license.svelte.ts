import { isDesktop } from '../utils/platform';

export interface LicenseInfo {
  hwid: string;
  is_licensed: boolean;
  license_key: string | null;
}

class LicenseManager {
  public hwid = $state<string>('');
  public isLicensed = $state<boolean>(false);
  public licenseKey = $state<string | null>(null);
  public isLoading = $state<boolean>(true);
  public errorMessage = $state<string | null>(null);

  constructor() {
    this.init();
  }

  async init() {
    this.isLoading = true;
    this.errorMessage = null;

    if (isDesktop()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const info = await invoke<LicenseInfo>('get_license_info');
        this.hwid = info.hwid;
        this.isLicensed = info.is_licensed;
        this.licenseKey = info.license_key;
      } catch (err: any) {
        console.warn('Failed to get native license info:', err);
        this.fallbackWebInit();
      }
    } else {
      this.fallbackWebInit();
    }
    this.isLoading = false;
  }

  private fallbackWebInit() {
    // Generate or read web-based pseudo-HWID for browser preview
    let webHwid = localStorage.getItem('beras_web_hwid');
    if (!webHwid) {
      const rand = Math.random().toString(36).substring(2, 10).toUpperCase();
      webHwid = `BERAS-WEB-${rand}`;
      localStorage.setItem('beras_web_hwid', webHwid);
    }
    this.hwid = webHwid;
    const savedKey = localStorage.getItem('beras_web_license');
    if (savedKey) {
      this.licenseKey = savedKey;
      this.isLicensed = true;
    } else {
      this.isLicensed = false;
    }
  }

  async activate(key: string): Promise<boolean> {
    this.errorMessage = null;
    const cleanKey = key.trim().toUpperCase();

    if (!cleanKey.startsWith('PRO-')) {
      this.errorMessage = 'Format Serial Key salah. Harus berawalan PRO-XXXX-...';
      return false;
    }

    if (isDesktop()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const info = await invoke<LicenseInfo>('activate_license', { key: cleanKey });
        this.isLicensed = info.is_licensed;
        this.licenseKey = info.license_key;
        this.hwid = info.hwid;
        return true;
      } catch (err: any) {
        this.errorMessage = typeof err === 'string' ? err : (err.message || 'Gagal aktivasi lisensi.');
        return false;
      }
    } else {
      // Browser preview mode
      localStorage.setItem('beras_web_license', cleanKey);
      this.isLicensed = true;
      this.licenseKey = cleanKey;
      return true;
    }
  }
}

export const licenseManager = new LicenseManager();
