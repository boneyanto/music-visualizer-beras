import { db } from '../db/database';
import type { CustomFontItem } from '../types/project';

export class FontManager {
  private loadedFonts = new Set<string>();
  private fontBuffers = new Map<string, ArrayBuffer>();

  async registerFontFromBlob(name: string, blob: Blob): Promise<string> {
    const arrayBuffer = await blob.arrayBuffer();
    const cleanFontName = name.replace(/\.[^/.]+$/, '').trim();

    try {
      const fontFace = new FontFace(cleanFontName, arrayBuffer);
      await fontFace.load();
      document.fonts.add(fontFace);
      this.loadedFonts.add(cleanFontName);
      this.fontBuffers.set(cleanFontName, arrayBuffer.slice(0));
      console.log(`✅ Registered custom font: ${cleanFontName}`);
      return cleanFontName;
    } catch (err) {
      console.warn(`Failed to register custom font ${cleanFontName}:`, err);
      throw err;
    }
  }

  async registerFontFromArrayBuffer(name: string, arrayBuffer: ArrayBuffer): Promise<string> {
    const cleanFontName = name.replace(/\.[^/.]+$/, '').trim();
    try {
      const fontFace = new FontFace(cleanFontName, arrayBuffer);
      await fontFace.load();
      document.fonts.add(fontFace);
      this.loadedFonts.add(cleanFontName);
      this.fontBuffers.set(cleanFontName, arrayBuffer.slice(0));
      return cleanFontName;
    } catch (err) {
      console.warn(`Failed to register font ${cleanFontName}:`, err);
      throw err;
    }
  }

  getFontBuffer(name: string): ArrayBuffer | undefined {
    return this.fontBuffers.get(name);
  }

  getAllFontBuffers(): Array<{ name: string; buffer: ArrayBuffer }> {
    const result: Array<{ name: string; buffer: ArrayBuffer }> = [];
    this.fontBuffers.forEach((buffer, name) => {
      result.push({ name, buffer: buffer.slice(0) });
    });
    return result;
  }

  async rehydrateFonts(customFonts?: CustomFontItem[]) {
    if (!customFonts || customFonts.length === 0) return;

    for (const fontItem of customFonts) {
      if (this.loadedFonts.has(fontItem.name)) continue;

      try {
        const stored = await db.assets.get('font-' + fontItem.name);
        if (stored && stored.blob) {
          await this.registerFontFromBlob(fontItem.name, stored.blob);
        } else if (fontItem.url) {
          const resp = await fetch(fontItem.url);
          const blob = await resp.blob();
          await this.registerFontFromBlob(fontItem.name, blob);
        }
      } catch (e) {
        console.warn('Failed to rehydrate font:', fontItem.name, e);
      }
    }
  }
}

export const fontManager = new FontManager();
