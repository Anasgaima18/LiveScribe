import React, { useEffect, useRef, useState } from 'react';

/**
 * AudioCapture - Captures audio from microphone and streams PCM16 chunks
 * Compatible with Sarvam AI realtime transcription requirements:
 * - 16kHz mono PCM16
 * - Base64 encoded chunks
 * - ~200ms per chunk
 */
export class AudioCapture {
  constructor() {
    this.audioContext = null;
    this.mediaStream = null;
    this.sourceNode = null;
    this.processorNode = null;
    this.gainNode = null; // For ScriptProcessor feedback prevention
    this.isCapturing = false;
    this.onDataCallback = null;
    this.onErrorCallback = null;
    this.debugBoost = (import.meta.env.VITE_AUDIO_DEBUG_BOOST === 'true'); // Optional boost flag
    this.debugCapture = (import.meta.env.VITE_DEBUG_AUDIO_CAPTURE === 'true');
  }
  // Downsample a Float32Array from sourceSampleRate to 16000 Hz
  downsampleTo16k(inputFloat32, sourceSampleRate) {
    const targetRate = 16000;
    if (sourceSampleRate === targetRate) return inputFloat32;
    const sampleRateRatio = sourceSampleRate / targetRate;
    const newLength = Math.round(inputFloat32.length / sampleRateRatio);
    const result = new Float32Array(newLength);
    let offsetResult = 0;
    let offsetSource = 0;
    while (offsetResult < result.length) {
      const nextOffsetSource = Math.round((offsetResult + 1) * sampleRateRatio);
      // Simple average to reduce aliasing
      let accum = 0, count = 0;
      for (let i = Math.floor(offsetSource); i < Math.floor(nextOffsetSource) && i < inputFloat32.length; i++) {
        accum += inputFloat32[i];
        count++;
      }
      result[offsetResult] = count > 0 ? accum / count : 0;
      offsetResult++;
      offsetSource = nextOffsetSource;
    }
    return result;
  }


  /**
   * Start capturing audio
   * @param {Function} onData - Callback(base64Chunk) when audio chunk ready
   * @param {Function} onError - Callback(error) on errors
   */
  async start(onData, onError) {
    try {
      this.onDataCallback = onData;
      this.onErrorCallback = onError;

      // Request microphone access
      // Disable echoCancellation / noiseSuppression / autoGainControl for raw STT capture
      // These browser features (AGC/EC/NS) can drastically alter amplitude and hurt STT.
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });

