import logger from '../config/logger.js';
import axios from 'axios';

/**
 * Translation Service using Sarvam AI API
 * Supports real-time translation for transcripts between Indian languages and English
 * API Documentation: https://docs.sarvam.ai/api-reference-docs/endpoints/translate
 */

// Supported languages by Sarvam AI
export const SUPPORTED_LANGUAGES = {
  'en-IN': 'English (India)',
  'hi-IN': 'Hindi',
  'bn-IN': 'Bengali',
  'kn-IN': 'Kannada',
  'ml-IN': 'Malayalam',
  'mr-IN': 'Marathi',
  'od-IN': 'Odia',
  'pa-IN': 'Punjabi',
  'ta-IN': 'Tamil',
  'te-IN': 'Telugu',
  'gu-IN': 'Gujarati'
};

// Common Indian languages for auto-detection
const LANGUAGE_PATTERNS = {
  'hi-IN': /[\u0900-\u097F]/, // Devanagari (Hindi, Marathi)
  'bn-IN': /[\u0980-\u09FF]/, // Bengali
  'gu-IN': /[\u0A80-\u0AFF]/, // Gujarati
  'pa-IN': /[\u0A00-\u0A7F]/, // Gurmukhi (Punjabi)
  'ta-IN': /[\u0B80-\u0BFF]/, // Tamil
  'te-IN': /[\u0C00-\u0C7F]/, // Telugu
  'kn-IN': /[\u0C80-\u0CFF]/, // Kannada
  'ml-IN': /[\u0D00-\u0D7F]/, // Malayalam
  'od-IN': /[\u0B00-\u0B7F]/, // Odia
};

const SARVAM_API_KEY = process.env.SARVAM_API_KEY;
const SARVAM_BASE_URL = 'https://api.sarvam.ai';

/**
 * Detect language of text using script patterns
 * @param {string} text - Text to detect language
 * @returns {Promise<string>} - Detected language code
 */
export const detectLanguage = async (text) => {
  try {
    if (!text || text.trim().length === 0) {
      return 'en-IN';
    }

    // Check for Indian language scripts
    for (const [lang, pattern] of Object.entries(LANGUAGE_PATTERNS)) {
      if (pattern.test(text)) {
        logger.debug(`Detected language: ${lang} from script pattern`);
        return lang;
      }
    }

    // Default to English for Latin characters
    logger.debug('Defaulting to English (en-IN) - no Indian script detected');
    return 'en-IN';
  } catch (error) {
    logger.error('Language detection error:', error);
    return 'en-IN'; // Default to English
  }
};

/**
 * Translate text using Sarvam AI Translation API
 * @param {string} text - Text to translate
 * @param {string} targetLang - Target language code (e.g., 'en-IN', 'hi-IN')
 * @param {string} sourceLang - Source language code (optional, will auto-detect)
 * @param {number} retryCount - Internal retry counter (default: 0)
 * @returns {Promise<object>} - Translation result
 */
