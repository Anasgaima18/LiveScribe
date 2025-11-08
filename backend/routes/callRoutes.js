import express from 'express';
import {
  createCall,
  endCall,
  saveTranscript,
  getTranscripts,
  summarizeCall,
  getAlerts,
  getUserCalls
} from '../controllers/callController.js';
import { protect } from '../middleware/auth.js';
import { validate, createCallSchema, transcriptSchema } from '../middleware/validation.js';

const router = express.Router();

router.post('/', protect, validate(createCallSchema), createCall);
router.get('/', protect, getUserCalls);
router.put('/:callId/end', protect, endCall);
router.post('/:callId/transcripts', protect, validate(transcriptSchema), saveTranscript);
router.get('/:callId/transcripts', protect, getTranscripts);
router.post('/:callId/summarize', protect, summarizeCall);
router.get('/:callId/alerts', protect, getAlerts);

export default router;