      // Create audio context at 16kHz
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 16000,
      });

  this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);

  // Log the actual AudioContext sample rate (browsers may ignore requested sampleRate)
  console.log('AudioContext sampleRate:', this.audioContext.sampleRate);

      // Try to use modern AudioWorklet, fallback to ScriptProcessorNode
      try {
        await this.audioContext.audioWorklet.addModule('/audio-worklet-processor.js');
        
        this.processorNode = new AudioWorkletNode(this.audioContext, 'audio-capture-processor', {
          numberOfInputs: 1,
          numberOfOutputs: 0,
          channelCount: 1,
        });

        this.processorNode.port.onmessage = (event) => {
          if (!this.isCapturing) return;
          if (event.data.type === 'audiodata') {
            const pcm16 = new Int16Array(event.data.data);
            
            // Compute rmsInt16 from PCM16 data
            let sumSq = 0;
            for (let i = 0; i < pcm16.length; i++) {
              const v = pcm16[i];
              sumSq += v * v;
            }
            const rmsInt16 = Math.sqrt(sumSq / pcm16.length);
            
            // Compute durationMs
            const { samples, sr, rmsFloat, peak } = event.data;
            const durationMs = (samples / sr) * 1000;
            
            // Optional debug boost (only if RMS is very low and flag is enabled)
            let boostedPcm16 = pcm16;
            if (this.debugBoost && rmsInt16 < 100) {
              const boostFactor = 1.5;
              boostedPcm16 = new Int16Array(pcm16.length);
              for (let i = 0; i < pcm16.length; i++) {
                const boosted = Math.max(-32768, Math.min(32767, pcm16[i] * boostFactor));
                boostedPcm16[i] = boosted;
              }
            }
            
            const base64 = this._arrayBufferToBase64(boostedPcm16.buffer);
            
            // Log debug info
            if (this.debugCapture) {
              console.log(`[AudioCapture] SR=${sr}, RMS_Int16=${rmsInt16.toFixed(0)}, Duration=${durationMs.toFixed(1)}ms, Samples=${samples}`);
            }
            
            // Send data with metadata
            this.onDataCallback(base64, { rmsFloat, rmsInt16, samples, sr, durationMs });
          } else if (event.data.type === 'diag') {
            const { rmsFloat, peak, sr } = event.data;
            if (rmsFloat < 0.01 && this.debugCapture) {
              console.warn(`(Worklet) Audio RMS very low (${rmsFloat.toFixed(5)}), peak=${peak.toFixed(5)}, input SR=${sr}`);
            }
          }
        };
        
        console.log('Audio capture started: 16kHz mono PCM16 (AudioWorklet)');
      } catch (workletError) {
        // Fallback to ScriptProcessorNode for older browsers
        console.warn('AudioWorklet not supported, using ScriptProcessorNode');
        const bufferSize = 4096;
        this.processorNode = this.audioContext.createScriptProcessor(bufferSize, 1, 1);
        
        // Create silent GainNode to prevent feedback
        this.gainNode = this.audioContext.createGain();
        this.gainNode.gain.value = 0;

        this.processorNode.onaudioprocess = (e) => {
          if (!this.isCapturing) return;

          const inputDataRaw = e.inputBuffer.getChannelData(0);

          // Compute simple RMS and peak for diagnostics
          let sumSq = 0;
          let peak = 0;
          for (let i = 0; i < inputDataRaw.length; i++) {
            const v = inputDataRaw[i];
            sumSq += v * v;
            if (Math.abs(v) > peak) peak = Math.abs(v);
          }
          const rmsFloat = Math.sqrt(sumSq / inputDataRaw.length);
          
          // Log very low RMS values to help debug capture issues
          if (rmsFloat < 0.01 && this.debugCapture) {
            console.warn(`Audio RMS very low (${rmsFloat.toFixed(5)}), peak=${peak.toFixed(5)} - check mic, AGC/EC or capture source`);
          }

          const inputData = this.downsampleTo16k(inputDataRaw, this.audioContext.sampleRate);
          
          // Convert Float32 [-1, 1] to Int16 PCM16
          const pcm16 = new Int16Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            const s = Math.max(-1, Math.min(1, inputData[i]));
            pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
          }
          
          // Compute rmsInt16
          let sumSqInt = 0;
          for (let i = 0; i < pcm16.length; i++) {
            const v = pcm16[i];
            sumSqInt += v * v;
          }
          const rmsInt16 = Math.sqrt(sumSqInt / pcm16.length);
          
          const samples = pcm16.length;
          const sr = 16000; // After downsampling
          const durationMs = (samples / sr) * 1000;
          
          // Optional debug boost
          let boostedPcm16 = pcm16;
          if (this.debugBoost && rmsInt16 < 100) {
            const boostFactor = 1.5;
            boostedPcm16 = new Int16Array(pcm16.length);
            for (let i = 0; i < pcm16.length; i++) {
              const boosted = Math.max(-32768, Math.min(32767, pcm16[i] * boostFactor));
              boostedPcm16[i] = boosted;
            }
          }
          
          if (this.debugCapture) {
            console.log(`[AudioCapture] SR=${sr}, RMS_Int16=${rmsInt16.toFixed(0)}, Duration=${durationMs.toFixed(1)}ms, Samples=${samples}`);
          }

          // Convert to base64
          const base64 = this._arrayBufferToBase64(boostedPcm16.buffer);
          this.onDataCallback(base64, { rmsFloat, rmsInt16, samples, sr, durationMs });
        };
        
        console.log('Audio capture started: 16kHz mono PCM16 (ScriptProcessorNode)');
      }

      // Helper function for base64 conversion
      this._arrayBufferToBase64 = (arrayBuffer) => {
        const bytes = new Uint8Array(arrayBuffer);
        let binary = '';
        const chunkSize = 0x8000;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          const chunk = bytes.subarray(i, i + chunkSize);
          binary += String.fromCharCode.apply(null, chunk);
        }
        return btoa(binary);
      };

      this.sourceNode.connect(this.processorNode);
      
      // Connect through silent GainNode for ScriptProcessorNode to prevent feedback
      if (this.processorNode.onaudioprocess) {
        // ScriptProcessorNode - connect through silent gain
        this.processorNode.connect(this.gainNode);
        this.gainNode.connect(this.audioContext.destination);
      }

      this.isCapturing = true;
    } catch (error) {
      console.error('Failed to start audio capture:', error);
      if (this.onErrorCallback) {
        this.onErrorCallback(error);
      }
      throw error;
    }
  }

  /**
   * Stop capturing audio and release resources
   */
  stop() {
    this.isCapturing = false;

    if (this.gainNode) {
      this.gainNode.disconnect();
      this.gainNode = null;
    }

    if (this.processorNode) {
      this.processorNode.disconnect();
      this.processorNode = null;
    }

    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    console.log('Audio capture stopped');
  }

  /**
   * Check if currently capturing
   */
  get active() {
    return this.isCapturing;
  }
}

/**
 * React hook for audio capture
 */
export const useAudioCapture = () => {
  const captureRef = useRef(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Initialize capture instance
    if (!captureRef.current) {
      captureRef.current = new AudioCapture();
    }

    // Cleanup on unmount
    return () => {
      if (captureRef.current?.active) {
        captureRef.current.stop();
      }
    };
  }, []);

  const startCapture = async (onData) => {
    try {
      setError(null);
      await captureRef.current.start(
        onData,
        (err) => setError(err.message)
      );
      setIsCapturing(true);
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const stopCapture = () => {
    captureRef.current?.stop();
    setIsCapturing(false);
  };

  return {
    startCapture,
    stopCapture,
    isCapturing,
    error,
  };
};

export default AudioCapture;
