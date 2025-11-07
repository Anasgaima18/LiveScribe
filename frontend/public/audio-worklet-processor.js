/**
 * AudioWorklet Processor for real-time audio capture
 * Replaces deprecated ScriptProcessorNode
 */
const TARGET_SAMPLE_RATE = 16000;

class AudioCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.isCapturing = true;
    this.inputSampleRate = sampleRate; // Provided by AudioWorklet global scope
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

  process(inputs) {
    const input = inputs[0];

    if (!this.isCapturing || !input || !input[0]) {
      return true;
    }

    const inputData = input[0];

    // Downsample to 16kHz if needed for Sarvam API
    const downsampled = this._downsample(inputData, this.inputSampleRate, TARGET_SAMPLE_RATE);

    // Convert Float32 samples [-1,1] to Int16 PCM
    const pcm16 = new Int16Array(downsampled.length);
    for (let i = 0; i < downsampled.length; i++) {
      const s = Math.max(-1, Math.min(1, downsampled[i]));
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }

    this.port.postMessage(
      { type: 'audiodata', data: pcm16.buffer },
      [pcm16.buffer]
    );

    return true; // Keep processor alive
  }
}

registerProcessor('audio-capture-processor', AudioCaptureProcessor);
