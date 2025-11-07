import express from 'express';
import { getToken } from '../controllers/livekitController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.get('/token', protect, getToken);

// Diagnostic endpoint to check transcription configuration
router.get('/transcription/config', protect, (req, res) => {
  res.json({
    provider: process.env.TRANSCRIPTION_PROVIDER || 'not_set',
    apiKeyConfigured: !!process.env.SARVAM_API_KEY,
    apiKeyLength: process.env.SARVAM_API_KEY?.length || 0,
  });
});

export default router;
