/**
 * Sarvam AI Speech-to-Text Client
 * Node.js implementation using Sarvam REST APIs
 * Get your Sarvam AI API subscription key here: https://dashboard.sarvam.ai/admin
 */

import axios from 'axios';
import FormData from 'form-data';
import { Readable } from 'stream';
import EventEmitter from 'events';
import logger from '../../config/logger.js';

const SARVAM_BASE_URL = 'https://api.sarvam.ai';

/**
 * Sarvam AI HTTP Client for Speech-to-Text
 * Supports batch transcription via file upload
 */
export class SarvamSTTClient {
  constructor(apiKey, options = {}) {
    if (!apiKey) {
      throw new Error('Sarvam API key is required. Get yours at: https://dashboard.sarvam.ai/admin');
    }
    
    this.apiKey = apiKey;
    this.baseURL = options.baseURL || SARVAM_BASE_URL;
    this.language = options.language || 'en-IN'; // Default to English
    this.model = options.model || 'saarika:v2.5';
    this.withTimestamps = options.withTimestamps !== false;
    
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'api-subscription-key': this.apiKey,
      },
      timeout: 60000, // 60s for audio processing
    });
  }

  /**
   * Transcribe audio buffer to text
   * @param {Buffer} audioBuffer - Audio file buffer (WAV/MP3, 16kHz recommended)
   * @param {Object} options - Override language, model, timestamps
   * @returns {Promise<Object>} { transcript, language, timestamp }
   */
  async transcribe(audioBuffer, options = {}) {
    try {
      const form = new FormData();
      
      // Create readable stream from buffer
      const audioStream = Readable.from(audioBuffer);
      form.append('file', audioStream, {
        filename: 'audio.wav',
        contentType: 'audio/wav',
      });

      // Language code (hi-IN, en-IN, etc.) and model per Sarvam API (multipart fields)
      const languageCode = options.language || this.language;
      form.append('language_code', languageCode);
      form.append('model', options.model || this.model);
      if (options.inputAudioCodec) {
        form.append('input_audio_codec', options.inputAudioCodec);
      }
      // Some servers expect this as a field; keep backwards compat via headers only
      form.append('with_timestamps', String(options.withTimestamps !== undefined ? options.withTimestamps : this.withTimestamps));

      const response = await this.client.post('/speech-to-text', form, {
        headers: {
          ...form.getHeaders(),
        },
      });

      return {
        transcript: response.data.transcript || '',
        language: languageCode,
        timestamp: Date.now(),
        duration: response.data.duration_in_seconds,
      };
    } catch (error) {
      throw this._handleError(error, 'transcribe');
    }
  }

  /**
   * Transcribe and translate to English (auto-detect language)
   * @param {Buffer} audioBuffer - Audio file buffer
   * @returns {Promise<Object>} { transcript (in English), detectedLanguage, timestamp }
   */
  async transcribeAndTranslate(audioBuffer, options = {}) {
    try {
      const form = new FormData();
      const audioStream = Readable.from(audioBuffer);
      form.append('file', audioStream, {
        filename: 'audio.wav',
        contentType: 'audio/wav',
      });

      const response = await this.client.post('/speech-to-text-translate', form, {
        headers: {
          ...form.getHeaders(),
        },
        params: {
          model: options.model || 'saaras:v2.5',
        },
      });

      return {
        transcript: response.data.transcript || '',
        detectedLanguage: response.data.language || 'unknown',
        timestamp: Date.now(),
      };
    } catch (error) {
      throw this._handleError(error, 'transcribeAndTranslate');
    }
  }

  /**
   * Translate text between languages
   * @param {String} text - Text to translate
   * @param {String} sourceLanguage - Source language code (e.g., 'en-IN')
   * @param {String} targetLanguage - Target language code (e.g., 'hi-IN')
   * @returns {Promise<String>} Translated text
   */
  async translateText(text, sourceLanguage, targetLanguage, options = {}) {
    try {
      const response = await this.client.post('/translate', {
        input: text,
        source_language_code: sourceLanguage,
        target_language_code: targetLanguage,
        speaker_gender: options.gender || 'Female',
        mode: options.mode || 'formal',
        model: options.model || 'mayura:v1',
        enable_preprocessing: options.enablePreprocessing || false,
      });

      return response.data.translated_text || response.data.output || '';
    } catch (error) {
      throw this._handleError(error, 'translateText');
    }
  }

  /**
   * Convert text to speech
   * @param {String} text - Text to convert
   * @param {String} targetLanguage - Language code
   * @param {Object} options - Voice options (speaker, pitch, pace, etc.)
   * @returns {Promise<Buffer>} Audio buffer
   */
  async textToSpeech(text, targetLanguage, options = {}) {
    try {
      const response = await this.client.post('/text-to-speech', {
        inputs: [text],
        target_language_code: targetLanguage,
        speaker: options.speaker || 'anushka',
        pitch: options.pitch || 0,
        pace: options.pace || 1.0,
        loudness: options.loudness || 1.0,
        speech_sample_rate: options.sampleRate || 16000,
        enable_preprocessing: options.enablePreprocessing || false,
        model: options.model || 'bulbul:v2',
      }, {
        responseType: 'arraybuffer',
      });

      return Buffer.from(response.data);
    } catch (error) {
      throw this._handleError(error, 'textToSpeech');
    }
  }

  /**
   * Handle API errors with detailed messages
   */
  _handleError(error, method) {
    if (error.response) {
      const status = error.response.status;
      const message = error.response.data?.message || error.response.data?.error || error.message;
      
      return new Error(`Sarvam AI ${method} failed (${status}): ${message}`);
    } else if (error.request) {
      return new Error(`Sarvam AI ${method} - No response from server. Check network or API endpoint.`);
    } else {
      return new Error(`Sarvam AI ${method} - ${error.message}`);
    }
  }
}

