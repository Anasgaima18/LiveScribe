/**
 * Sarvam AI Production Configuration
 * Industry-level settings for real-time transcription
 * Based on official Sarvam AI API documentation
 */

// Audio Quality Standards (per Sarvam recommendations)
export const AUDIO_SPECS = {
  SAMPLE_RATE: 16000,          // 16kHz required
  CHANNELS: 1,                  // Mono required
  BIT_DEPTH: 16,               // 16-bit PCM
  FORMAT: 'wav',                // WAV preferred for quality
  MIN_DURATION_MS: 100,         // Minimum viable audio
  MAX_DURATION_MS: 30000,       // 30s Sarvam limit for realtime
  OPTIMAL_DURATION_MS: 5000,    // 5s optimal for quality/latency balance
};

// Voice Activity Detection (Industry Standard)
export const VAD_CONFIG = {
  RMS_THRESHOLD: 50,            // Ultra-sensitive for quiet speech
  ENERGY_FLOOR: 30,             // Absolute minimum energy
  SPEECH_THRESHOLD_DB: -35,     // dB threshold for speech
  SILENCE_THRESHOLD_DB: -45,    // dB threshold for silence
  MIN_SPEECH_FRAMES: 3,         // Minimum frames for valid speech
  MAX_SILENCE_FRAMES: 5,        // Max silence before flush
  HANGOVER_FRAMES: 2,           // Frames to include after speech ends
};

// Audio Normalization (Sarvam-optimized)
export const NORMALIZATION_CONFIG = {
  TARGET_RMS: 7000,             // Target RMS (~-13dB, optimal for Sarvam)
  TARGET_DB: -13,               // Target dB level
  MIN_RMS_FOR_NORM: 3000,       // Normalize below -22dB
  MAX_AMPLIFICATION: 5.0,       // Conservative max gain
  SECOND_PASS_FACTOR: 1.5,      // Second pass amplification
  CLIPPING_THRESHOLD: 32767,    // Int16 max to prevent distortion
  NOISE_FLOOR: 100,             // Below this is considered noise
};

// Language Detection Strategy
export const LANGUAGE_DETECTION = {
  // Primary detection method
  PREFLIGHT_ENABLED: true,
  PREFLIGHT_DURATION: 1.6,      // Seconds for initial detection
  PREFLIGHT_MODEL: 'saaras:v2.5', // Domain-aware speech translation with auto LIDch translation with built-in LID
  
  // Multi-language testing (OPTIMIZED for speed)
  // Saarika v2.5 supports: en-IN, hi-IN, bn-IN, ta-IN, te-IN, gu-IN, kn-IN, ml-IN, mr-IN, pa-IN, od-IN
  // Use 'unknown' for automatic language detection
  MAX_LANGUAGES_ACCURACY: 11,   // Test all 11 supported languages for maximum accuracy
  MAX_LANGUAGES_SPEED: 2,       // REDUCED: Only test top 2 for speed (en-IN + cached)
  MAX_LANGUAGES_BALANCED: 4,    // REDUCED: Test 4 for balanced mode
  
  // Early exit thresholds (MORE AGGRESSIVE)
  EXCEPTIONAL_SCORE: 180,       // LOWERED: Exit early if confidence is good
  SHORT_UTTERANCE_SCORE: 150,   // LOWERED: Accept shorter phrases faster
  ENGLISH_FAST_PATH_SCORE: 140, // LOWERED: English-specific threshold
  MIN_WORDS_SHORT: 1,           // REDUCED: Allow single-word early exit
  MIN_WORDS_EXCEPTIONAL: 4,     // REDUCED: Minimum words for exceptional
  
  // Script validation bonuses
  SCRIPT_MATCH_BONUS: 35,       // Bonus for script alignment
  ASCII_RATIO_THRESHOLD: 0.9,   // English ASCII ratio
  
  // Retry configuration (MORE AGGRESSIVE - LESS WAITING)
  RETRY_ON_EMPTY: false,        // DISABLED: Don't retry empty results (wastes time)
  RETRY_DELAY_MS: 300,          // REDUCED: Faster retry if enabled
  EMPTY_BREAK_THRESHOLD: 2,     // REDUCED: Stop after 2 empties instead of 4
  
  // Priority languages (tested first)
  PRIORITY_ORDER: ['en-IN', 'hi-IN', 'te-IN', 'ta-IN'],
  
  // SMART CACHING: Remember last successful language per session
  USE_LAST_LANGUAGE_CACHE: true,
  CACHE_CONFIDENCE_THRESHOLD: 150, // Only cache if quality score > 150
};

