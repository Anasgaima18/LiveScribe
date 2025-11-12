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
   * Validate audio buffer size
   */
  _validateAudioSize(audioBuffer) {
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
   * @param {Object} options - Override language, model, timestamps
   * @returns {Promise<Object>} { transcript, language, timestamp }
   */
  async transcribe(audioBuffer, options = {}) {
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
      
      // Create readable stream from buffer
      const audioStream = Readable.from(audioBuffer);
      form.append('file', audioStream, {
        filename: 'audio.wav',
        contentType: 'audio/wav',
      });

      // Language code (hi-IN, en-IN, etc.) and model per Sarvam API (multipart fields)
      const languageCode = this._validateLanguage(options.language || this.language);
      
      // Log request details
      logger.info(`Sarvam transcribe request: size=${audioBuffer.length} bytes, language=${languageCode}`);
      
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
    // Enhanced VAD / filtering configuration - ULTRA-SENSITIVE for real-time
    this.minRmsInt16 = parseInt(process.env.MIN_RMS_INT16) || options.minRms || 80; // Very sensitive - catch all speech
    this.maxSilenceChunks = options.maxSilenceChunks || 5; // Very fast flush on silence (instant response)
    this.silenceCount = 0;
    this.lastTranscript = '';
    this.lastTranscriptTime = 0;
    this.duplicateWindowMs = options.duplicateWindowMs || 3000; // suppress duplicates within 3s
    this.genericFillers = options.genericFillers || ['yes', 'yeah', 'ya', 'ok', 'okay', 'hmm', 'uh', 'um'];
    this.hadSpeech = false;
  this.minFlushBytes = options.minFlushBytes || 64000; // ~2s @ 16kHz (32000 samples) - Balanced for sequential API calls
    
    // Batching configuration - REAL-TIME with rate limit protection
    this.minBatchDurationMs = parseInt(process.env.MIN_BATCH_DURATION_MS) || 2000; // min 2s batch allows sequential language testing
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
    // Multi-language detection settings - BALANCED for rate limits
    // Default to 5 languages (covers 80%+ users) to avoid rate limit issues
    // Can be increased to 11 for maximum coverage if rate limits allow
    this.maxLanguagesToTest = parseInt(process.env.MAX_LANGUAGES_TO_TEST) || 5; // Test 5 most common languages (Hi, En, Te, Ta, Mr)
    // Hard caps to prevent runaway accumulation - Sarvam API has 30s limit for realtime endpoint
    // Use 25s to leave margin for processing delays and network latency
    this.maxBatchDurationMs = parseInt(process.env.MAX_BATCH_DURATION_MS) || 25000; // 25s hard cap (Sarvam limit: 30s)
    this.maxBatchBytes = parseInt(process.env.MAX_BATCH_BYTES) || (16000 * 2 * 25); // ≈800000 bytes @ 16kHz mono 25s
    // Translation error tracking / degradation
    this.translateErrorCount = 0;
    this.maxTranslateErrors = parseInt(process.env.MAX_TRANSLATE_ERRORS) || 3;
    this.degradedTranslate = false; // when true skip translate endpoint
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

      // Aggregate RMS gate
      const samples = new Int16Array(audioBuffer.buffer, audioBuffer.byteOffset, audioBuffer.length / 2);
      if (samples.length > 0) {
        let sum = 0, peak = 0;
        for (let i = 0; i < samples.length; i++) {
          const v = Math.abs(samples[i]);
          sum += v * v;
          if (v > peak) peak = v;
        }
        const aggRms = Math.sqrt(sum / samples.length);
        if (aggRms < this.minRmsInt16) {
          logger.debug(`Skipping STT call: aggregate RMS ${aggRms.toFixed(0)} below ${this.minRmsInt16}`);
          this.processing = false;
          this.hadSpeech = false;
          // keep buffer for potential accumulation (do not clear)
          return;
        }
      }

      const wavBuffer = this._pcm16ToWav(audioBuffer, 16000, 1);
      logger.debug(`[Batch ${batchId}] Converted to WAV: ${wavBuffer.length} bytes from ${audioBuffer.length} bytes PCM`);
      
      // Calculate audio quality metrics
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
      logger.info(`[Batch ${batchId}] Audio quality - RMS: ${rms.toFixed(0)} (${rmsDb.toFixed(1)} dB), Peak: ${peak}, Non-zero: ${nonZeroPercent}%, Samples: ${qualitySamples.length}`);

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
      
      // Multilingual dual-mode: when language is 'auto', get BOTH original and translated text
      const dualMode = this.language === 'auto' && process.env.MULTILINGUAL_MODE !== 'false';
      
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
            const languagesToTry = FALLBACK_LANGUAGE_PRIORITY.slice(0, numLanguages);
            logger.info(`[Batch ${batchId}] Testing ${numLanguages} languages: ${languagesToTry.join(', ')}`);
            
            // SEQUENTIAL language testing with rate limit handling (prevents 429 errors)
            // Test languages one-by-one with delays to respect API rate limits
            const allResults = [];
            const delayBetweenRequests = parseInt(process.env.SARVAM_API_DELAY_MS) || 150; // 150ms delay = max 6-7 req/s
            
            for (let i = 0; i < languagesToTry.length; i++) {
              const lang = languagesToTry[i];
              
              try {
                // Add delay between requests (except first one)
                if (i > 0) {
                  await new Promise(resolve => setTimeout(resolve, delayBetweenRequests));
                }
                
                const langResult = await this.sttClient.transcribe(wavBuffer, { language: lang, withTimestamps: false });
                const transcript = (langResult.transcript || '').trim();
                
                // Calculate quality score - SIMPLIFIED for speed
                const words = transcript.split(/\s+/).filter(w => w.length > 0);
                const wordCount = words.length;
                const charCount = transcript.length;
                
                // SPEED-OPTIMIZED quality score - simple linear formula
                // Formula: (words × 10) + (chars × 0.3) + bonus
                // Fast calculation, no exponential math
                const qualityScore = (wordCount * 10) + (charCount * 0.3) + (transcript.length > 0 ? 20 : 0);
                
                logger.debug(`[Batch ${batchId}] ${lang} result: "${transcript.substring(0, 50)}..." (words: ${wordCount}, chars: ${charCount}, quality: ${qualityScore.toFixed(0)})`);
                
                allResults.push({
                  language: lang,
                  transcript: transcript,
                  wordCount: wordCount,
                  charCount: charCount,
                  qualityScore: qualityScore
                });
                
                // EARLY EXIT: If we find a high-quality result, stop testing more languages
                // This saves API calls and reduces latency significantly
                if (qualityScore >= 100 && wordCount >= 5) {
                  logger.info(`[Batch ${batchId}] Found high-quality match for ${lang} (quality: ${qualityScore.toFixed(0)}), stopping early`);
                  break;
                }
                
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
                    const qualityScore = (wordCount * 10) + (charCount * 0.3) + (transcript.length > 0 ? 20 : 0);
                    
                    allResults.push({
                      language: lang,
                      transcript: transcript,
                      wordCount: wordCount,
                      charCount: charCount,
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
                  qualityScore: 0
                });
              }
            }
            
            // Filter out empty results and sort by quality score
            const validResults = allResults.filter(r => r.transcript.length > 0);
            validResults.sort((a, b) => b.qualityScore - a.qualityScore);
            
            if (validResults.length === 0) {
              throw new Error('All language detection attempts returned empty transcripts');
            }
            
            // Pick the best result
            const bestResult = validResults[0];
            originalText = bestResult.transcript;
            detectedLang = bestResult.language;
            
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
            
            // Final fallback: try fallback language directly
            try {
              logger.info(`[Batch ${batchId}] Final fallback to ${this.fallbackLanguage}`);
              result = await this.sttClient.transcribe(wavBuffer, { language: this.fallbackLanguage, withTimestamps: false });
              result.language = result.language || this.fallbackLanguage;
              originalText = result.transcript;
              translatedText = null;
            } catch (fallbackError) {
              logger.error(`[Batch ${batchId}] Final fallback failed: ${fallbackError.message}`);
              if (this.translateErrorCount >= this.maxTranslateErrors) {
                this.degradedTranslate = true;
                logger.warn('Max translate errors reached; degrading translation mode');
              }
              throw fallbackError;
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
