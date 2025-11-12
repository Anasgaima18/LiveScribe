/**
 * Audio Quality Analyzer for Production-Grade STT
 * Implements industry-standard audio analysis and preprocessing
 */

import logger from '../../config/logger.js';
import { AUDIO_SPECS, VAD_CONFIG, NORMALIZATION_CONFIG } from './sarvamConfig.js';

/**
 * Comprehensive audio quality analysis
 */
export class AudioQualityAnalyzer {
  constructor(options = {}) {
    this.vadConfig = { ...VAD_CONFIG, ...options.vad };
    this.normConfig = { ...NORMALIZATION_CONFIG, ...options.normalization };
  }

  /**
   * Analyze audio buffer and return comprehensive metrics
   * @param {Buffer} pcm16Buffer - PCM16 audio buffer
   * @param {number} sampleRate - Sample rate (default: 16000)
   * @returns {Object} Quality metrics
   */
  analyze(pcm16Buffer, sampleRate = 16000) {
    if (!Buffer.isBuffer(pcm16Buffer) || pcm16Buffer.length === 0) {
      throw new Error('Invalid PCM buffer');
    }

    const samples = new Int16Array(
      pcm16Buffer.buffer,
      pcm16Buffer.byteOffset,
      pcm16Buffer.length / 2
    );

    // Basic statistics
    let sum = 0, sumSquares = 0, peak = 0, nonZero = 0;
    let min = 32767, max = -32768;
    
    for (let i = 0; i < samples.length; i++) {
      const val = samples[i];
      const abs = Math.abs(val);
      
      sum += abs;
      sumSquares += abs * abs;
      if (abs > peak) peak = abs;
      if (abs > this.normConfig.NOISE_FLOOR) nonZero++;
      if (val < min) min = val;
      if (val > max) max = val;
    }

    // RMS and dB calculations
    const rms = Math.sqrt(sumSquares / samples.length);
    const rmsDb = 20 * Math.log10(Math.max(1, rms) / 32768);
    const peakDb = 20 * Math.log10(Math.max(1, peak) / 32768);
    const avgAmplitude = sum / samples.length;
    
    // Signal metrics
    const nonZeroRatio = nonZero / samples.length;
    const dynamicRange = max - min;
    const crestFactor = peak / Math.max(1, rms);
    
    // Duration
    const durationMs = (samples.length / sampleRate) * 1000;
    
    // Quality classification
    const quality = this._classifyQuality(rms, rmsDb, peak, nonZeroRatio, crestFactor);
    
    // Voice activity detection
    const isSpeech = this._detectSpeech(rms, rmsDb, nonZeroRatio);
    const isSilence = this._detectSilence(rms, rmsDb, nonZeroRatio);
    
    return {
      // Basic stats
      samples: samples.length,
      durationMs,
      sampleRate,
      
      // Amplitude metrics
      rms: Math.round(rms),
      rmsDb: parseFloat(rmsDb.toFixed(1)),
      peak,
      peakDb: parseFloat(peakDb.toFixed(1)),
      avgAmplitude: Math.round(avgAmplitude),
      
      // Signal characteristics
      min,
      max,
      dynamicRange,
      crestFactor: parseFloat(crestFactor.toFixed(2)),
      nonZeroSamples: nonZero,
      nonZeroRatio: parseFloat(nonZeroRatio.toFixed(4)),
      
      // Quality assessment
      quality,
      isSpeech,
      isSilence,
      isClipping: peak >= this.normConfig.CLIPPING_THRESHOLD * 0.99,
      isQuiet: rms < this.vadConfig.RMS_THRESHOLD,
      requiresNormalization: rms < this.normConfig.MIN_RMS_FOR_NORM,
      
      // Recommendations
      recommendedGain: this._calculateRecommendedGain(rms),
      estimatedSNR: this._estimateSNR(samples, rms),
    };
  }

  /**
   * Detect if buffer contains speech
   */
  _detectSpeech(rms, rmsDb, nonZeroRatio) {
    return (
      rms >= this.vadConfig.RMS_THRESHOLD &&
      rmsDb >= this.vadConfig.SPEECH_THRESHOLD_DB &&
      nonZeroRatio >= 0.95
    );
  }

  /**
   * Detect if buffer is silence
   */
  _detectSilence(rms, rmsDb, nonZeroRatio) {
    return (
      rms < this.vadConfig.ENERGY_FLOOR ||
      rmsDb < this.vadConfig.SILENCE_THRESHOLD_DB ||
      nonZeroRatio < 0.9
    );
  }

  /**
   * Classify audio quality
   */
  _classifyQuality(rms, rmsDb, peak, nonZeroRatio, crestFactor) {
    if (rms < this.vadConfig.ENERGY_FLOOR) return 'silence';
    if (rms < this.vadConfig.RMS_THRESHOLD) return 'very_quiet';
    if (rmsDb < -30) return 'quiet';
    if (rmsDb < -20) return 'fair';
    if (rmsDb < -10) return 'good';
    if (rmsDb < -3) return 'excellent';
    if (peak >= this.normConfig.CLIPPING_THRESHOLD * 0.99) return 'clipping';
    return 'optimal';
  }

  /**
   * Calculate recommended gain factor
   */
  _calculateRecommendedGain(currentRms) {
    if (currentRms < this.normConfig.MIN_RMS_FOR_NORM) {
      const targetRms = this.normConfig.TARGET_RMS;
      const gain = targetRms / Math.max(1, currentRms);
      return Math.min(gain, this.normConfig.MAX_AMPLIFICATION);
    }
    return 1.0;
  }