// Quality Scoring Weights
export const QUALITY_WEIGHTS = {
  WORD_COUNT: 20,               // Per word score
  CHAR_COUNT: 0.8,              // Per character score
  AVG_WORD_LENGTH: 5,           // Per unit of average length
  VALID_WORD_LENGTH_BONUS: 35,  // 3-15 char average
  CAPITALIZATION_BONUS: 25,     // Proper capitalization (English)
  NO_REPEAT_BONUS: 30,          // No excessive repetition
  LENGTH_BONUS: 15,             // Non-empty bonus
  LONG_TRANSCRIPT_BONUS: 25,    // 8+ words
  LONG_CHAR_BONUS: 20,          // 50+ characters
  
  // Penalties
  SINGLE_LONG_WORD_PENALTY: 0.3,  // Multiply by this
  UNUSUAL_LENGTH_PENALTY: 0.4,    // Word length out of range
  FEW_WORDS_MANY_CHARS_PENALTY: 0.2, // Gibberish pattern
  REPEATED_CHARS_PENALTY: 0.1,    // "aaaaa" pattern
  CONSONANT_CLUSTER_PENALTY: 0.1, // Too many consonants
};

// Batching Strategy (Industry Best Practices - TUNED FOR LOW LATENCY)
export const BATCHING_CONFIG = {
  // Duration-based (REDUCED for realtime feel)
  MIN_BATCH_DURATION_MS: 1200,  // ~1.2s minimum for realtime
  MAX_BATCH_DURATION_MS: 15000, // 15s hard cap
  ESCALATED_DURATION_MS: 800,   // 0.8s when quality is low
  
  // Size-based (REDUCED for faster flush)
  MIN_FLUSH_BYTES: 40000,       // ~1.2s @ 16kHz mono
  ESCALATED_FLUSH_BYTES: 24000, // ~0.7s for quick retry
  MAX_BATCH_BYTES: 400000,      // ~12s @ 16kHz mono
  
  // Quality gates (RELAXED for short utterances)
  MIN_SPEECH_FRAMES: 2,         // Minimum speech frames
  MIN_WORD_COUNT: 1,            // Minimum words to accept
  
  // Adaptive backoff
  EMPTY_BATCH_BACKOFF_MS: 300,  // Initial backoff
  MAX_EMPTY_BACKOFF_MS: 1500,   // Maximum backoff
  DEFER_RETRY_MARGIN_MS: 100,   // Margin before retry
};

// API Request Configuration
export const API_CONFIG = {
  // Models (per Sarvam docs - Latest versions)
  STT_MODEL: 'saarika:v2.5',    // Flagship STT model with superior accuracy
  STT_TRANSLATE_MODEL: 'saaras:v2.5', // Domain-aware speech translation
  TRANSLATE_MODEL: 'mayura:v1', // Text translation
  TTS_MODEL: 'bulbul:v2',       // Text-to-speech
  
  // Request settings
  TIMEOUT_MS: 60000,            // 60s timeout
  RETRY_COUNT: 3,               // Max retries
  RETRY_DELAY_BASE_MS: 1000,    // Base retry delay
  RATE_LIMIT_DELAY_MS: 2000,    // 429 delay
  API_DELAY_MS: 80,             // Inter-request delay (12 req/s)
  
  // Preprocessing
  ENABLE_PREPROCESSING: true,   // Always enable for quality
  WITH_TIMESTAMPS: false,       // Disable for lower latency
  
  // Translate settings
  TRANSLATE_MODE: 'formal',     // formal|casual
  TRANSLATE_GENDER: 'Female',   // Speaker gender hint
  
  // Guards
  ENABLE_TT_GUARD: true,        // Low-confidence fallback
  TT_GUARD_MIN_WORDS: 4,        // Trigger below this
  TT_GUARD_MIN_SIMILARITY: 0.2, // Trigger below this
};

// Performance Monitoring
export const MONITORING_CONFIG = {
  ENABLE_METRICS: true,
  TRACK_LATENCY: true,
  TRACK_ACCURACY: true,
  TRACK_API_ERRORS: true,
  LOG_AUDIO_QUALITY: true,
  LOG_LANGUAGE_SCORES: true,
  
  // Thresholds for alerts
  MAX_LATENCY_MS: 8000,         // Alert if batch takes > 8s
  MIN_SUCCESS_RATE: 0.95,       // Alert if < 95% success
  MAX_EMPTY_RATE: 0.1,          // Alert if > 10% empty
};

