import type { BeatMap } from '../types/project';

export class AudioAnalyzer {
  /**
   * Encodes an AudioBuffer into an optimized 16kHz mono WAV Blob suitable for Whisper API (Max 25MB).
   */
  static audioBufferToWavBlob(buffer: AudioBuffer, targetSampleRate: number = 16000): Blob {
    // 1. Convert to Mono & Downsample to 16kHz for Whisper
    const srcRate = buffer.sampleRate;
    const srcLength = buffer.length;
    const duration = buffer.duration;
    const targetLength = Math.round(duration * targetSampleRate);

    // Mix stereo/multi-channel to mono
    const monoSrc = new Float32Array(srcLength);
    const numChannels = buffer.numberOfChannels;
    for (let ch = 0; ch < numChannels; ch++) {
      const channelData = buffer.getChannelData(ch);
      for (let i = 0; i < srcLength; i++) {
        monoSrc[i] += channelData[i] / numChannels;
      }
    }

    // Downsample linearly
    const monoTarget = new Float32Array(targetLength);
    const ratio = srcLength / targetLength;
    for (let i = 0; i < targetLength; i++) {
      const srcIdx = Math.floor(i * ratio);
      monoTarget[i] = monoSrc[srcIdx] || 0;
    }

    // 2. Encode to 16-bit PCM WAV (1 channel, 16000 Hz)
    const numTargetChannels = 1;
    const bitDepth = 16;
    const bytesPerSample = bitDepth / 8;
    const blockAlign = numTargetChannels * bytesPerSample;
    const dataSize = targetLength * blockAlign;
    const headerSize = 44;
    const totalSize = headerSize + dataSize;

    const arrayBuffer = new ArrayBuffer(totalSize);
    const view = new DataView(arrayBuffer);

    function writeString(offset: number, string: string) {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    }

    // RIFF header
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); // SubChunk1Size (16 for PCM)
    view.setUint16(20, 1, true); // AudioFormat (1 = PCM)
    view.setUint16(22, numTargetChannels, true); // NumChannels (1 = Mono)
    view.setUint32(24, targetSampleRate, true); // SampleRate (16000)
    view.setUint32(28, targetSampleRate * blockAlign, true); // ByteRate
    view.setUint16(32, blockAlign, true); // BlockAlign
    view.setUint16(34, bitDepth, true); // BitsPerSample
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    let offset = 44;
    for (let i = 0; i < targetLength; i++) {
      let sample = monoTarget[i];
      sample = Math.max(-1, Math.min(1, sample));
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }

    return new Blob([arrayBuffer], { type: 'audio/wav' });
  }

  static concatenateAudioBuffers(buffers: AudioBuffer[]): AudioBuffer {
    if (buffers.length === 0) {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      return ctx.createBuffer(2, 44100, 44100);
    }
    if (buffers.length === 1) return buffers[0];

    const sampleRate = buffers[0].sampleRate;
    const numberOfChannels = Math.max(...buffers.map((b) => b.numberOfChannels));
    const totalLength = buffers.reduce((acc, b) => acc + b.length, 0);

    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const merged = ctx.createBuffer(numberOfChannels, totalLength, sampleRate);

    for (let ch = 0; ch < numberOfChannels; ch++) {
      const channelData = merged.getChannelData(ch);
      let offset = 0;
      for (const buffer of buffers) {
        const srcData = ch < buffer.numberOfChannels ? buffer.getChannelData(ch) : buffer.getChannelData(0);
        channelData.set(srcData, offset);
        offset += buffer.length;
      }
    }

    return merged;
  }

  /**
   * Computes offline FFT frequency slices and deterministic beat timestamps using Spectral Flux / Energy difference.
   */
  static async extractBeatMap(
    audioBuffer: AudioBuffer,
    sensitivity: number = 1.2,
    onProgress?: (progress: number) => void
  ): Promise<{
    beatMap: BeatMap;
    frequencyFrames: Uint8Array[];
    frameDuration: number;
  }> {
    const sampleRate = audioBuffer.sampleRate;
    const channelData = audioBuffer.getChannelData(0);
    const totalSamples = channelData.length;
    const duration = audioBuffer.duration;

    const fftSize = 1024;
    const hopSize = 512;
    const frameCount = Math.floor((totalSamples - fftSize) / hopSize);
    const frameDuration = hopSize / sampleRate;

    const spectralFlux: number[] = new Array(frameCount).fill(0);
    const frequencyFrames: Uint8Array[] = new Array(frameCount);

    const window = new Float32Array(fftSize);
    for (let i = 0; i < fftSize; i++) {
      window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (fftSize - 1)));
    }

    let prevSpectrum = new Float32Array(fftSize / 2).fill(0);

    for (let f = 0; f < frameCount; f++) {
      const offset = f * hopSize;
      const spectrum = new Float32Array(fftSize / 2);
      const uintSpectrum = new Uint8Array(fftSize / 2);

      for (let k = 0; k < fftSize / 2; k++) {
        const sampleIdx = offset + k * 2;
        if (sampleIdx < totalSamples) {
          const sampleVal = channelData[sampleIdx] * window[k * 2];
          spectrum[k] = Math.abs(sampleVal);
          uintSpectrum[k] = Math.min(255, Math.floor(spectrum[k] * 255 * 8));
        }
      }

      frequencyFrames[f] = uintSpectrum;

      let flux = 0;
      for (let k = 0; k < 32; k++) {
        const diff = spectrum[k] - prevSpectrum[k];
        if (diff > 0) flux += diff;
      }

      spectralFlux[f] = flux;
      prevSpectrum = spectrum;

      if (onProgress && f % 500 === 0) {
        onProgress(f / frameCount);
      }
    }

    const beats: number[] = [];
    const windowSize = 15;

    for (let i = windowSize; i < frameCount - windowSize; i++) {
      let sum = 0;
      for (let w = -windowSize; w <= windowSize; w++) {
        sum += spectralFlux[i + w];
      }
      const threshold = (sum / (windowSize * 2 + 1)) * sensitivity;

      if (
        spectralFlux[i] > threshold &&
        spectralFlux[i] > spectralFlux[i - 1] &&
        spectralFlux[i] > spectralFlux[i + 1] &&
        spectralFlux[i] > 0.05
      ) {
        const beatTime = i * frameDuration;
        if (beats.length === 0 || beatTime - beats[beats.length - 1] > 0.2) {
          beats.push(beatTime);
        }
      }
    }

    return {
      beatMap: {
        duration,
        sampleRate,
        beats,
        spectralFlux,
      },
      frequencyFrames,
      frameDuration,
    };
  }
}
