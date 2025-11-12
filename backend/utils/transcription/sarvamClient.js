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

// Sarvam AI supported language codes (11 Indian languages + auto)
const SUPPORTED_LANGUAGES = [
  'auto', // Auto-detect (for translate endpoint)
  'en-IN', 'hi-IN', 'bn-IN', 'kn-IN', 'ml-IN', 'mr-IN', 
  'od-IN', 'pa-IN', 'ta-IN', 'te-IN', 'gu-IN'
];

// Common Indian languages for fallback attempts (ordered by usage)
const FALLBACK_LANGUAGE_PRIORITY = [
  'hi-IN', // Hindi - most widely spoken
  'en-IN', // English
  'te-IN', // Telugu
  'ta-IN', // Tamil
  'mr-IN', // Marathi
  'gu-IN', // Gujarati
  'kn-IN', // Kannada
  'ml-IN', // Malayalam
  'bn-IN', // Bengali
  'pa-IN', // Punjabi
  'od-IN'  // Odia
];

// Max file size for Sarvam API (10MB limit)
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB in bytes

/**
 * Sarvam AI HTTP Client for Speech-to-Text
 * Supports batch transcription via file upload
 */
export class SarvamSTTClient {
  constructor(apiKey, options = {}) {
    if (!apiKey) {
      throw new Error('Sarvam API key is required. Get yours at: https://dashboard.sarvam.ai/admin');
    }
    
    // Validate API key format (basic check)
    if (typeof apiKey !== 'string' || apiKey.length < 10) {
      throw new Error('Invalid Sarvam API key format');
    }
    
    this.apiKey = apiKey;
    this.baseURL = options.baseURL || SARVAM_BASE_URL;
    this.language = options.language || 'en-IN'; // Default to English
    // Use latest stable model version - saarika:v2 is most accurate per Sarvam docs
    this.model = options.model || process.env.SARVAM_STT_MODEL || 'saarika:v2';
    this.withTimestamps = options.withTimestamps !== false;
    this.enablePreprocessing = options.enablePreprocessing !== false; // Enable by default for accuracy
    
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'api-subscription-key': this.apiKey,
        'Content-Type': 'multipart/form-data'
      },
      timeout: 60000, // 60s for audio processing
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });
  }

  /**
   * Validate language code
   */
  _validateLanguage(languageCode) {
    if (!SUPPORTED_LANGUAGES.includes(languageCode)) {
      logger.warn(`Unsupported language code: ${languageCode}. Falling back to en-IN`);
      return 'en-IN';
    }
    return languageCode;
  }

  /**
   * Validate audio buffer size and quality
   */
  _validateAudioSize(audioBuffer) {
    if (!audioBuffer || !Buffer.isBuffer(audioBuffer)) {
      throw new Error('Invalid audio buffer: must be a Buffer object');
    }
    
    if (audioBuffer.length === 0) {
      throw new Error('Empty audio buffer provided');
    }
    
    if (audioBuffer.length < 1000) {
      logger.warn(`Very small audio buffer: ${audioBuffer.length} bytes - may produce poor results`);
    }
    
    if (audioBuffer.length > MAX_FILE_SIZE) {
      throw new Error(`Audio buffer size (${audioBuffer.length} bytes) exceeds maximum (${MAX_FILE_SIZE} bytes / 10MB)`);
    }
    return true;
  }

  /**
   * Validate WAV format
   */
  _validateWavFormat(audioBuffer) {
    if (audioBuffer.length < 44) {
      throw new Error('Invalid WAV file: too small (< 44 bytes)');
    }
    
    // Check RIFF header
    const riff = audioBuffer.toString('ascii', 0, 4);
    if (riff !== 'RIFF') {
      throw new Error(`Invalid WAV file: missing RIFF header (got: ${riff})`);
    }
    
    // Check WAVE format
    const wave = audioBuffer.toString('ascii', 8, 12);
    if (wave !== 'WAVE') {
      throw new Error(`Invalid WAV file: missing WAVE format (got: ${wave})`);
    }
    
    // Check fmt chunk
    const fmt = audioBuffer.toString('ascii', 12, 16);
    if (fmt !== 'fmt ') {
      logger.warn(`WAV format warning: expected 'fmt ' chunk at position 12, got: ${fmt}`);
    }
    
    return true;
  }

  /**
   * Transcribe audio buffer to text
   * @param {Buffer} audioBuffer - Audio file buffer (WAV/MP3, 16kHz recommended)
   * @param {Object} options - Override language, model, timestamps, retryCount
   * @returns {Promise<Object>} { transcript, language, timestamp }
   */
  async transcribe(audioBuffer, options = {}) {
    const retryCount = options._retryCount || 0;
    const maxRetries = 3;
    
    try {
      // Validate audio size and quality
      this._validateAudioSize(audioBuffer);
      
      // Validate WAV format if it looks like WAV
      if (audioBuffer.length >= 44) {
        const header = audioBuffer.toString('ascii', 0, 4);
        if (header === 'RIFF') {
          this._validateWavFormat(audioBuffer);
        }
      }
      
      const form = new FormData();
      
      // Create readable stream from buffer
      const audioStream = Readable.from(audioBuffer);
      form.append('file', audioStream, {
        filename: 'audio.wav',
        contentType: 'audio/wav',
      });

      // Language code (hi-IN, en-IN, etc.) and model per Sarvam API (multipart fields)
      let languageCode = this._validateLanguage(options.language || this.language);
      // Sarvam /speech-to-text does NOT support 'auto' language_code; normalize to en-IN
      if (languageCode === 'auto') {
        logger.warn('language_code "auto" is not supported by /speech-to-text; falling back to en-IN');
        languageCode = 'en-IN';
      }
      
      // Log request details
      logger.info(`Sarvam transcribe request: size=${audioBuffer.length} bytes, language=${languageCode}`);
      
      form.append('language_code', languageCode);
      form.append('model', options.model || this.model);
      // Enable Sarvam server-side preprocessing for best accuracy (noise suppression, normalization)
      form.append('enable_preprocessing', String(options.enablePreprocessing !== undefined ? options.enablePreprocessing : this.enablePreprocessing));
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

      const transcript = response.data.transcript || '';
      logger.debug(`Sarvam transcribe response: status=${response.status}, transcript="${transcript}" (length: ${transcript.length})`);
      
      // Log warning if empty transcript
      if (!transcript || transcript.trim().length === 0) {
        logger.warn(`Empty transcript from /speech-to-text (lang: ${languageCode}, size: ${audioBuffer.length})`);
      }

      return {
        transcript: response.data.transcript || '',
        language: languageCode,
        timestamp: Date.now(),
        duration: response.data.duration_in_seconds,
        retries: retryCount
      };
    } catch (error) {
      const wrappedError = this._handleError(error, 'transcribe');
      
      // Retry logic for transient errors
      const isRateLimit = error.response?.status === 429;
      const isTimeout = error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT';
      const isServerError = error.response?.status >= 500;
      const shouldRetry = (isRateLimit || isTimeout || isServerError) && retryCount < maxRetries;
      
      if (shouldRetry) {
        const delayMs = isRateLimit ? 2000 * (retryCount + 1) : 1000 * Math.pow(2, retryCount);
        logger.warn(`Retrying transcribe after ${delayMs}ms (attempt ${retryCount + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        return this.transcribe(audioBuffer, { ...options, _retryCount: retryCount + 1 });
      }
      
      throw wrappedError;
    }
  }

  /**
   * Transcribe and translate to English (auto-detect language)
   * @param {Buffer} audioBuffer - Audio file buffer
   * @returns {Promise<Object>} { transcript (in English), detectedLanguage, timestamp }
   */
  async transcribeAndTranslate(audioBuffer, options = {}) {
    try {
      // Validate audio size
      this._validateAudioSize(audioBuffer);
      
      // Validate WAV format if it looks like WAV
      if (audioBuffer.length >= 44) {
        const header = audioBuffer.toString('ascii', 0, 4);
        if (header === 'RIFF') {
          this._validateWavFormat(audioBuffer);
        }
      }
      
      const form = new FormData();
      const audioStream = Readable.from(audioBuffer);
      form.append('file', audioStream, {
        filename: 'audio.wav',
        contentType: 'audio/wav',
      });

      // Log request details
      logger.info(`Sarvam transcribe+translate request: size=${audioBuffer.length} bytes (auto-detect)`);

      // Enable preprocessing for best quality
      form.append('enable_preprocessing', String(options.enablePreprocessing !== undefined ? options.enablePreprocessing : true));

      const response = await this.client.post('/speech-to-text-translate', form, {
        headers: {
          ...form.getHeaders(),
        },
        params: {
          model: options.model || 'saaras:v2.5',
        },
      });

      // Log full response for debugging language detection
      logger.debug(`Sarvam translate full response:`, {
        status: response.status,
        data: response.data,
        transcript: response.data.transcript,
        language: response.data.language,
        languageCode: response.data.language_code,
        detectedLang: response.data.detected_language,
        sourceLanguage: response.data.source_language
      });

      // Try multiple possible language field names from Sarvam API
      const detectedLanguage = response.data.language || 
                              response.data.language_code || 
                              response.data.detected_language ||
                              response.data.source_language ||
                              'unknown';

      return {
        transcript: response.data.transcript || '',
        detectedLanguage: detectedLanguage,
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
      const errorData = error.response.data;
      
      // Extract error message with fallback to stringified object
      // Handle nested error structures like { error: { message: "..." } }
      let message;
      if (errorData?.message) {
        message = errorData.message;
      } else if (errorData?.error?.message) {
        // Nested error object (Sarvam API format)
        message = errorData.error.message;
      } else if (typeof errorData?.error === 'string') {
        message = errorData.error;
      } else if (errorData?.detail) {
        message = errorData.detail;
      } else if (typeof errorData === 'string') {
        message = errorData;
      } else if (errorData && typeof errorData === 'object') {
        message = JSON.stringify(errorData);
      } else {
        message = error.message;
      }
      
      // Log full error details for debugging
      logger.error(`Sarvam API ${method} Error Details:`, {
        status,
        errorData: typeof errorData === 'object' ? errorData : { raw: errorData },
        headers: error.response.headers,
        requestUrl: error.config?.url,
        requestMethod: error.config?.method
      });
      
      return new Error(`Sarvam AI ${method} failed (${status}): ${message}`);
    } else if (error.request) {
      logger.error(`Sarvam API ${method} - No response:`, {
        timeout: error.code === 'ECONNABORTED',
        errorCode: error.code
      });
      return new Error(`Sarvam AI ${method} - No response from server. Check network or API endpoint.`);
    } else {
      logger.error(`Sarvam API ${method} - Request setup error:`, error.message);
      return new Error(`Sarvam API ${method} - ${error.message}`);
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
    // Enhanced VAD / filtering configuration - ULTRA-SENSITIVE for quiet audio
    // Reduced from 80 to 50 to catch quiet/distant speech that was being missed
    this.minRmsInt16 = parseInt(process.env.MIN_RMS_INT16) || options.minRms || 50; // Ultra-sensitive - catch quiet speech
    this.maxSilenceChunks = options.maxSilenceChunks || 5; // Very fast flush on silence (instant response)
    this.silenceCount = 0;
    this.lastTranscript = '';
    this.lastTranscriptTime = 0;
    this.duplicateWindowMs = options.duplicateWindowMs || 3000; // suppress duplicates within 3s
    this.genericFillers = options.genericFillers || ['yes', 'yeah', 'ya', 'ok', 'okay', 'hmm', 'uh', 'um'];
    this.hadSpeech = false;
  // ULTIMATE ACCURACY: MAXIMUM context for BEST transcription quality
    // Sarvam AI performs BEST with 5-6 seconds (captures complete sentences with context)
    // Longer batches = more context = better language detection = accurate transcription
    this.minFlushBytes = options.minFlushBytes || 160000; // ~5s @ 16kHz (80000 samples) - ULTIMATE accuracy
    
    // Batching configuration - ULTIMATE QUALITY MODE
    this.minBatchDurationMs = parseInt(process.env.MIN_BATCH_DURATION_MS) || 5000; // 5s batch for MAXIMUM context
    this.batchStartTime = null;
    this.totalDurationMs = 0;
    this._chunkCount = 0;
    this._droppedChunks = 0;
    
    // Minimum word count to accept transcript (reject short filler responses)
    this.minWordCount = parseInt(process.env.MIN_WORD_COUNT) || 1; // accept 1+ words - REAL-TIME optimized
    
    this.debugCapture = (process.env.DEBUG_AUDIO_CAPTURE === 'true');

    // Adaptive handling for repeated unknown / low-quality transcripts
    this.unknownStreak = 0; // consecutive unknown-language short transcripts
    this.maxUnknownStreak = parseInt(process.env.SARVAM_MAX_UNKNOWN_STREAK) || 2; // Allow 2 attempts before escalation
    this.fallbackLanguage = process.env.SARVAM_FALLBACK_LANGUAGE || 'hi-IN'; // Hindi fallback
    this.escalatedDurationMs = parseInt(process.env.SARVAM_ESCALATED_DURATION_MS) || 2000; // 2s escalation for better quality
    this.escalatedFlushBytes = parseInt(process.env.SARVAM_ESCALATED_FLUSH_BYTES) || 64000; // ~2s @ 16kHz - Better accuracy
    this.minSpeechFrames = parseInt(process.env.MIN_SPEECH_FRAMES) || 4; // MINIMAL: instant triggering (was 6)
    this.speechFrameCount = 0; // number of speech chunks in current batch
    // Multi-language detection settings - ULTIMATE COVERAGE for BEST detection
    // Testing ALL 11 languages (100% coverage) with sequential processing + retry protection
    // Maximum languages = best chance of correct detection = highest accuracy possible
    this.maxLanguagesToTest = parseInt(process.env.MAX_LANGUAGES_TO_TEST) || 11; // Test ALL 11 Indian languages for ULTIMATE accuracy
    // Hard caps to prevent runaway accumulation - Sarvam API has 30s limit for realtime endpoint
    // Use 25s to leave margin for processing delays and network latency
    this.maxBatchDurationMs = parseInt(process.env.MAX_BATCH_DURATION_MS) || 25000; // 25s hard cap (Sarvam limit: 30s)
    this.maxBatchBytes = parseInt(process.env.MAX_BATCH_BYTES) || (16000 * 2 * 25); // ≈800000 bytes @ 16kHz mono 25s
    // Translation error tracking / degradation
    this.translateErrorCount = 0;
    this.maxTranslateErrors = parseInt(process.env.MAX_TRANSLATE_ERRORS) || 3;
    this.degradedTranslate = false; // when true skip translate endpoint
    this.emptyBatchStreak = 0; // consecutive batches with empty transcripts

    // Preflight language detection and guards
    this.preflightDetect = process.env.SARVAM_PREFLIGHT_DETECT !== 'false';
    this.preflightSeconds = parseFloat(process.env.SARVAM_PREFLIGHT_SECONDS || '1.6');
    this.enableTTGuard = process.env.SARVAM_ENABLE_TT_GUARD !== 'false';
    this.lastDetectedLanguage = null; // heuristic to prioritize recent language

    // Latency mode: 'accuracy' (default) or 'speed' (reduced language set, looser early-exit for short phrases)
    this.latencyMode = process.env.SARVAM_LATENCY_MODE || 'accuracy';
  }

  start() {
    this.isActive = true;
    this.audioChunks = [];
    this.currentSize = 0;
    this.batchStartTime = Date.now();
    this.totalDurationMs = 0;
    this._chunkCount = 0;
    this._droppedChunks = 0;
    this.speechFrameCount = 0;
    this.processing = false;
    this.deferRetry = null;
    this.translateErrorCount = 0;
    this.degradedTranslate = false;
    this.emit('open');
  }

  // Alias for compatibility with socket handler expecting connect()
  connect() {
    this.start();
  }

  /**
   * Accumulate PCM16 audio data with metadata-aware batching
   * @param {Buffer} pcm16Buffer - PCM16 audio buffer
   * @param {Object} meta - Optional metadata {rmsInt16, durationMs, samples, sr}
   */
  async sendAudio(pcm16Buffer, meta = null) {
    if (!this.isActive) return;

    this._chunkCount++;
    
    // Use metadata if provided, otherwise compute
    let rms, durationMs;
    if (meta && meta.rmsInt16 !== undefined) {
      rms = meta.rmsInt16;
      durationMs = meta.durationMs || 200; // default ~200ms
    } else {
      // Calculate audio metrics for diagnostics
      const samples = new Int16Array(pcm16Buffer.buffer, pcm16Buffer.byteOffset, pcm16Buffer.length / 2);
      let sum = 0;
      let peak = 0;
      
      for (let i = 0; i < samples.length; i++) {
        const abs = Math.abs(samples[i]);
        sum += abs * abs;
        if (abs > peak) peak = abs;
      }
      
      rms = Math.sqrt(sum / samples.length);
      durationMs = (samples.length / 16000) * 1000;
    }
    
    const rmsDb = 20 * Math.log10(rms / 32768);
    
    if (this.debugCapture) {
      logger.debug(`Audio chunk: ${pcm16Buffer.length} bytes, RMS: ${rms.toFixed(0)} (${rmsDb.toFixed(1)} dB)`);
    }

    // Drop extremely low-energy chunks
    if (rms < this.minRmsInt16) {
      this._droppedChunks++;
      if (this._droppedChunks <= 10 || this._droppedChunks % 20 === 0) {
        logger.debug(`Dropped low-energy chunk (RMS=${rms.toFixed(0)} < ${this.minRmsInt16}). Total dropped: ${this._droppedChunks}`);
      }
      // Still count silence for flush logic
      this.silenceCount++;
      return;
    }

    const isSilent = rms < (this.minRmsInt16 * 1.5); // slightly higher threshold for "silence" detection
    if (isSilent) {
      this.silenceCount++;
      if (this.silenceCount % 5 === 0 && this.debugCapture) {
        logger.warn(`Silence chunk detected (RMS=${rms.toFixed(0)}). Consecutive silence: ${this.silenceCount}`);
      }
    } else {
      // reset silence counter on speech
      if (this.silenceCount > 0 && this.debugCapture) {
        logger.debug(`Speech detected, resetting silence counter (had ${this.silenceCount})`);
      }
      this.silenceCount = 0;
      this.hadSpeech = true;
    }

    // Accumulate audio (speech + limited trailing silence)
    if (!isSilent) {
      this.audioChunks.push(pcm16Buffer);
      this.currentSize += pcm16Buffer.length;
      this.totalDurationMs += durationMs;
      this.speechFrameCount++;
    } else if (this.hadSpeech && this.silenceCount < 3) {
      this.audioChunks.push(pcm16Buffer); // allow brief trailing silence
      this.currentSize += pcm16Buffer.length;
      this.totalDurationMs += durationMs;
    } else if (this.silenceCount >= this.maxSilenceChunks && this.currentSize > 0) {
      logger.info(`Long silence (${this.silenceCount} chunks) triggering flush of ${this.currentSize} bytes`);
      await this._processChunks();
      return;
    }

    // Adaptive flush criteria (duration + bytes + speech frames) with escalation on unknown streak
    if (this.processing) return; // avoid overlapping STT calls
    const escalated = this.unknownStreak >= this.maxUnknownStreak;
    const requiredDuration = escalated ? this.escalatedDurationMs : this.minBatchDurationMs;
    const requiredBytes = escalated ? this.escalatedFlushBytes : this.minFlushBytes;
    const shouldFlush = this.totalDurationMs >= requiredDuration &&
                        this.currentSize >= requiredBytes &&
                        this.speechFrameCount >= this.minSpeechFrames &&
                        (!this.deferRetry || Date.now() >= this.deferRetry);

    // Hard cap flush (protect against mis-calibration leading to huge buffers)
    const capExceeded = this.totalDurationMs >= this.maxBatchDurationMs || this.currentSize >= this.maxBatchBytes;

    if ((shouldFlush || capExceeded) && this.currentSize > 0) {
      logger.info(`Batching flush: ${this.currentSize} bytes, ${this.totalDurationMs.toFixed(0)}ms (speechFrames=${this.speechFrameCount}, escalated=${escalated})`);
      await this._processChunks();
      return;
    }

    // Safety flush if buffer becomes very large (prevent runaway accumulation)
    const maxBytes = this.chunkSize * 6; // allow larger due to rebuffering strategy
    if (this.currentSize >= maxBytes) {
      logger.info(`Safety flush at ${this.currentSize} bytes (maxBytes=${maxBytes})`);
      await this._processChunks();
    }
  }

  async _processChunks() {
    if (this.audioChunks.length === 0) return;
    if (this.processing) return; // guard
    this.processing = true;
    
    // Generate unique batch ID for tracking
    const batchId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    logger.debug(`[Batch ${batchId}] Starting processing of ${this.audioChunks.length} chunks`);
    
    try {
      const audioBuffer = Buffer.concat(this.audioChunks);
      if (audioBuffer.length < this.minFlushBytes) {
        if (this.debugCapture) {
          logger.debug(`[Batch ${batchId}] Deferring STT: only ${audioBuffer.length} bytes (${this.totalDurationMs.toFixed(0)}ms) < minFlushBytes=${this.minFlushBytes}`);
        }
        this.processing = false;
        return;
      }

      logger.info(`[Batch ${batchId}] Processing ${audioBuffer.length} bytes for transcription (${this.audioChunks.length} chunks, ${this.totalDurationMs.toFixed(0)}ms)`);

      // Aggregate RMS gate - RELAXED threshold for quiet audio
      const samples = new Int16Array(audioBuffer.buffer, audioBuffer.byteOffset, audioBuffer.length / 2);
      if (samples.length > 0) {
        let sum = 0, peak = 0;
        for (let i = 0; i < samples.length; i++) {
          const v = Math.abs(samples[i]);
          sum += v * v;
          if (v > peak) peak = v;
        }
        const aggRms = Math.sqrt(sum / samples.length);
        // CRITICAL FIX: Lower threshold from 80 to 30 to process quiet audio
        // The normalization step will amplify it to acceptable levels
        const effectiveMinRms = Math.min(this.minRmsInt16, 30);
        if (aggRms < effectiveMinRms) {
          logger.debug(`Skipping STT call: aggregate RMS ${aggRms.toFixed(0)} below ${effectiveMinRms} (very quiet)`);
          this.processing = false;
          this.hadSpeech = false;
          // keep buffer for potential accumulation (do not clear)
          return;
        } else if (aggRms < 200) {
          logger.info(`[Batch ${batchId}] Low volume detected (RMS: ${aggRms.toFixed(0)}), will apply amplification`);
        }
      }

      // Calculate audio quality metrics BEFORE normalization
      const qualitySamples = new Int16Array(audioBuffer.buffer, audioBuffer.byteOffset, audioBuffer.length / 2);
      let sum = 0, peak = 0, nonZero = 0;
      for (let i = 0; i < qualitySamples.length; i++) {
        const v = Math.abs(qualitySamples[i]);
        sum += v * v;
        if (v > peak) peak = v;
        if (v > 0) nonZero++;
      }
      const rms = Math.sqrt(sum / qualitySamples.length);
      const rmsDb = 20 * Math.log10(rms / 32768);
      const nonZeroPercent = ((nonZero / qualitySamples.length) * 100).toFixed(1);
      logger.info(`[Batch ${batchId}] Audio quality (original) - RMS: ${rms.toFixed(0)} (${rmsDb.toFixed(1)} dB), Peak: ${peak}, Non-zero: ${nonZeroPercent}%, Samples: ${qualitySamples.length}`);
      
      // ULTIMATE AUDIO QUALITY: Aggressive normalization for BEST transcription results
      // Sarvam API performs BEST with audio at -15dB to -20dB range
      // Normalize more audio to optimal range for maximum accuracy
      let normalizedBuffer = audioBuffer;
      const targetRMS = 7000; // Target RMS ~-13dB (optimal for Sarvam quality)
      const minRMSForNormalization = 3000; // Normalize if below -22dB (more aggressive for quality)
      
      if (rms < minRMSForNormalization && rms > 0) {
        const amplificationFactor = targetRMS / rms;
        const maxAmplification = 5.0; // Conservative amplification to preserve quality
        const actualAmplification = Math.min(amplificationFactor, maxAmplification);
        
        logger.info(`[Batch ${batchId}] Audio too quiet (${rmsDb.toFixed(1)} dB), applying ${actualAmplification.toFixed(2)}x amplification`);
        
        // Create normalized buffer
        const normalizedSamples = new Int16Array(qualitySamples.length);
        for (let i = 0; i < qualitySamples.length; i++) {
          const amplified = qualitySamples[i] * actualAmplification;
          // Clamp to Int16 range to prevent clipping
          normalizedSamples[i] = Math.max(-32768, Math.min(32767, amplified));
        }
        
        normalizedBuffer = Buffer.from(normalizedSamples.buffer);
        
        // Calculate normalized audio metrics
        let normalizedSum = 0, normalizedPeak = 0;
        for (let i = 0; i < normalizedSamples.length; i++) {
          const v = Math.abs(normalizedSamples[i]);
          normalizedSum += v * v;
          if (v > normalizedPeak) normalizedPeak = v;
        }
        const normalizedRms = Math.sqrt(normalizedSum / normalizedSamples.length);
        const normalizedRmsDb = 20 * Math.log10(normalizedRms / 32768);
        logger.info(`[Batch ${batchId}] Audio quality (normalized) - RMS: ${normalizedRms.toFixed(0)} (${normalizedRmsDb.toFixed(1)} dB), Peak: ${normalizedPeak}`);

        // If still too quiet after normalization (< -22dB), apply gentle second pass up to 1.5x
        if (normalizedRms < 3000) {
          const secondPassFactor = Math.min(1.5, 3000 / Math.max(1, normalizedRms));
          logger.info(`[Batch ${batchId}] Second-pass normalization x${secondPassFactor.toFixed(2)} to reach -22 dB`);
          const secondSamples = new Int16Array(normalizedSamples.length);
          for (let i = 0; i < normalizedSamples.length; i++) {
            const amplified = normalizedSamples[i] * secondPassFactor;
            secondSamples[i] = Math.max(-32768, Math.min(32767, amplified));
          }
          normalizedBuffer = Buffer.from(secondSamples.buffer);
        }
      } else {
        logger.debug(`[Batch ${batchId}] Audio quality sufficient, no normalization needed`);
      }
      
      const wavBuffer = this._pcm16ToWav(normalizedBuffer, 16000, 1);
      logger.debug(`[Batch ${batchId}] Converted to WAV: ${wavBuffer.length} bytes from ${normalizedBuffer.length} bytes PCM`);

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
      let originalText = null;
      let translatedText = null;
      let detectedLang = null;
  let preflightDetectedLang = null;
  let similarityScore = null;
      
      // Multilingual dual-mode: when language is 'auto', get BOTH original and translated text
      const dualMode = this.language === 'auto' && process.env.MULTILINGUAL_MODE !== 'false';
      
      // Optional preflight detection using speech-to-text-translate(auto) on a short head sample
      if (this.language === 'auto' && this.preflightDetect) {
        try {
          const headBytes = Math.min(normalizedBuffer.length, Math.floor(this.preflightSeconds * 16000 * 2));
          const headPcm = normalizedBuffer.subarray(0, headBytes);
          const headWav = this._pcm16ToWav(headPcm, 16000, 1);
          logger.info(`[Batch ${batchId}] Preflight detect on ${this.preflightSeconds.toFixed(1)}s head (${headBytes} bytes)`);
          const pre = await this.sttClient.transcribeAndTranslate(headWav, { model: 'saaras:v2.5' });
          const norm = this._normalizeLanguageCode(pre.detectedLanguage);
          if (pre.transcript && pre.transcript.trim().length > 0 && norm) {
            preflightDetectedLang = norm;
            logger.info(`[Batch ${batchId}] Preflight detected language: ${pre.detectedLanguage} -> ${norm}`);
          } else {
            logger.debug(`[Batch ${batchId}] Preflight detection inconclusive`);
          }
        } catch (pfErr) {
          logger.debug(`[Batch ${batchId}] Preflight detect failed: ${pfErr.message}`);
        }
      }

      // MULTI-LANGUAGE STRATEGY: Try all supported languages intelligently
      // Instead of translate API (poor accuracy), try direct transcription in multiple languages
      // Pick the best result based on quality metrics (length, word count, confidence)
      if (this.language === 'auto') {
        if (this.degradedTranslate) {
          // Degraded path: first attempt plain transcribe with fallbackLanguage to get original text
          logger.warn('Translation degraded: using fallback plain transcription path');
          result = await this.sttClient.transcribe(wavBuffer, { language: this.fallbackLanguage, withTimestamps: false });
          result.language = result.language || this.fallbackLanguage;
          originalText = result.transcript;
        } else {
          try {
            // NEW APPROACH: Try multiple languages in parallel and pick the best result
            logger.info(`[Batch ${batchId}] Attempting multi-language detection across Indian languages`);
            
            // Languages to try (ordered by popularity for optimization)
            // Use environment variable to control how many languages to test (1-11)
            const numLanguages = Math.min(this.maxLanguagesToTest, FALLBACK_LANGUAGE_PRIORITY.length);
            const baseList = FALLBACK_LANGUAGE_PRIORITY.slice(0, numLanguages);
            const prioritized = [];
            if (this.lastDetectedLanguage) prioritized.push(this.lastDetectedLanguage);
            if (preflightDetectedLang) prioritized.push(preflightDetectedLang);
            // Always include English early for short utterances
            prioritized.push('en-IN');
            const fullList = [...new Set([...prioritized, ...baseList])];
            const speedCap = parseInt(process.env.SPEED_MAX_LANGUAGES || '6');
            const cap = this.latencyMode === 'speed' ? Math.min(fullList.length, speedCap) : fullList.length;
            const languagesToTry = fullList.slice(0, cap);
            logger.info(`[Batch ${batchId}] Testing ${languagesToTry.length} languages: ${languagesToTry.join(', ')}`);
            
            // SEQUENTIAL language testing with rate limit handling (prevents 429 errors)
            // Test languages one-by-one with minimal delays to respect API rate limits
            const allResults = [];
            const delayBetweenRequests = parseInt(process.env.SARVAM_API_DELAY_MS) || 80; // 80ms delay = ~12 req/s (safe for Sarvam)
            const emptyBreakThreshold = parseInt(process.env.EMPTY_BREAK_THRESHOLD || '4');
            let consecutiveEmpties = 0;
            
            for (let i = 0; i < languagesToTry.length; i++) {
              const lang = languagesToTry[i];
              
              try {
                // Add delay between requests (except first one)
                if (i > 0) {
                  await new Promise(resolve => setTimeout(resolve, delayBetweenRequests));
                }
                
                const langResult = await this.sttClient.transcribe(wavBuffer, { language: lang, withTimestamps: false });
                let transcript = (langResult.transcript || '').trim();
                
                // FIX: Retry once if empty transcript (might be transient Sarvam API issue)
                if (!transcript || transcript.length === 0) {
                  logger.warn(`[Batch ${batchId}] ${lang} returned empty, retrying once after 500ms...`);
                  await new Promise(resolve => setTimeout(resolve, 500));
                  const retryResult = await this.sttClient.transcribe(wavBuffer, { language: lang, withTimestamps: false });
                  transcript = (retryResult.transcript || '').trim();
                  if (transcript.length > 0) {
                    logger.info(`[Batch ${batchId}] ${lang} retry succeeded: "${transcript.substring(0, 30)}..."`);
                    consecutiveEmpties = 0;
                  } else {
                    consecutiveEmpties++;
                  }
                }
                
                // Calculate quality score - ENHANCED for better accuracy
                const words = transcript.split(/\s+/).filter(w => w.length > 0);
                const wordCount = words.length;
                const charCount = transcript.length;
                
                // Enhanced quality scoring for accuracy
                // Factors: word count (most important), character count, average word length, linguistic patterns
                const avgWordLength = wordCount > 0 ? charCount / wordCount : 0;
                const hasValidWordLength = avgWordLength >= 3 && avgWordLength <= 15; // typical word range
                const hasProperCapitalization = /[A-Z]/.test(transcript); // Check for capitalization
                const hasNoRepeats = !/(.{3,})\1{2,}/.test(transcript); // No excessive repetition
                
                // ULTIMATE QUALITY SCORE - Heavily weighted for best detection
                // Formula: Base (word × 20) + chars + avg length bonus + validation bonuses
                let qualityScore = (wordCount * 20) + (charCount * 0.8) + (avgWordLength * 5);
                
                // INCREASED bonus points for quality indicators (favor better transcripts)
                if (hasValidWordLength) qualityScore += 35;
                if (hasProperCapitalization && lang === 'en-IN') qualityScore += 25;
                if (hasNoRepeats) qualityScore += 30;
                if (transcript.length > 0) qualityScore += 15;
                
                // Bonus for longer transcripts (more context = better quality)
                if (wordCount >= 8) qualityScore += 25;
                if (charCount >= 50) qualityScore += 20;
                
                // ENHANCED PENALTY for gibberish/wrong language detection
                if (wordCount === 1 && charCount > 30) qualityScore *= 0.3; // Single long word = likely gibberish
                if (avgWordLength < 2 || avgWordLength > 20) qualityScore *= 0.4; // Unusual word lengths = suspicious
                if (wordCount < 3 && charCount > 50) qualityScore *= 0.2; // Few words but many chars = gibberish
                
                // Check for common patterns of wrong language transcription
                const hasOnlyRepeatedChars = /^(.)\1{4,}/.test(transcript); // "aaaaa" pattern
                const hasRandomConsonants = /[bcdfghjklmnpqrstvwxyz]{6,}/i.test(transcript); // Too many consonants
                if (hasOnlyRepeatedChars || hasRandomConsonants) qualityScore *= 0.1; // Severe penalty
                
                logger.debug(`[Batch ${batchId}] ${lang} result: "${transcript.substring(0, 50)}..." (words: ${wordCount}, chars: ${charCount}, avg: ${avgWordLength.toFixed(1)}, quality: ${qualityScore.toFixed(0)})`);
                
                allResults.push({
                  language: lang,
                  transcript: transcript,
                  wordCount: wordCount,
                  charCount: charCount,
                  avgWordLength: avgWordLength,
                  qualityScore: qualityScore
                });

                // Early break if too many empties in a row (likely silence/too quiet or wrong batch)
                if (consecutiveEmpties >= emptyBreakThreshold) {
                  logger.warn(`[Batch ${batchId}] ${consecutiveEmpties} consecutive empty transcripts — stopping language loop early`);
                  break;
                }
                
                // ENHANCED LANGUAGE-SPECIFIC VALIDATION - ALL 11 languages with script detection
                // Best detection requires validating each language's unique script
                let languageMatchBonus = 0;
                if (transcript.length > 0) {
                  if (lang === 'en-IN') {
                    // English should have mostly ASCII characters
                    const asciiRatio = (transcript.match(/[a-zA-Z\s]/g) || []).length / transcript.length;
                    if (asciiRatio > 0.8) languageMatchBonus = 35; // Strong English indicator
                  } else if (lang === 'hi-IN' || lang === 'mr-IN') {
                    // Hindi/Marathi use Devanagari script (Unicode range \u0900-\u097F)
                    const devanagariRatio = (transcript.match(/[\u0900-\u097F]/g) || []).length / transcript.length;
                    if (devanagariRatio > 0.5) languageMatchBonus = 35; // Strong Devanagari indicator
                  } else if (lang === 'te-IN') {
                    // Telugu script (Unicode range \u0C00-\u0C7F)
                    const teluguRatio = (transcript.match(/[\u0C00-\u0C7F]/g) || []).length / transcript.length;
                    if (teluguRatio > 0.5) languageMatchBonus = 35;
                  } else if (lang === 'ta-IN') {
                    // Tamil script (Unicode range \u0B80-\u0BFF)
                    const tamilRatio = (transcript.match(/[\u0B80-\u0BFF]/g) || []).length / transcript.length;
                    if (tamilRatio > 0.5) languageMatchBonus = 35;
                  } else if (lang === 'bn-IN') {
                    // Bengali script (Unicode range \u0980-\u09FF)
                    const bengaliRatio = (transcript.match(/[\u0980-\u09FF]/g) || []).length / transcript.length;
                    if (bengaliRatio > 0.5) languageMatchBonus = 35;
                  } else if (lang === 'gu-IN') {
                    // Gujarati script (Unicode range \u0A80-\u0AFF)
                    const gujaratiRatio = (transcript.match(/[\u0A80-\u0AFF]/g) || []).length / transcript.length;
                    if (gujaratiRatio > 0.5) languageMatchBonus = 35;
                  } else if (lang === 'kn-IN') {
                    // Kannada script (Unicode range \u0C80-\u0CFF)
                    const kannadaRatio = (transcript.match(/[\u0C80-\u0CFF]/g) || []).length / transcript.length;
                    if (kannadaRatio > 0.5) languageMatchBonus = 35;
                  } else if (lang === 'ml-IN') {
                    // Malayalam script (Unicode range \u0D00-\u0D7F)
                    const malayalamRatio = (transcript.match(/[\u0D00-\u0D7F]/g) || []).length / transcript.length;
                    if (malayalamRatio > 0.5) languageMatchBonus = 35;
                  } else if (lang === 'pa-IN') {
                    // Punjabi Gurmukhi script (Unicode range \u0A00-\u0A7F)
                    const gurmukhiRatio = (transcript.match(/[\u0A00-\u0A7F]/g) || []).length / transcript.length;
                    if (gurmukhiRatio > 0.5) languageMatchBonus = 35;
                  } else if (lang === 'od-IN') {
                    // Odia script (Unicode range \u0B00-\u0B7F)
                    const odiaRatio = (transcript.match(/[\u0B00-\u0B7F]/g) || []).length / transcript.length;
                    if (odiaRatio > 0.5) languageMatchBonus = 35;
                  }
                }
                qualityScore += languageMatchBonus;
                
                // EARLY EXIT: dynamic thresholds to reduce latency for short utterances
                const strictScore = parseInt(process.env.EARLY_EXIT_STRICT_SCORE || '200');
                const shortScore = parseInt(process.env.EARLY_EXIT_SHORT_SCORE || '170');
                const shortMinWords = parseInt(process.env.EARLY_EXIT_SHORT_MIN_WORDS || '2');
                let shouldEarlyExit = false;
                // Original strict path (high confidence, longer text)
                if (qualityScore >= strictScore && wordCount >= 6 && hasNoRepeats && languageMatchBonus > 0 && hasValidWordLength) {
                  shouldEarlyExit = true;
                  logger.info(`[Batch ${batchId}] Found EXCEPTIONAL match for ${lang} (quality: ${qualityScore.toFixed(0)}, lang bonus: ${languageMatchBonus}), stopping early`);
                } else {
                  // Short-utterance fast path with strong script match
                  if (wordCount >= shortMinWords && qualityScore >= shortScore && languageMatchBonus >= 25) {
                    shouldEarlyExit = true;
                    logger.info(`[Batch ${batchId}] Early exit (short utterance) for ${lang} (quality: ${qualityScore.toFixed(0)}, words: ${wordCount}, bonus: ${languageMatchBonus})`);
                  }
                  // English special-case: very high ASCII ratio and decent score
                  if (!shouldEarlyExit && lang === 'en-IN') {
                    const asciiRatio = (transcript.match(/[a-zA-Z\s]/g) || []).length / Math.max(1, transcript.length);
                    const englishScore = parseInt(process.env.EARLY_EXIT_EN_SCORE || '160');
                    if (wordCount >= 2 && asciiRatio >= 0.9 && qualityScore >= englishScore) {
                      shouldEarlyExit = true;
                      logger.info(`[Batch ${batchId}] Early exit (English fast path) for en-IN (ascii=${(asciiRatio*100).toFixed(0)}%, q=${qualityScore.toFixed(0)})`);
                    }
                  }
                }
                if (shouldEarlyExit) break;
                
              } catch (err) {
                // Check if it's a rate limit error (429)
                const isRateLimit = err.message && err.message.includes('429');
                if (isRateLimit) {
                  logger.warn(`[Batch ${batchId}] Rate limit hit for ${lang}, waiting 2s before retry...`);
                  await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s on rate limit
                  
                  // Retry once after rate limit
                  try {
                    const langResult = await this.sttClient.transcribe(wavBuffer, { language: lang, withTimestamps: false });
                    const transcript = (langResult.transcript || '').trim();
                    const words = transcript.split(/\s+/).filter(w => w.length > 0);
                    const wordCount = words.length;
                    const charCount = transcript.length;
                    // FIX: Add avgWordLength calculation for consistency
                    const avgWordLength = wordCount > 0 ? charCount / wordCount : 0;
                    const qualityScore = (wordCount * 10) + (charCount * 0.3) + (transcript.length > 0 ? 20 : 0);
                    
                    allResults.push({
                      language: lang,
                      transcript: transcript,
                      wordCount: wordCount,
                      charCount: charCount,
                      avgWordLength: avgWordLength,
                      qualityScore: qualityScore
                    });
                  } catch (retryErr) {
                    logger.warn(`[Batch ${batchId}] ${lang} retry failed: ${retryErr.message}`);
                  }
                } else {
                  logger.debug(`[Batch ${batchId}] ${lang} transcription failed: ${err.message}`);
                }
                
                // Add empty result for failed language
                allResults.push({
                  language: lang,
                  transcript: '',
                  wordCount: 0,
                  charCount: 0,
                  avgWordLength: 0,
                  qualityScore: 0
                });
              }
            }
            
            // Filter out empty results and sort by quality score
            const validResults = allResults.filter(r => r.transcript.length > 0);
            validResults.sort((a, b) => b.qualityScore - a.qualityScore);
            
            if (validResults.length === 0) {
              // Try auto transcribe+translate as an additional fallback when all are empty
              try {
                logger.warn(`[Batch ${batchId}] All ${allResults.length} languages empty — trying transcribe+translate(auto) before backoff`);
                const auto = await this.sttClient.transcribeAndTranslate(wavBuffer, { model: 'saaras:v2.5', enablePreprocessing: true });
                const autoText = (auto.transcript || '').trim();
                if (autoText.length > 0) {
                  originalText = autoText;
                  translatedText = autoText;
                  detectedLang = this._normalizeLanguageCode(auto.detectedLanguage) || 'unknown';
                  result = { transcript: translatedText, language: detectedLang, timestamp: Date.now() };
                } else {
                  throw new Error('auto transcribe+translate returned empty');
                }
              } catch (autoEmptyErr) {
                // No usable transcript yet; accumulate more audio and retry next flush
                this.emptyBatchStreak++;
                const backoffMs = Math.min(1500, 300 * this.emptyBatchStreak);
                logger.warn(`[Batch ${batchId}] All languages empty after auto TT. Backing off ${backoffMs}ms and accumulating more audio (streak=${this.emptyBatchStreak})`);
                this.deferRetry = Date.now() + backoffMs;
                this.processing = false;
                // Do NOT clear buffers; keep accumulating for more context
                return;
              }
            }
            
            // Pick the best result
            const bestResult = validResults[0];
            originalText = bestResult.transcript;
            detectedLang = bestResult.language;
            
            // FIX: Log all top results for debugging
            logger.info(`[Batch ${batchId}] Top 3 results: ${validResults.slice(0, 3).map(r => `${r.language}:${r.qualityScore.toFixed(0)}`).join(', ')}`);
            logger.info(`[Batch ${batchId}] Best match: ${detectedLang} (quality: ${bestResult.qualityScore.toFixed(0)}, words: ${bestResult.wordCount})`);
            logger.info(`[Batch ${batchId}] Detected text: "${originalText}"`);
            
            // ALWAYS translate non-English to English (not just dual-mode)
            // This ensures every language gets English translation automatically
            if (detectedLang !== 'en-IN' && originalText && originalText.trim().length > 0) {
              try {
                // Use Sarvam's text translation API for accurate translation
              logger.info(`[Batch ${batchId}] Auto-translating ${detectedLang} to English`);
              const { translateText } = await import('../translationService.js');
              // translateText(text, targetLang, sourceLang) returns {translatedText, ...}
              const translationResult = await translateText(originalText, 'en-IN', detectedLang);
              translatedText = translationResult.translatedText; // Extract the text property
              logger.info(`[Batch ${batchId}] English translation: "${translatedText}"`);
              
              // Validate translation quality
              if (!translatedText || typeof translatedText !== 'string' || translatedText.trim().length === 0) {
                  logger.warn(`[Batch ${batchId}] Translation returned empty - using original text`);
                  translatedText = originalText; // Fallback to original if translation fails
                } else {
                  // Check similarity to detect English input or code-mixing
                  const similarity = this._calculateSimilarity(originalText.toLowerCase(), translatedText.toLowerCase());
                  similarityScore = similarity;
                  if (similarity > 0.8) {
                    logger.info(`[Batch ${batchId}] Texts are ${(similarity * 100).toFixed(0)}% similar - likely English input`);
                    // Still keep both for dual-mode display, but mark as English
                    detectedLang = 'en-IN';
                  } else {
                    logger.info(`[Batch ${batchId}] Translation differs from original (similarity: ${(similarity * 100).toFixed(0)}%)`);
                  }
                }
              } catch (transError) {
                logger.error(`[Batch ${batchId}] Translation failed: ${transError.message}`);
                // Fallback: use original text as both original and translated
                translatedText = originalText;
                logger.warn(`[Batch ${batchId}] Using original text as fallback`);
              }
              // Guard: if translation seems low-confidence for short or code-mixed text, try auto transcribe+translate on full batch
              if (this.enableTTGuard && detectedLang !== 'en-IN') {
                const ow = (originalText || '').trim().split(/\s+/).filter(Boolean).length;
                if (ow < 4 || (typeof similarityScore === 'number' && similarityScore < 0.2)) {
                  try {
                    logger.warn(`[Batch ${batchId}] Low-confidence translation (words=${ow}, sim=${similarityScore ?? 'n/a'}) — trying transcribe+translate(auto)`);
                    const auto = await this.sttClient.transcribeAndTranslate(wavBuffer, { model: 'saaras:v2.5' });
                    const autoText = (auto.transcript || '').trim();
                    if (autoText && autoText.split(/\s+/).length > (translatedText || '').split(/\s+/).length) {
                      translatedText = autoText;
                      const normAuto = this._normalizeLanguageCode(auto.detectedLanguage);
                      if (normAuto) detectedLang = normAuto;
                      logger.info(`[Batch ${batchId}] Using auto transcribe+translate result for English transcript`);
                    }
                  } catch (guardErr) {
                    logger.debug(`[Batch ${batchId}] TT guard attempt failed: ${guardErr.message}`);
                  }
                }
              }
            } else if (detectedLang === 'en-IN') {
              logger.info(`[Batch ${batchId}] Detected English - using as-is`);
              translatedText = originalText; // For English, both are the same
            }
            
            // Use English translation as primary transcript (what user sees)
            // Keep original in native script for dual-mode display
            result = {
              transcript: translatedText || originalText, // Always use English version
              language: detectedLang,
              timestamp: Date.now()
            };
            
          } catch (e) {
            this.translateErrorCount++;
            logger.error(`[Batch ${batchId}] Multi-language detection failed (count=${this.translateErrorCount}): ${e.message}`);
            
            // FIX: Try MULTIPLE fallback languages (not just one)
            const fallbackLanguages = [this.fallbackLanguage, 'en-IN', 'te-IN']; // Try Hindi, English, Telugu
            let fallbackSuccess = false;
            
            for (const fallbackLang of fallbackLanguages) {
              try {
                logger.info(`[Batch ${batchId}] Attempting fallback to ${fallbackLang}`);
                result = await this.sttClient.transcribe(wavBuffer, { language: fallbackLang, withTimestamps: false });
                
                if (result.transcript && result.transcript.trim().length > 0) {
                  result.language = result.language || fallbackLang;
                  originalText = result.transcript.trim();
                  translatedText = null;
                  fallbackSuccess = true;
                  logger.info(`[Batch ${batchId}] Fallback to ${fallbackLang} succeeded: "${originalText.substring(0, 30)}..."`);
                  break;
                }
              } catch (fallbackError) {
                logger.warn(`[Batch ${batchId}] Fallback ${fallbackLang} failed: ${fallbackError.message}`);
              }
            }
            
            if (!fallbackSuccess) {
              // Last-ditch attempt: try Sarvam transcribe+translate (auto) which sometimes succeeds when STT fails
              try {
                logger.warn(`[Batch ${batchId}] Attempting transcribe+translate(auto) as last resort`);
                const auto = await this.sttClient.transcribeAndTranslate(wavBuffer, { model: 'saaras:v2.5' });
                const autoText = (auto.transcript || '').trim();
                if (autoText.length > 0) {
                  result = { transcript: autoText, language: auto.detectedLanguage || 'unknown', timestamp: Date.now() };
                  originalText = autoText;
                  translatedText = autoText;
                  fallbackSuccess = true;
                  logger.info(`[Batch ${batchId}] transcribe+translate(auto) succeeded`);
                }
              } catch (autoErr) {
                logger.warn(`[Batch ${batchId}] transcribe+translate(auto) failed: ${autoErr.message}`);
              }

              if (!fallbackSuccess) {
                logger.error(`[Batch ${batchId}] ALL fallback attempts failed - audio may be silence or corrupted`);
                if (this.translateErrorCount >= this.maxTranslateErrors) {
                  this.degradedTranslate = true;
                  logger.warn('Max translate errors reached; degrading translation mode');
                }
                throw new Error('All transcription attempts failed including fallbacks - possible silence or audio corruption');
              }
            }
          }
        }
      } else {
        result = await this.sttClient.transcribe(wavBuffer, { language: this.language, withTimestamps: false });
        logger.debug(`Using configured language: ${this.language}`);
        originalText = result.transcript;
      }

      logger.info(`Transcription result: "${result.transcript}" (language: ${result.language})`);
      
      // Always log dual-mode transcripts when available
      if (originalText && translatedText && originalText !== translatedText) {
        logger.info(`Dual-mode transcripts - Original (${result.language}): "${originalText}", English: "${translatedText}"`);
      } else if (originalText) {
        logger.info(`Single-language transcript (${result.language}): "${originalText}"`);
      }

      const text = (result.transcript || '').trim();
      if (!text) {
        logger.warn('Empty transcript received from Sarvam API');
        this.processing = false;
        // keep buffer for more accumulation
        return;
      }

      // Unknown short hallucination handling (rebuffer & escalate)
      if (result.language === 'unknown' && text.length < 20) {
        this.unknownStreak++;
        logger.warn(`Rejected low-quality transcript: "${text}" (language unknown, too short) streak=${this.unknownStreak}`);
        // Defer next attempt slightly to allow more audio
        this.deferRetry = Date.now() + 600;
        this.processing = false;
        return; // keep buffers intact
      }

      // Fallback retry for longer unknown-language transcripts
      if (result.language === 'unknown' && text.length >= 20) {
        logger.info(`Unknown language with longer text; attempting fallback language transcription (${this.fallbackLanguage})`);
        try {
          const retry = await this.sttClient.transcribe(wavBuffer, { language: this.fallbackLanguage, withTimestamps: false });
          if (retry.transcript && retry.transcript.trim().length > 0) {
            result.transcript = retry.transcript.trim();
            result.language = this.fallbackLanguage;
            logger.info('Fallback transcription succeeded');
          }
        } catch (e) {
          logger.warn(`Fallback transcription failed: ${e.message}`);
        }
      }

      // Minimum quality checks
      const lower = result.transcript.toLowerCase();
      const words = lower.split(/\s+/).filter(w => w.length > 0);
      const wordCount = words.length;
      if (wordCount < this.minWordCount && result.transcript.length < 15) {
        const hasLongToken = words.some(w => w.replace(/[^a-z0-9]/gi,'').length >= 7);
        if (!hasLongToken) {
          logger.info(`Rejected short transcript: "${result.transcript}" (${wordCount} words)`);
          this.processing = false;
          // keep buffer for more accumulation
          return;
        }
      }

      // Duplicate / filler suppression
      const isFillWords = wordCount <= 2 && words.every(w => this.genericFillers.includes(w.replace(/[.!?,]/g, '')));
      const now = Date.now();
      const duplicate = (isFillWords && this.lastTranscript.toLowerCase() === lower && (now - this.lastTranscriptTime) < this.duplicateWindowMs) ||
                        (this.lastTranscript.toLowerCase() === lower && (now - this.lastTranscriptTime) < 2000);
      if (duplicate) {
        logger.info(`Suppressed duplicate/filler transcript: "${result.transcript}"`);
        this.processing = false;
        // keep buffer (maybe more context next time)
        return;
      }

  // Accept transcript
      this.lastTranscript = result.transcript.trim();
      this.lastTranscriptTime = now;
  this.lastDetectedLanguage = result.language || this.lastDetectedLanguage;
      
      // Emit with dual-mode support
      const eventData = {
        text: this.lastTranscript,
        timestamp: result.timestamp,
        language: result.language,
        autoDetected: this.language === 'auto'
      };
      
      // ALWAYS add dual-mode fields when original and translated differ
      // This ensures UI shows both native script + English translation
      if (originalText && translatedText && originalText.trim() !== translatedText.trim()) {
        eventData.originalText = originalText.trim();
        eventData.translatedText = translatedText.trim();
        eventData.dualMode = true;
        logger.info(`Emitting dual-mode transcript: original="${originalText.substring(0, 30)}...", translated="${translatedText.substring(0, 30)}..."`);
      } else if (originalText) {
        // Same text or English-only, send as single mode
        logger.info(`Emitting single-mode transcript: "${originalText.substring(0, 50)}..."`);
      }
      
      this.emit('final', eventData);
      this.hadSpeech = false;
      this.unknownStreak = 0;
      // Clear buffers
      this.audioChunks = [];
      this.currentSize = 0;
      this.totalDurationMs = 0;
      this.speechFrameCount = 0;
      this.batchStartTime = Date.now();
      this.processing = false;
    } catch (error) {
      logger.error('Error processing audio chunks:', error);
      // On translation-specific errors, they are counted above. For generic errors -> clear buffers to avoid gigantic repeats.
      this.audioChunks = [];
      this.currentSize = 0;
      this.totalDurationMs = 0;
      this.speechFrameCount = 0;
      this.batchStartTime = Date.now();
      this.processing = false;
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
   * Calculate text similarity (0-1) using Levenshtein-based ratio
   * Used to detect if original and translated text are essentially the same (English input)
   */
  _calculateSimilarity(str1, str2) {
    // Quick check for identical strings
    if (str1 === str2) return 1.0;
    
    // Normalize: remove punctuation, extra spaces
    const normalize = (s) => s.replace(/[.,!?;:]/g, '').replace(/\s+/g, ' ').trim();
    const s1 = normalize(str1);
    const s2 = normalize(str2);
    
    if (s1 === s2) return 1.0;
    
    // Calculate Levenshtein distance
    const len1 = s1.length;
    const len2 = s2.length;
    
    if (len1 === 0) return len2 === 0 ? 1.0 : 0.0;
    if (len2 === 0) return 0.0;
    
    const matrix = Array(len2 + 1).fill(null).map(() => Array(len1 + 1).fill(0));
    
    for (let i = 0; i <= len1; i++) matrix[0][i] = i;
    for (let j = 0; j <= len2; j++) matrix[j][0] = j;
    
    for (let j = 1; j <= len2; j++) {
      for (let i = 1; i <= len1; i++) {
        const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j - 1][i] + 1,     // deletion
          matrix[j][i - 1] + 1,     // insertion
          matrix[j - 1][i - 1] + cost // substitution
        );
      }
    }
    
    const distance = matrix[len2][len1];
    const maxLen = Math.max(len1, len2);
    return 1.0 - (distance / maxLen);
  }

  /**
   * Normalize detected language codes to Sarvam -IN variants
   */
  _normalizeLanguageCode(code) {
    if (!code || typeof code !== 'string') return null;
    const c = code.trim();
    // Already a supported code
    if (FALLBACK_LANGUAGE_PRIORITY.includes(c)) return c;
    const lc = c.toLowerCase();
    if (FALLBACK_LANGUAGE_PRIORITY.includes(lc)) return lc;
    const base = lc.split(/[-_]/)[0];
    const map = {
      en: 'en-IN', hi: 'hi-IN', bn: 'bn-IN', kn: 'kn-IN', ml: 'ml-IN', mr: 'mr-IN',
      or: 'od-IN', odi: 'od-IN', od: 'od-IN', pa: 'pa-IN', ta: 'ta-IN', te: 'te-IN', gu: 'gu-IN'
    };
    return map[base] || null;
  }

  /**
   * Convert raw PCM16 to WAV format with proper validation
   * Sarvam API requires: 16kHz, mono, 16-bit PCM, WAV format
   */
  _pcm16ToWav(pcm16Buffer, sampleRate, channels) {
    // Validate input
    if (!Buffer.isBuffer(pcm16Buffer)) {
      throw new Error('PCM buffer must be a Buffer');
    }
    if (pcm16Buffer.length === 0) {
      throw new Error('PCM buffer is empty');
    }
    if (pcm16Buffer.length % 2 !== 0) {
      logger.warn(`PCM buffer length ${pcm16Buffer.length} is odd, truncating last byte`);
      pcm16Buffer = pcm16Buffer.slice(0, pcm16Buffer.length - 1);
    }
    
    // Validate audio parameters (Sarvam requirements)
    if (sampleRate !== 16000) {
      logger.warn(`Sample rate ${sampleRate} Hz is not 16000 Hz (Sarvam optimal)`);
    }
    if (channels !== 1) {
      logger.warn(`Channel count ${channels} is not mono (Sarvam requirement)`);
    }
    
    const dataLength = pcm16Buffer.length;
    const wavHeader = Buffer.alloc(44);

    // RIFF header (bytes 0-11)
    wavHeader.write('RIFF', 0);
    wavHeader.writeUInt32LE(36 + dataLength, 4); // File size - 8
    wavHeader.write('WAVE', 8);
    
    // fmt chunk (bytes 12-35)
    wavHeader.write('fmt ', 12);
    wavHeader.writeUInt32LE(16, 16); // Chunk size (16 for PCM)
    wavHeader.writeUInt16LE(1, 20);  // Audio format (1 = PCM)
    wavHeader.writeUInt16LE(channels, 22); // Number of channels
    wavHeader.writeUInt32LE(sampleRate, 24); // Sample rate
    wavHeader.writeUInt32LE(sampleRate * channels * 2, 28); // Byte rate (sr * ch * bytes/sample)
    wavHeader.writeUInt16LE(channels * 2, 32); // Block align (ch * bytes/sample)
    wavHeader.writeUInt16LE(16, 34); // Bits per sample
    
    // data chunk (bytes 36-43)
    wavHeader.write('data', 36);
    wavHeader.writeUInt32LE(dataLength, 40);

    const wavBuffer = Buffer.concat([wavHeader, pcm16Buffer]);
    
    // Validate WAV output
    const durationSec = dataLength / (sampleRate * channels * 2);
    logger.debug(`WAV created: ${wavBuffer.length} bytes, ${durationSec.toFixed(2)}s, ${sampleRate}Hz, ${channels}ch`);
    
    // Validate minimum duration (Sarvam works best with 1-30s audio)
    if (durationSec < 0.5) {
      logger.warn(`Audio duration ${durationSec.toFixed(2)}s is very short, may not transcribe well`);
    }
    if (durationSec > 30) {
      logger.warn(`Audio duration ${durationSec.toFixed(2)}s exceeds 30s, may hit Sarvam API limits`);
    }
    
    return wavBuffer;
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
