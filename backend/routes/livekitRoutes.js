import express from 'express';
import { 
  getToken,
  startTranscription,
  stopTranscription,
  sendAudioChunk,
  getTranscriptionMetrics
} from '../controllers/livekitController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.get('/token', protect, getToken);

// WebSocket transcription endpoints
router.post('/transcription/start', protect, startTranscription);
router.post('/transcription/stop', protect, stopTranscription);
router.post('/transcription/audio', protect, sendAudioChunk);
router.get('/transcription/:sessionId/metrics', protect, getTranscriptionMetrics);

// Diagnostic endpoint to check transcription configuration
router.get('/transcription/config', protect, (req, res) => {
  res.json({
    provider: 'websocket',
    mode: 'sarvam-websocket-streaming',
    apiKeyConfigured: !!process.env.SARVAM_API_KEY,
    useWebSocket: true,
    model: process.env.SARVAM_STT_MODEL || 'saarika:v2.5',
    defaultLanguage: process.env.SARVAM_DEFAULT_LANGUAGE || 'en-IN',
    expectedLatency: '< 100ms'
  });
});

export default router;