export const translateText = async (text, targetLang, sourceLang = null, retryCount = 0) => {
  try {
    // Input validation
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return {
        translatedText: text || '',
        detectedLanguage: sourceLang || 'en-IN',
        targetLanguage: targetLang,
        isTranslated: false,
        message: 'Empty or invalid text provided'
      };
    }
    
    // Validate and sanitize text (max 5000 chars per Sarvam API limits)
    const sanitizedText = text.trim().substring(0, 5000);
    if (text.length !== sanitizedText.length) {
      logger.warn(`Text truncated from ${text.length} to ${sanitizedText.length} characters`);
    }

    // Check if Sarvam API key is configured
    if (!SARVAM_API_KEY) {
      logger.warn('Sarvam AI API key not configured');
      return {
        translatedText: sanitizedText,
        detectedLanguage: sourceLang || 'en-IN',
        targetLanguage: targetLang,
        isTranslated: false,
        message: 'Translation service not configured'
      };
    }
    
    // Validate language codes
    if (!SUPPORTED_LANGUAGES[targetLang]) {
      logger.error(`Unsupported target language: ${targetLang}`);
      return {
        translatedText: sanitizedText,
        detectedLanguage: sourceLang || 'en-IN',
        targetLanguage: targetLang,
        isTranslated: false,
        error: `Unsupported target language: ${targetLang}`
      };
    }

    // Auto-detect source language if not provided
    if (!sourceLang) {
      sourceLang = await detectLanguage(sanitizedText);
      logger.debug(`Auto-detected source language: ${sourceLang}`);
    }
    
    // Validate source language
    if (!SUPPORTED_LANGUAGES[sourceLang]) {
      logger.warn(`Unsupported source language: ${sourceLang}, defaulting to en-IN`);
      sourceLang = 'en-IN';
    }

    // If source and target are the same, no translation needed
    if (sourceLang === targetLang) {
      return {
        translatedText: sanitizedText,
        detectedLanguage: sourceLang,
        targetLanguage: targetLang,
        isTranslated: false
      };
    }

    // Call Sarvam AI Translation API
    logger.info(`Translating text from ${sourceLang} to ${targetLang}: "${sanitizedText.substring(0, 50)}..."`);
    
    const response = await axios.post(
      `${SARVAM_BASE_URL}/translate`,
      {
        input: sanitizedText,
        source_language_code: sourceLang,
        target_language_code: targetLang,
        speaker_gender: 'Female', // Optional: can be parameterized
        mode: 'formal', // Optional: 'formal' or 'casual'
        model: 'mayura:v1',
        enable_preprocessing: true // ACCURACY FIX: Enable text preprocessing for better translation quality
      },
      {
        headers: {
          'api-subscription-key': SARVAM_API_KEY,
          'Content-Type': 'application/json'
        },
        timeout: 10000 // 10 second timeout
      }
    );

    const translatedText = response.data.translated_text || response.data.output;

    if (!translatedText) {
      throw new Error('No translation returned from Sarvam API');
    }

    logger.info(`Translation successful: "${translatedText.substring(0, 50)}..."`);

    return {
      translatedText: translatedText,
      detectedLanguage: sourceLang,
      targetLanguage: targetLang,
      isTranslated: true,
      confidence: 1.0,
      provider: 'sarvam'
    };

  } catch (error) {
    const isRateLimit = error.response?.status === 429;
    const isTimeout = error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT';
    const isServerError = error.response?.status >= 500;
    const shouldRetry = (isRateLimit || isTimeout || isServerError) && retryCount < 3;
    
    logger.error('Sarvam translation error:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status,
      code: error.code,
      retryCount,
      willRetry: shouldRetry
    });
    
    // Retry with exponential backoff for transient errors
    if (shouldRetry) {
      const delayMs = isRateLimit ? 2000 * (retryCount + 1) : 1000 * Math.pow(2, retryCount);
      logger.warn(`Retrying translation after ${delayMs}ms (attempt ${retryCount + 1}/3)`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
      return translateText(text, targetLang, sourceLang, retryCount + 1);
    }
    
    // Fallback: return original text
    return {
      translatedText: text,
      detectedLanguage: sourceLang || 'en-IN',
      targetLanguage: targetLang,
      isTranslated: false,
      error: error.message
    };
  }
};

/**
 * Translate multiple segments (batch translation)
 * Note: Sarvam AI doesn't have a native batch endpoint, so we translate sequentially
 * @param {Array} segments - Array of text segments
 * @param {string} targetLang - Target language code
 * @param {string} sourceLang - Source language code (optional)
 * @returns {Promise<Array>} - Array of translation results
 */
export const translateBatch = async (segments, targetLang, sourceLang = null) => {
  try {
    if (!SARVAM_API_KEY) {
      return segments.map(text => ({
        originalText: text,
        translatedText: text,
        isTranslated: false,
        message: 'Translation service not configured'
      }));
    }

    logger.info(`Batch translating ${segments.length} segments to ${targetLang}`);

    // Translate each segment sequentially
    // In production, consider implementing proper rate limiting and concurrency control
    const results = [];
    
    for (let i = 0; i < segments.length; i++) {
      const text = segments[i];
      
      if (!text || text.trim().length === 0) {
        results.push({
          originalText: text,
          translatedText: text,
          isTranslated: false
        });
        continue;
      }

      try {
        const result = await translateText(text, targetLang, sourceLang);
        results.push({
          originalText: text,
          translatedText: result.translatedText,
          detectedLanguage: result.detectedLanguage,
          isTranslated: result.isTranslated
        });
        
        // Small delay to avoid rate limiting (adjust based on your API tier)
        if (i < segments.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (error) {
        logger.error(`Error translating segment ${i}:`, error);
        results.push({
          originalText: text,
          translatedText: text,
          isTranslated: false,
          error: error.message
        });
      }
    }

    logger.info(`Batch translation complete: ${results.filter(r => r.isTranslated).length}/${segments.length} successful`);
    return results;

  } catch (error) {
    logger.error('Batch translation error:', error);
    return segments.map(text => ({
      originalText: text,
      translatedText: text,
      isTranslated: false,
      error: error.message
    }));
  }
};

/**
 * Get supported languages list
 * @returns {object} - Object with language codes and names
 */
export const getSupportedLanguages = () => {
  return SUPPORTED_LANGUAGES;
};

export default {
  detectLanguage,
  translateText,
  translateBatch,
  getSupportedLanguages,
  SUPPORTED_LANGUAGES
};
