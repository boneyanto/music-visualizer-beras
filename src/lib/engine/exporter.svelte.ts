import { projectStore } from '../stores/project.svelte';

export class VideoExporter {
  private worker: Worker | null = null;
  private timerInterval: any = null;
  public isExporting = $state<boolean>(false);
  public progress = $state<number>(0);
  public currentFrame = $state<number>(0);
  public totalFrames = $state<number>(0);
  public currentFPS = $state<number>(0);
  public speedMultiplier = $state<number>(1.0);
  public etaSeconds = $state<number>(0);
  public elapsedSeconds = $state<number>(0);
  public finalRenderTimeSeconds = $state<number>(0);
  public errorMessage = $state<string | null>(null);

  startExport(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      this.isExporting = true;
      this.progress = 0;
      this.currentFrame = 0;
      this.totalFrames = 0;
      this.currentFPS = 0;
      this.speedMultiplier = 1.0;
      this.etaSeconds = 0;
      this.elapsedSeconds = 0;
      this.finalRenderTimeSeconds = 0;
      this.errorMessage = null;

      const startTime = performance.now();
      if (this.timerInterval) clearInterval(this.timerInterval);
      this.timerInterval = setInterval(() => {
        if (this.isExporting) {
          this.elapsedSeconds = Math.floor((performance.now() - startTime) / 1000);
        }
      }, 500);

      // Instantiate Web Worker with Vite URL resolution
      this.worker = new Worker(
        new URL('../workers/render.worker.ts', import.meta.url),
        { type: 'module' }
      );

      this.worker.onmessage = (e: MessageEvent) => {
        const data = e.data;

        if (data.type === 'PROGRESS') {
          this.progress = data.progress;
          this.currentFrame = data.frame;
          this.totalFrames = data.totalFrames;
          this.currentFPS = data.currentFPS || 0;
          this.speedMultiplier = data.speedMultiplier || 1.0;
          this.etaSeconds = data.etaSeconds || 0;
        } else if (data.type === 'COMPLETE') {
          this.isExporting = false;
          this.progress = 1.0;
          this.finalRenderTimeSeconds = Math.floor((performance.now() - startTime) / 1000);
          this.cleanup();

          const blob = new Blob([data.buffer], { type: 'video/mp4' });
          resolve(blob);
        } else if (data.type === 'ERROR') {
          this.isExporting = false;
          this.errorMessage = data.message;
          this.cleanup();
          reject(new Error(data.message));
        } else if (data.type === 'CANCELLED') {
          this.isExporting = false;
          this.cleanup();
          reject(new Error('Export was cancelled'));
        }
      };

      this.worker.onerror = (err) => {
        this.isExporting = false;
        this.errorMessage = err.message;
        this.cleanup();
        reject(err);
      };

      // Extract Raw Audio Channels from AudioBuffer if available
      let audioRawData: Float32Array[] | undefined = undefined;
      if (projectStore.audioBuffer) {
        const numChannels = projectStore.audioBuffer.numberOfChannels;
        audioRawData = [];
        for (let ch = 0; ch < numChannels; ch++) {
          audioRawData.push(new Float32Array(projectStore.audioBuffer.getChannelData(ch)));
        }
      }

      // Send payload to worker
      this.worker.postMessage({
        type: 'START_RENDER',
        project: $state.snapshot(projectStore.project),
        frequencyFrames: $state.snapshot(projectStore.frequencyFrames),
        beats: $state.snapshot(projectStore.beats),
        frameDuration: projectStore.frameDuration,
        audioRawData,
        sampleRate: projectStore.audioBuffer?.sampleRate || 44100,
      });
    });
  }

  cancelExport() {
    if (this.worker) {
      this.worker.postMessage({ type: 'CANCEL' });
      this.cleanup();
    }
    this.isExporting = false;
  }

  private cleanup() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }

  downloadBlob(blob: Blob, filename: string = 'visualizer.mp4') {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}

export const videoExporter = new VideoExporter();
