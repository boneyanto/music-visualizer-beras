import type { ProjectConfig, AudioTrackItem, TextOverlayItem } from '../types/project';
import { db } from '../db/database';
import { AudioAnalyzer } from '../audio/analyzer';

const DEFAULT_PROJECT: ProjectConfig = {
  id: 'default-project',
  title: 'Untitled Track Visualizer',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  audio: {
    fileName: '',
    fileSize: 0,
    duration: 0,
    beatSensitivity: 1.2,
    tracks: [],
  },
  background: {
    type: 'single-image',
    items: [],
    transition: 'crossfade',
    transitionDuration: 1.0,
    scaleMode: 'cover',
    brightness: 1.0,
    followBeat: false,
    beatSensitivity: 1.0,
  },
  overlays: {
    particle: {
      enabled: true,
      preset: 'floating-dust',
      count: 60,
      size: 4,
      speed: 1.0,
      color: '#ffffff',
      opacity: 0.6,
      gravity: 'float',
      followBeat: true,
      beatSensitivity: 1.0,
    },
    spectrum: {
      enabled: true,
      style: 'circular',
      barCount: 64,
      color: '#38bdf8',
      secondaryColor: '#ec4899',
      height: 120,
      radius: 140,
      opacity: 0.9,
      mirror: false,
      followBeat: true,
      beatSensitivity: 1.2,
      x: 0.5,
      y: 0.5,
      scale: 1.0,
    },
    images: [],
    videos: [],
    texts: [],
    tracklist: {
      enabled: false,
      title: 'TRACKLIST',
      showTitle: true,
      fontFamily: 'Inter',
      fontSize: 26,
      titleFontSize: 36,
      color: '#ffffff',
      activeColor: '#38bdf8',
      accentColor: '#38bdf8',
      x: 0.08,
      y: 0.15,
      alignment: 'left',
      lineSpacing: 42,
      opacity: 1.0,
      shadow: true,
      shadowColor: 'rgba(0, 0, 0, 0.9)',
      nowPlayingAnimation: 'glow-badge',
      followBeat: true,
      beatSensitivity: 1.0,
      showNumbers: true,
      showDuration: true,
    },
    layerOrder: ['background', 'videos', 'images', 'texts', 'spectrum', 'particle', 'lyrics'],
  },
  lyrics: {
    segments: [],
    config: {
      enabled: true,
      style: 'karaoke',
      fontFamily: 'Inter',
      fontSize: 36,
      color: '#e2e8f0',
      highlightColor: '#38bdf8',
      position: 'bottom',
      x: 0.5,
      y: 0.85,
      animation: 'none',
      followBeat: false,
      beatSensitivity: 1.0,
    },
  },
  exportSettings: {
    resolution: '1920x1080',
    width: 1920,
    height: 1080,
    fps: 30,
    format: 'mp4',
    videoBitrate: 8_000_000,
    audioBitrate: 192_000,
  },
};

class ProjectState {
  project = $state<ProjectConfig>(structuredClone(DEFAULT_PROJECT));
  currentTime = $state<number>(0);
  isPlaying = $state<boolean>(false);
  activeTab = $state<'background' | 'particles' | 'spectrum' | 'lyrics' | 'images' | 'texts' | 'tracklist-overlay' | 'tracklist-png' | 'export'>('background');
  selectedLayer = $state<string | null>(null);
  audioBuffer = $state<AudioBuffer | null>(null);
  beats = $state<number[]>([]);
  frequencyFrames = $state<Uint8Array[]>([]);
  frameDuration = $state<number>(0.0116);
  isProcessingAudio = $state<boolean>(false);
  analysisProgress = $state<number>(0);
  isAutosaving = $state<boolean>(false);
  lastSavedTime = $state<number | null>(null);

  private trackBuffers = new Map<string, AudioBuffer>();

  async addAudioTrack(file: File) {
    this.isProcessingAudio = true;
    this.analysisProgress = 0.1;
    try {
      const url = URL.createObjectURL(file);
      const arrayBuffer = await file.arrayBuffer();
      const tempCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const decodedBuffer = await tempCtx.decodeAudioData(arrayBuffer.slice(0));
      await tempCtx.close();

      const trackId = 'track-' + Math.random().toString(36).substring(2, 9);
      const newTrack: AudioTrackItem = {
        id: trackId,
        name: file.name,
        fileSize: file.size,
        duration: decodedBuffer.duration,
        url,
        file,
      };

      this.trackBuffers.set(trackId, decodedBuffer);

      // Persist audio file to IndexedDB
      try {
        await db.assets.put({
          id: trackId,
          projectId: this.project.id,
          name: file.name,
          type: 'audio',
          blob: file,
          createdAt: Date.now(),
        });
      } catch (err) {
        console.warn('Could not cache audio in IndexedDB:', err);
      }

      if (!this.project.audio.tracks) {
        this.project.audio.tracks = [];
      }
      this.project.audio.tracks.push(newTrack);

      await this.rebuildMergedAudio();
      await this.saveToDB();
    } catch (e: any) {
      alert('Failed to load audio: ' + e.message);
    } finally {
      this.isProcessingAudio = false;
    }
  }