// Mode Presets
export const MODES = {
  ACCURACY: {
    name: 'accuracy',
    maxLanguages: LANGUAGE_DETECTION.MAX_LANGUAGES_ACCURACY,
    minBatchDuration: BATCHING_CONFIG.MIN_BATCH_DURATION_MS,
    earlyExitScore: LANGUAGE_DETECTION.EXCEPTIONAL_SCORE,
    enablePreflight: true,
    enableTTGuard: true,
  },
  BALANCED: {
    name: 'balanced',
    maxLanguages: LANGUAGE_DETECTION.MAX_LANGUAGES_BALANCED,
    minBatchDuration: 4000,
    earlyExitScore: LANGUAGE_DETECTION.SHORT_UTTERANCE_SCORE,
    enablePreflight: true,
    enableTTGuard: true,
  },
  SPEED: {
    name: 'speed',
    maxLanguages: LANGUAGE_DETECTION.MAX_LANGUAGES_SPEED,
    minBatchDuration: 1000, // Ultra-fast 1s batches
    earlyExitScore: LANGUAGE_DETECTION.ENGLISH_FAST_PATH_SCORE,
    enablePreflight: false, // DISABLED: Skip preflight for maximum speed
    enableTTGuard: false,
    retryOnEmpty: false, // DISABLED: No retries in speed mode
  },
};

// Environment variable mapping with defaults
export function getConfig() {
  const mode = process.env.SARVAM_LATENCY_MODE || 'accuracy';
  const preset = MODES[mode.toUpperCase()] || MODES.ACCURACY;
  
  return {
    // Audio
    audioSpecs: AUDIO_SPECS,
    vad: VAD_CONFIG,
    normalization: NORMALIZATION_CONFIG,
    
    // Language detection
    preflight: {
      enabled: process.env.SARVAM_PREFLIGHT_DETECT !== 'false',
      duration: parseFloat(process.env.SARVAM_PREFLIGHT_SECONDS || LANGUAGE_DETECTION.PREFLIGHT_DURATION),
      model: process.env.SARVAM_PREFLIGHT_MODEL || LANGUAGE_DETECTION.PREFLIGHT_MODEL,
    },
    
    maxLanguages: parseInt(process.env.MAX_LANGUAGES_TO_TEST || preset.maxLanguages),
    earlyExitScore: parseInt(process.env.EARLY_EXIT_STRICT_SCORE || preset.earlyExitScore),
    
    // Batching
    batching: {
      minDuration: parseInt(process.env.MIN_BATCH_DURATION_MS || preset.minBatchDuration),
      maxDuration: parseInt(process.env.MAX_BATCH_DURATION_MS || BATCHING_CONFIG.MAX_BATCH_DURATION_MS),
      minBytes: parseInt(process.env.MIN_FLUSH_BYTES || BATCHING_CONFIG.MIN_FLUSH_BYTES),
      maxBytes: parseInt(process.env.MAX_BATCH_BYTES || BATCHING_CONFIG.MAX_BATCH_BYTES),
    },
    
    // API
    api: {
      sttModel: process.env.SARVAM_STT_MODEL || API_CONFIG.STT_MODEL,
      translateModel: process.env.SARVAM_TRANSLATE_MODEL || API_CONFIG.TRANSLATE_MODEL,
      enablePreprocessing: process.env.SARVAM_ENABLE_PREPROCESSING !== 'false',
      timeout: parseInt(process.env.SARVAM_TIMEOUT_MS || API_CONFIG.TIMEOUT_MS),
      apiDelay: parseInt(process.env.SARVAM_API_DELAY_MS || API_CONFIG.API_DELAY_MS),
    },
    
    // Guards
    enableTTGuard: process.env.SARVAM_ENABLE_TT_GUARD !== 'false' && preset.enableTTGuard,
    emptyBreakThreshold: parseInt(process.env.EMPTY_BREAK_THRESHOLD || LANGUAGE_DETECTION.EMPTY_BREAK_THRESHOLD),
    
    // Monitoring
    monitoring: MONITORING_CONFIG,
    
    // Mode
    mode: preset.name,
  };
}

export default {
  AUDIO_SPECS,
  VAD_CONFIG,
  NORMALIZATION_CONFIG,
  LANGUAGE_DETECTION,
  QUALITY_WEIGHTS,
  BATCHING_CONFIG,
  API_CONFIG,
  MONITORING_CONFIG,
  MODES,
  getConfig,
};
