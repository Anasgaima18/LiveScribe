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
router.get('/transcription/config', protect, async (req, res) => {
  try {
    // Import getSupportedLanguages dynamically
    const { getSupportedLanguages } = await import('../utils/transcription/sarvamWebSocketClient.js');
    
    res.json({
      provider: 'websocket',
      mode: 'sarvam-websocket-streaming',
      apiKeyConfigured: !!process.env.SARVAM_API_KEY,
      useWebSocket: true,
      model: process.env.SARVAM_STT_MODEL || 'saarika:v2.5',
      defaultLanguage: process.env.SARVAM_DEFAULT_LANGUAGE || 'en-IN',
      supportedLanguages: getSupportedLanguages(),
      expectedLatency: '< 100ms'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
