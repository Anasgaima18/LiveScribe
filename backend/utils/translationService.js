import logger from '../config/logger.js';

/**
 * Translation Service using Google Translate API
 * Supports real-time translation for transcripts and UI
 */

// Supported languages
export const SUPPORTED_LANGUAGES = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  zh: 'Chinese (Simplified)',
  ja: 'Japanese',
  ko: 'Korean',
  ar: 'Arabic',
  hi: 'Hindi',
  pt: 'Portuguese',
  ru: 'Russian',
  it: 'Italian',
  tr: 'Turkish',
  nl: 'Dutch',
  pl: 'Polish'
};

/**
 * Detect language of text
 * @param {string} text - Text to detect language
 * @returns {Promise<string>} - Detected language code
 */
export const detectLanguage = async (text) => {
  try {
    // Using a simple heuristic approach for demo
    // In production, use Google Cloud Translation API
    
    // Check for common patterns
    const patterns = {
      ar: /[\u0600-\u06FF]/,
      zh: /[\u4E00-\u9FFF]/,
      ja: /[\u3040-\u309F\u30A0-\u30FF]/,
      ko: /[\uAC00-\uD7AF]/,
      ru: /[\u0400-\u04FF]/,
      hi: /[\u0900-\u097F]/
    };

    for (const [lang, pattern] of Object.entries(patterns)) {
      if (pattern.test(text)) {
        return lang;
      }
    }

    // Default to English for Latin characters
    return 'en';
  } catch (error) {
    logger.error('Language detection error:', error);
    return 'en'; // Default to English
  }
};

/**
 * Translate text to target language
 * @param {string} text - Text to translate
 * @param {string} targetLang - Target language code
 * @param {string} sourceLang - Source language code (optional)
 * @returns {Promise<object>} - Translation result
 */
export const translateText = async (text, targetLang, sourceLang = null) => {
  try {
    // Check if Google Translate API key is configured
    const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY;
    
    if (!apiKey) {
      logger.warn('Google Translate API key not configured');
      return {
        translatedText: text,
        detectedLanguage: sourceLang || 'en',
        targetLanguage: targetLang,
        isTranslated: false,
        message: 'Translation service not configured'
      };
    }

    // Auto-detect source language if not provided
    if (!sourceLang) {
      sourceLang = await detectLanguage(text);
    }

    // If source and target are the same, no translation needed
    if (sourceLang === targetLang) {
      return {
        translatedText: text,
        detectedLanguage: sourceLang,
        targetLanguage: targetLang,
        isTranslated: false
      };
    }

    // Call Google Cloud Translation API
    const url = `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        q: text,
        target: targetLang,
        source: sourceLang,
        format: 'text'
      })
    });

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error.message);
    }

    return {
      translatedText: data.data.translations[0].translatedText,
      detectedLanguage: data.data.translations[0].detectedSourceLanguage || sourceLang,
      targetLanguage: targetLang,
      isTranslated: true,
      confidence: 1.0
    };

  } catch (error) {
    logger.error('Translation error:', error);
    
    // Fallback: return original text
    return {
      translatedText: text,
      detectedLanguage: sourceLang || 'en',
      targetLanguage: targetLang,
      isTranslated: false,
      error: error.message
    };
  }
};

/**
 * Translate multiple segments (batch translation)
 * @param {Array} segments - Array of text segments
 * @param {string} targetLang - Target language code
 * @returns {Promise<Array>} - Array of translation results
 */
export const translateBatch = async (segments, targetLang) => {
  try {
    const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY;
    
    if (!apiKey) {
      return segments.map(text => ({
        originalText: text,
        translatedText: text,
        isTranslated: false
      }));
    }

    // Batch translate (Google API supports up to 128 text segments)
    const url = `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        q: segments,
        target: targetLang,
        format: 'text'
      })
    });

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error.message);
    }

    return segments.map((originalText, index) => ({
      originalText,
      translatedText: data.data.translations[index].translatedText,
      detectedLanguage: data.data.translations[index].detectedSourceLanguage,
      isTranslated: true
    }));

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