  /**
   * Estimate Signal-to-Noise Ratio
   */
  _estimateSNR(samples, rms) {
    // Simple noise floor estimation (bottom 10% of amplitudes)
    const sorted = Array.from(samples).map(Math.abs).sort((a, b) => a - b);
    const noiseFloorIdx = Math.floor(sorted.length * 0.1);
    const noiseFloor = sorted[noiseFloorIdx] || 1;
    
    const snr = 20 * Math.log10(Math.max(1, rms) / Math.max(1, noiseFloor));
    return parseFloat(snr.toFixed(1));
  }

  /**
   * Normalize audio to target level with multi-pass approach
   * @param {Buffer} pcm16Buffer - Input PCM buffer
   * @param {Object} metrics - Audio metrics from analyze()
   * @returns {Buffer} Normalized PCM buffer
   */
  normalize(pcm16Buffer, metrics) {
    if (!metrics.requiresNormalization) {
      return pcm16Buffer;
    }

    const samples = new Int16Array(
      pcm16Buffer.buffer,
      pcm16Buffer.byteOffset,
      pcm16Buffer.length / 2
    );

    // First pass: primary normalization
    const normalizedSamples = new Int16Array(samples.length);
    const gain = metrics.recommendedGain;
    
    for (let i = 0; i < samples.length; i++) {
      const amplified = samples[i] * gain;
      normalizedSamples[i] = this._clamp(amplified);
    }

    // Check if second pass is needed
    const firstPassMetrics = this.analyze(Buffer.from(normalizedSamples.buffer));
    
    if (firstPassMetrics.rms < this.normConfig.MIN_RMS_FOR_NORM) {
      // Second pass: gentle boost
      const secondPassGain = Math.min(
        this.normConfig.SECOND_PASS_FACTOR,
        this.normConfig.MIN_RMS_FOR_NORM / Math.max(1, firstPassMetrics.rms)
      );
      
      for (let i = 0; i < normalizedSamples.length; i++) {
        const amplified = normalizedSamples[i] * secondPassGain;
        normalizedSamples[i] = this._clamp(amplified);
      }
    }

    return Buffer.from(normalizedSamples.buffer);
  }

  /**
   * Clamp value to Int16 range with soft clipping
   */
  _clamp(value) {
    const threshold = this.normConfig.CLIPPING_THRESHOLD;
    if (value > threshold) return threshold;
    if (value < -threshold) return -threshold;
    return Math.round(value);
  }

  /**
   * Apply noise gate to remove low-level noise
   * @param {Buffer} pcm16Buffer - Input PCM buffer
   * @param {number} threshold - RMS threshold
   * @returns {Buffer} Gated PCM buffer
   */
  applyNoiseGate(pcm16Buffer, threshold = null) {
    threshold = threshold || this.vadConfig.ENERGY_FLOOR;
    
    const samples = new Int16Array(
      pcm16Buffer.buffer,
      pcm16Buffer.byteOffset,
      pcm16Buffer.length / 2
    );

    const gatedSamples = new Int16Array(samples.length);
    
    for (let i = 0; i < samples.length; i++) {
      const abs = Math.abs(samples[i]);
      gatedSamples[i] = abs >= threshold ? samples[i] : 0;
    }

    return Buffer.from(gatedSamples.buffer);
  }

  /**
   * Detect voice activity in audio stream
   * @param {Buffer} pcm16Buffer - Input PCM buffer
   * @returns {Object} VAD result
   */
  detectVoiceActivity(pcm16Buffer) {
    const metrics = this.analyze(pcm16Buffer);
    
    return {
      isSpeech: metrics.isSpeech,
      isSilence: metrics.isSilence,
      confidence: this._calculateVADConfidence(metrics),
      energy: metrics.rms,
      energyDb: metrics.rmsDb,
      quality: metrics.quality,
    };
  }

  /**
   * Calculate VAD confidence score (0-1)
   */
  _calculateVADConfidence(metrics) {
    if (metrics.isSilence) return 0.0;
    if (!metrics.isSpeech) return 0.3;
    
    // Score based on multiple factors
    let score = 0.5;
    
    // RMS contribution
    if (metrics.rms >= this.vadConfig.RMS_THRESHOLD * 2) score += 0.2;
    else if (metrics.rms >= this.vadConfig.RMS_THRESHOLD) score += 0.1;
    
    // dB contribution
    if (metrics.rmsDb >= -20) score += 0.15;
    else if (metrics.rmsDb >= -30) score += 0.1;
    
    // Non-zero ratio contribution
    if (metrics.nonZeroRatio >= 0.98) score += 0.15;
    else if (metrics.nonZeroRatio >= 0.95) score += 0.1;
    
    return Math.min(1.0, score);
  }
}

/**
 * Format quality metrics for logging
 */
export function formatQualityMetrics(metrics, batchId = '') {
  const prefix = batchId ? `[${batchId}] ` : '';
  
  return {
    basic: `${prefix}Audio quality - RMS: ${metrics.rms} (${metrics.rmsDb} dB), Peak: ${metrics.peak}, Quality: ${metrics.quality}`,
    detailed: `${prefix}Audio detail - Duration: ${metrics.durationMs.toFixed(0)}ms, Samples: ${metrics.samples}, NonZero: ${(metrics.nonZeroRatio * 100).toFixed(1)}%, SNR: ${metrics.estimatedSNR} dB, Crest: ${metrics.crestFactor}`,
    recommendation: metrics.requiresNormalization
      ? `${prefix}Normalization recommended: ${metrics.recommendedGain.toFixed(2)}x gain`
      : `${prefix}Audio quality sufficient, no normalization needed`,
  };
}

export default AudioQualityAnalyzer;
