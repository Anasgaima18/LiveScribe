/**
 * AudioWorklet Processor for real-time audio capture
 * Replaces deprecated ScriptProcessorNode
 */
class AudioCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.isCapturing = true;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    
    if (!this.isCapturing || !input || !input[0]) {
      return true;
    }

    // Get mono channel data
    const inputData = input[0];
    
    // Convert Float32Array to Int16 PCM16
    const pcm16 = new Int16Array(inputData.length);
    for (let i = 0; i < inputData.length; i++) {
      const s = Math.max(-1, Math.min(1, inputData[i]));
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }

    // Send data to main thread
    this.port.postMessage({
      type: 'audiodata',
      data: pcm16.buffer
    }, [pcm16.buffer]);

    return true; // Keep processor alive
  }
}

registerProcessor('audio-capture-processor', AudioCaptureProcessor);
