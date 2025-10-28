import express from 'express';
import { protect } from '../middleware/auth.js';
import { translateText, translateBatch, getSupportedLanguages } from '../utils/translationService.js';
import logger from '../config/logger.js';

const router = express.Router();

/**
 * @route   GET /api/translation/languages
 * @desc    Get supported languages
 * @access  Public
 */
router.get('/languages', (req, res) => {
  try {
    const languages = getSupportedLanguages();
    res.json({
      success: true,
      languages,
      count: Object.keys(languages).length
    });
  } catch (error) {
    logger.error('Error fetching languages:', error);
    res.status(500).json({ message: 'Failed to fetch supported languages' });
  }
});

/**
 * @route   POST /api/translation/translate
 * @desc    Translate single text
 * @access  Private
 */
router.post('/translate', protect, async (req, res) => {
  try {
    const { text, targetLang, sourceLang } = req.body;

    if (!text || !targetLang) {
      return res.status(400).json({ message: 'Text and target language are required' });
    }

    const result = await translateText(text, targetLang, sourceLang);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    logger.error('Translation error:', error);
    res.status(500).json({ message: 'Translation failed', error: error.message });
  }
});

/**
 * @route   POST /api/translation/batch
 * @desc    Translate multiple texts
 * @access  Private
 */
router.post('/batch', protect, async (req, res) => {
  try {
    const { texts, targetLang } = req.body;

    if (!texts || !Array.isArray(texts) || texts.length === 0) {
      return res.status(400).json({ message: 'Texts array is required' });
    }

    if (!targetLang) {
      return res.status(400).json({ message: 'Target language is required' });
    }

    if (texts.length > 128) {
      return res.status(400).json({ message: 'Maximum 128 texts allowed per batch' });
    }

    const results = await translateBatch(texts, targetLang);

    res.json({
      success: true,
      translations: results,
      count: results.length
    });
  } catch (error) {
    logger.error('Batch translation error:', error);
    res.status(500).json({ message: 'Batch translation failed', error: error.message });
  }
});

export default router;