  async rebuildMergedAudio() {
    if (!this.project.audio.tracks || this.project.audio.tracks.length === 0) {
      this.audioBuffer = null;
      this.beats = [];
      this.frequencyFrames = [];
      this.project.audio.fileName = '';
      this.project.audio.duration = 0;
      return;
    }

    const buffers: AudioBuffer[] = [];

    for (const t of this.project.audio.tracks) {
      let b = this.trackBuffers.get(t.id);
      if (!b) {
        try {
          let arrayBuf: ArrayBuffer | null = null;
          if (t.file && typeof t.file.arrayBuffer === 'function') {
            arrayBuf = await t.file.arrayBuffer();
          } else if (t.url) {
            const resp = await fetch(t.url);
            arrayBuf = await resp.arrayBuffer();
          }
          if (arrayBuf) {
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            b = await ctx.decodeAudioData(arrayBuf);
            await ctx.close();
            this.trackBuffers.set(t.id, b);
          }
        } catch (err) {
          console.warn('Could not decode individual track:', t.name, err);
        }
      }
      if (b) buffers.push(b);
    }

    if (buffers.length > 0) {
      const merged = AudioAnalyzer.concatenateAudioBuffers(buffers);
      this.audioBuffer = merged;
      this.project.audio.fileName = `${this.project.audio.tracks.length} Tracks Combined (${Math.round(merged.duration)}s)`;
      this.project.audio.duration = merged.duration;
      this.project.updatedAt = Date.now();

      const analysis = await AudioAnalyzer.extractBeatMap(
        merged,
        this.project.audio.beatSensitivity,
        (prog) => {
          this.analysisProgress = prog;
        }
      );
      this.beats = analysis.beatMap.beats;
      this.frequencyFrames = analysis.frequencyFrames;
      this.frameDuration = analysis.frameDuration;
    }
  }

  async moveAudioTrackUp(index: number) {
    if (!this.project.audio.tracks || index <= 0) return;
    const tracks = this.project.audio.tracks;
    const temp = tracks[index];
    tracks[index] = tracks[index - 1];
    tracks[index - 1] = temp;
    await this.rebuildMergedAudio();
    this.saveToDB();
  }

  async moveAudioTrackDown(index: number) {
    if (!this.project.audio.tracks || index >= this.project.audio.tracks.length - 1) return;
    const tracks = this.project.audio.tracks;
    const temp = tracks[index];
    tracks[index] = tracks[index + 1];
    tracks[index + 1] = temp;
    await this.rebuildMergedAudio();
    this.saveToDB();
  }

  async removeAudioTrack(trackId: string) {
    if (!this.project.audio.tracks) return;
    const track = this.project.audio.tracks.find((t) => t.id === trackId);
    if (track?.url && track.url.startsWith('blob:')) {
      URL.revokeObjectURL(track.url);
    }
    this.project.audio.tracks = this.project.audio.tracks.filter((t) => t.id !== trackId);
    this.trackBuffers.delete(trackId);
    await this.rebuildMergedAudio();
    this.saveToDB();
  }

  async clearAllAudioTracks() {
    for (const t of this.project.audio.tracks || []) {
      if (t.url && t.url.startsWith('blob:')) {
        URL.revokeObjectURL(t.url);
      }
    }
    this.trackBuffers.clear();
    this.project.audio.tracks = [];
    this.project.audio.fileName = '';
    this.project.audio.duration = 0;
    this.audioBuffer = null;
    this.beats = [];
    this.frequencyFrames = [];
    this.currentTime = 0;
    this.isPlaying = false;
    await this.saveToDB();
  }

  clearLyrics() {
    this.project.lyrics.segments = [];
    this.saveToDB();
  }

  addTextOverlay() {
    if (!this.project.overlays.texts) {
      this.project.overlays.texts = [];
    }
    const newText: TextOverlayItem = {
      id: 'text-' + Math.random().toString(36).substring(2, 9),
      text: 'Sample Text Overlay',
      fontFamily: 'Inter',
      fontSize: 48,
      color: '#ffffff',
      accentColor: '#38bdf8',
      x: 0.5,
      y: 0.3,
      alignment: 'center',
      opacity: 1.0,
      rotation: 0,
      shadow: true,
      shadowColor: 'rgba(0, 0, 0, 0.9)',
      animation: 'floating',
      followBeat: true,
      beatSensitivity: 1.0,
    };
    this.project.overlays.texts.push(newText);
    this.saveToDB();
  }

  removeTextOverlay(id: string) {
    if (!this.project.overlays.texts) return;
    this.project.overlays.texts = this.project.overlays.texts.filter((t) => t.id !== id);
    this.saveToDB();
  }

  updateExportResolution(res: ProjectConfig['exportSettings']['resolution']) {
    this.project.exportSettings.resolution = res;
    const [w, h] = res.split('x').map(Number);
    this.project.exportSettings.width = w;
    this.project.exportSettings.height = h;
    this.saveToDB();
  }