/**
 * Realtime streaming transcription handler
 * Accumulates audio chunks and periodically sends to Sarvam STT
 */
export class SarvamRealtimeClient extends EventEmitter {
  constructor(apiKey, options = {}) {
    super();
    this.sttClient = new SarvamSTTClient(apiKey, options);
    this.audioChunks = [];
    this.chunkSize = options.chunkSize || 4096 * 10; // buffering unit
    this.currentSize = 0;
    this.language = options.language || 'en-IN'; // Default to English
    this.isActive = false;
    // Basic VAD / filtering configuration
    this.minRms = options.minRms || 120; // Int16 RMS below this treated as silence
    this.maxSilenceChunks = options.maxSilenceChunks || 12; // consecutive silent chunks before hard flush/reset
    this.silenceCount = 0;
    this.lastTranscript = '';
    this.lastTranscriptTime = 0;
    this.duplicateWindowMs = options.duplicateWindowMs || 4000; // suppress duplicates within 4s
    this.genericFillers = options.genericFillers || ['yes', 'yeah', 'ya', 'ok', 'okay', 'hmm'];
  }

  start() {
    this.isActive = true;
    this.audioChunks = [];
    this.currentSize = 0;
    this.emit('open');
  }

  // Alias for compatibility with socket handler expecting connect()
  connect() {
    this.start();
  }

  /**
   * Accumulate PCM16 audio data
   * When enough data accumulated, send to Sarvam for transcription
   */
  async sendAudio(pcm16Buffer) {
    if (!this.isActive) return;

    // Calculate audio metrics for diagnostics
    const samples = new Int16Array(pcm16Buffer.buffer, pcm16Buffer.byteOffset, pcm16Buffer.length / 2);
    let sum = 0;
    let peak = 0;
    
    for (let i = 0; i < samples.length; i++) {
      const abs = Math.abs(samples[i]);
      sum += abs * abs;
      if (abs > peak) peak = abs;
    }
    
    const rms = Math.sqrt(sum / samples.length);
    const rmsDb = 20 * Math.log10(rms / 32768);
    const peakDb = 20 * Math.log10(peak / 32768);
    
    logger.debug(`Audio chunk: ${pcm16Buffer.length} bytes, RMS: ${rms.toFixed(0)} (${rmsDb.toFixed(1)} dB), Peak: ${peak} (${peakDb.toFixed(1)} dB)`);

    const isSilent = rms < this.minRms;
    if (isSilent) {
      this.silenceCount++;
      if (this.silenceCount % 5 === 0) { // avoid log spam
        logger.warn(`Silence chunk detected (RMS=${rms.toFixed(0)} < minRms=${this.minRms}). Consecutive silence: ${this.silenceCount}`);
      }
    } else {
      // reset silence counter on speech
      if (this.silenceCount > 0) {
        logger.debug(`Speech detected, resetting silence counter (had ${this.silenceCount})`);
      }
      this.silenceCount = 0;
    }
    
    // Warn if clipping detected
    if (peak >= 32767) {
      logger.warn(`Audio clipping detected! Peak at max value ${peak}`);
    }

    // Only accumulate non-silent audio OR a limited amount of silence that immediately follows speech
    if (!isSilent || this.silenceCount < 3) {
      this.audioChunks.push(pcm16Buffer);
      this.currentSize += pcm16Buffer.length;
    } else if (this.silenceCount >= this.maxSilenceChunks && this.currentSize > 0) {
      // Long silence: flush what we have to avoid holding stale buffer
      logger.info(`Long silence (${this.silenceCount} chunks) triggering flush of ${this.currentSize} bytes`);
      await this._processChunks();
      return; // stop further threshold processing this call
    }

    // Reduced threshold for faster response: chunkSize * 2 = ~5 seconds
    // Previously was chunkSize * 4 = ~10 seconds which was too slow
    const threshold = this.chunkSize * 2;
    logger.debug(`Audio accumulated: ${this.currentSize}/${threshold} bytes`);
    
    if (this.currentSize >= threshold) {
      logger.info(`Processing ${this.currentSize} bytes of audio (threshold reached)`);
      await this._processChunks();
      return;
    }

    // Safety flush: if accumulated speech+silence grows too large
    const maxBytes = this.chunkSize * 4; // ~ previous upper bound
    if (this.currentSize >= maxBytes) {
      logger.info(`Safety flush at ${this.currentSize} bytes (maxBytes=${maxBytes})`);
      await this._processChunks();
    }
  }

