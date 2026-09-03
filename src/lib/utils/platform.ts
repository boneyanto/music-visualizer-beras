/**
 * Platform Detection Helper
 * Safely identifies whether the application is running inside a native desktop wrapper (Tauri)
 * or inside a standard web browser (Chrome, Safari, Edge, Firefox).
 */

export const isDesktop = (): boolean => {
  if (typeof window === 'undefined') return false;
  return Boolean((window as any).isTauri || (window as any).__TAURI_INTERNALS__);
};

export const getPlatformName = (): 'desktop' | 'web' => {
  return isDesktop() ? 'desktop' : 'web';
};
