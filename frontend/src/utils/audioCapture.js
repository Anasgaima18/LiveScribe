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
    this.isCapturing = false;
    this.onDataCallback = null;
    this.onErrorCallback = null;
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
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      // Create audio context at 16kHz
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 16000,
      });

      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);

      // Try to use modern AudioWorklet, fallback to ScriptProcessorNode
      try {
        await this.audioContext.audioWorklet.addModule('/audio-worklet-processor.js');
        
        this.processorNode = new AudioWorkletNode(this.audioContext, 'audio-capture-processor', {
          numberOfInputs: 1,
          numberOfOutputs: 0,
          channelCount: 1,
        });

        this.processorNode.port.onmessage = (event) => {
          if (event.data.type === 'audiodata' && this.isCapturing) {
            const pcm16 = new Int16Array(event.data.data);
            const base64 = this._arrayBufferToBase64(pcm16.buffer);
            this.onDataCallback(base64);
          }
        };
        
        console.log('Audio capture started: 16kHz mono PCM16 (AudioWorklet)');
      } catch (workletError) {
        // Fallback to ScriptProcessorNode for older browsers
        console.warn('AudioWorklet not supported, using ScriptProcessorNode');
        const bufferSize = 4096;
        this.processorNode = this.audioContext.createScriptProcessor(bufferSize, 1, 1);

        this.processorNode.onaudioprocess = (e) => {
          if (!this.isCapturing) return;

          const inputDataRaw = e.inputBuffer.getChannelData(0);
          const inputData = this.downsampleTo16k(inputDataRaw, this.audioContext.sampleRate);
          
          // Convert Float32 [-1, 1] to Int16 PCM16
          const pcm16 = new Int16Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            const s = Math.max(-1, Math.min(1, inputData[i]));
            pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
          }

          // Convert to base64
          const base64 = this._arrayBufferToBase64(pcm16.buffer);
          this.onDataCallback(base64);
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
      if (this.processorNode.connect) {
        this.processorNode.connect(this.audioContext.destination);
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