  async saveToDB() {
    this.isAutosaving = true;
    try {
      const plainConfig = JSON.parse(JSON.stringify(this.project));
      await db.projects.put({
        id: this.project.id,
        title: this.project.title,
        config: plainConfig,
        updatedAt: Date.now(),
      });
      this.lastSavedTime = Date.now();
    } catch (e) {
      console.warn('Autosave to IndexedDB failed:', e);
    } finally {
      this.isAutosaving = false;
    }
  }

  async loadFromDB(): Promise<boolean> {
    try {
      const stored = await db.projects.get('default-project');
      if (stored && stored.config) {
        this.project = {
          ...structuredClone(DEFAULT_PROJECT),
          ...stored.config,
          audio: {
            ...DEFAULT_PROJECT.audio,
            ...stored.config.audio,
            tracks: stored.config.audio?.tracks || [],
          },
          background: {
            ...DEFAULT_PROJECT.background,
            ...stored.config.background,
            items: stored.config.background?.items || [],
            brightness: stored.config.background?.brightness ?? 1.0,
          },
          overlays: {
            ...DEFAULT_PROJECT.overlays,
            ...stored.config.overlays,
            spectrum: {
              ...DEFAULT_PROJECT.overlays.spectrum,
              ...stored.config.overlays?.spectrum,
            },
            images: stored.config.overlays?.images || [],
            videos: stored.config.overlays?.videos || [],
            texts: stored.config.overlays?.texts || [],
            tracklist: {
              ...DEFAULT_PROJECT.overlays.tracklist!,
              ...stored.config.overlays?.tracklist,
            },
          },
          lyrics: {
            ...DEFAULT_PROJECT.lyrics,
            ...stored.config.lyrics,
            segments: stored.config.lyrics?.segments || [],
            config: {
              ...DEFAULT_PROJECT.lyrics.config,
              ...stored.config.lyrics?.config,
            },
          },
        };

        // Rehydrate all saved Assets from IndexedDB (Audio, Backgrounds, Overlays)
        await this.rehydrateAssetsFromDB();

        this.lastSavedTime = stored.updatedAt;
        return true;
      }
    } catch (e) {
      console.warn('Failed to load project from IndexedDB:', e);
    }
    return false;
  }

  async rehydrateAssetsFromDB() {
    try {
      // 1. Rehydrate Audio Tracks & Decoded Buffers
      if (this.project.audio.tracks && this.project.audio.tracks.length > 0) {
        for (const track of this.project.audio.tracks) {
          const storedAsset = await db.assets.get(track.id);
          if (storedAsset && storedAsset.blob) {
            const url = URL.createObjectURL(storedAsset.blob);
            track.url = url;
            track.file = new File([storedAsset.blob], track.name, { type: storedAsset.blob.type });
            try {
              const arrayBuf = await storedAsset.blob.arrayBuffer();
              const tempCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
              const decodedBuffer = await tempCtx.decodeAudioData(arrayBuf);
              await tempCtx.close();
              this.trackBuffers.set(track.id, decodedBuffer);
            } catch (err) {
              console.warn('Could not decode cached audio track:', track.name, err);
            }
          }
        }
        await this.rebuildMergedAudio();
      }

      // 2. Rehydrate Background Media
      if (this.project.background.items && this.project.background.items.length > 0) {
        for (const item of this.project.background.items) {
          const storedAsset = await db.assets.get(item.id);
          if (storedAsset && storedAsset.blob) {
            item.url = URL.createObjectURL(storedAsset.blob);
            item.file = new File([storedAsset.blob], item.name, { type: storedAsset.blob.type });
          }
        }
      }

      // 3. Rehydrate Image Overlays
      if (this.project.overlays.images && this.project.overlays.images.length > 0) {
        for (const img of this.project.overlays.images) {
          const storedAsset = await db.assets.get(img.id);
          if (storedAsset && storedAsset.blob) {
            img.url = URL.createObjectURL(storedAsset.blob);
            img.file = new File([storedAsset.blob], img.name, { type: storedAsset.blob.type });
          }
        }
      }

      // 4. Rehydrate Video Overlays
      if (this.project.overlays.videos && this.project.overlays.videos.length > 0) {
        for (const vid of this.project.overlays.videos) {
          const storedAsset = await db.assets.get(vid.id);
          if (storedAsset && storedAsset.blob) {
            vid.url = URL.createObjectURL(storedAsset.blob);
            vid.file = new File([storedAsset.blob], vid.name, { type: storedAsset.blob.type });
          }
        }
      }
    } catch (err) {
      console.warn('Asset rehydration error:', err);
    }
  }

  exportProjectJSON() {
    const jsonStr = JSON.stringify(this.project, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const sanitized = (this.project.title || 'project').toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    a.download = `${sanitized}_config.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  importProjectJSON(file: File): Promise<void> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const parsed = JSON.parse(e.target?.result as string);
          if (!parsed.exportSettings || !parsed.background) {
            throw new Error('Invalid project JSON structure');
          }
          this.project = {
            ...structuredClone(DEFAULT_PROJECT),
            ...parsed,
          };
          await this.rehydrateAssetsFromDB();
          await this.saveToDB();
          resolve();
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }
}

export const projectStore = new ProjectState();