  async _processChunks() {
    if (this.audioChunks.length === 0) return;

    try {
      const audioBuffer = Buffer.concat(this.audioChunks);
      logger.info(`Processing ${audioBuffer.length} bytes for transcription (${this.audioChunks.length} chunks)`);
      
      this.audioChunks = [];
      this.currentSize = 0;

      // Convert raw PCM16 to WAV format for Sarvam
      const wavBuffer = this._pcm16ToWav(audioBuffer, 16000, 1);
      logger.debug(`Converted to WAV: ${wavBuffer.length} bytes`);

      // Optional debug dump of WAV for inspection
      if (process.env.SARVAM_DEBUG_DUMP_WAV === 'true') {
        try {
          const fs = await import('fs');
          const path = await import('path');
          const dir = path.resolve(process.cwd(), 'logs', 'wav-dumps');
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          const file = path.join(dir, `${Date.now()}_${Math.random().toString(36).slice(2)}.wav`);
          fs.writeFileSync(file, wavBuffer);
          logger.info(`WAV dump saved: ${file}`);
        } catch (e) {
          logger.warn('Failed to dump WAV file:', e.message);
        }
      }

      let result;
      if (this.language === 'auto') {
        // Auto-detect + translate to English
        result = await this.sttClient.transcribeAndTranslate(wavBuffer, {
          withTimestamps: false,
        });
        // Normalize result fields for downstream usage
        result.language = result.detectedLanguage || 'unknown';
      } else {
        result = await this.sttClient.transcribe(wavBuffer, {
          language: this.language,
          withTimestamps: false,
        });
      }

      logger.info(`Transcription result: "${result.transcript}" (language: ${result.language})`);

      const text = (result.transcript || '').trim();
      if (!text) {
        logger.warn('Empty transcript received from Sarvam API');
        return;
      }

      // Duplicate / filler suppression
      const now = Date.now();
      const lower = text.toLowerCase();
      const isGeneric = this.genericFillers.includes(lower.replace(/[.!]/g, '')) && text.length <= 6;
      const duplicate = isGeneric && this.lastTranscript.toLowerCase() === lower && (now - this.lastTranscriptTime) < this.duplicateWindowMs;
      if (duplicate) {
        logger.info(`Suppressed duplicate filler transcript: "${text}" within ${this.duplicateWindowMs}ms window`);
        return;
      }

      this.lastTranscript = text;
      this.lastTranscriptTime = now;

      this.emit('final', {
        text,
        timestamp: result.timestamp,
        language: result.language,
        autoDetected: this.language === 'auto'
      });
    } catch (error) {
      logger.error('Error processing audio chunks:', error);
      this.emit('error', error);
    }
  }

  async close() {
    this.isActive = false;
    
    // Process remaining audio
    if (this.audioChunks.length > 0) {
      await this._processChunks();
    }
    
    this.emit('close');
  }

  /**
   * Convert raw PCM16 to WAV format
   */
  _pcm16ToWav(pcm16Buffer, sampleRate, channels) {
    const dataLength = pcm16Buffer.length;
    const wavHeader = Buffer.alloc(44);

    // RIFF header
    wavHeader.write('RIFF', 0);
    wavHeader.writeUInt32LE(36 + dataLength, 4);
    wavHeader.write('WAVE', 8);
    
    // fmt chunk
    wavHeader.write('fmt ', 12);
    wavHeader.writeUInt32LE(16, 16); // Chunk size
    wavHeader.writeUInt16LE(1, 20);  // Audio format (PCM)
    wavHeader.writeUInt16LE(channels, 22);
    wavHeader.writeUInt32LE(sampleRate, 24);
    wavHeader.writeUInt32LE(sampleRate * channels * 2, 28); // Byte rate
    wavHeader.writeUInt16LE(channels * 2, 32); // Block align
    wavHeader.writeUInt16LE(16, 34); // Bits per sample
    
    // data chunk
    wavHeader.write('data', 36);
    wavHeader.writeUInt32LE(dataLength, 40);

    return Buffer.concat([wavHeader, pcm16Buffer]);
  }
}

/**
 * Factory function to create Sarvam client from environment variables
 */
export function createSarvamClient(options = {}) {
  const apiKey = process.env.SARVAM_API_KEY;
  
  if (!apiKey) {
    throw new Error('SARVAM_API_KEY not found in environment. Get yours at: https://dashboard.sarvam.ai/admin');
  }

  return new SarvamRealtimeClient(apiKey, {
    language: options.language || 'en-IN', // Default to English
    ...options,
  });
}
