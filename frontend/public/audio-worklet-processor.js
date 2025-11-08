/**
 * AudioWorklet Processor for real-time audio capture
 * Implements consistent chunking with CHUNK_SAMPLES = 3200 (~200ms @ 16kHz)
 */
const TARGET_SAMPLE_RATE = 16000;
const CHUNK_SAMPLES = 3200; // ~200ms @ 16kHz

class AudioCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.isCapturing = true;
    this.inputSampleRate = sampleRate; // Provided by AudioWorklet global scope
    this._buffer = new Float32Array(CHUNK_SAMPLES * 2); // Double buffer for safety
    this._bufferIndex = 0;
    this._diagCounter = 0;
  }

  /**
   * Downsample Float32 audio buffer to target sample rate using averaging
   */
  _downsample(buffer, inputRate, targetRate) {
    if (!buffer || inputRate === targetRate) {
      return buffer;
    }

    const sampleRateRatio = inputRate / targetRate;
    const newLength = Math.round(buffer.length / sampleRateRatio);
    const downsampled = new Float32Array(newLength);

    let offsetResult = 0;
    let offsetBuffer = 0;

    while (offsetResult < newLength) {
      const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
      let accum = 0;
      let count = 0;
      for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
        accum += buffer[i];
        count++;
      }
      downsampled[offsetResult] = count > 0 ? accum / count : 0;
      offsetResult++;
      offsetBuffer = nextOffsetBuffer;
    }

    return downsampled;
  }

  /**
   * Compute RMS and peak from Float32 buffer
   */
  _computeMetrics(buffer, length) {
    let sumSq = 0;
    let peak = 0;
    for (let i = 0; i < length; i++) {
      const v = buffer[i];
      sumSq += v * v;
      const av = Math.abs(v);
      if (av > peak) peak = av;
    }
    const rmsFloat = Math.sqrt(sumSq / length);
    return { rmsFloat, peak };
  }

  process(inputs) {
    const input = inputs[0];

    if (!this.isCapturing || !input || !input[0]) {
      return true;
    }

    const inputData = input[0];

    // Downsample to 16kHz if needed
    const downsampled = this._downsample(inputData, this.inputSampleRate, TARGET_SAMPLE_RATE);

    // Accumulate into buffer
    for (let i = 0; i < downsampled.length; i++) {
      this._buffer[this._bufferIndex++] = downsampled[i];

      // Flush when we reach CHUNK_SAMPLES
      if (this._bufferIndex >= CHUNK_SAMPLES) {
        // Compute metrics for Float32 buffer
        const { rmsFloat, peak } = this._computeMetrics(this._buffer, CHUNK_SAMPLES);

        // Convert to Int16 PCM (little-endian)
        const pcm16 = new Int16Array(CHUNK_SAMPLES);
        for (let j = 0; j < CHUNK_SAMPLES; j++) {
          const s = Math.max(-1, Math.min(1, this._buffer[j]));
          pcm16[j] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }

        // Send audio data
        this.port.postMessage(
          { type: 'audiodata', data: pcm16.buffer, rmsFloat, peak, samples: CHUNK_SAMPLES, sr: TARGET_SAMPLE_RATE },
          [pcm16.buffer]
        );

        // Send diagnostics every 10 chunks
        if ((this._diagCounter++ % 10) === 0) {
          this.port.postMessage({ type: 'diag', rmsFloat, peak, sr: this.inputSampleRate });
        }

        // Reset buffer
        this._bufferIndex = 0;
      }
    }

    return true; // Keep processor alive
  }
}

registerProcessor('audio-capture-processor', AudioCaptureProcessor);
