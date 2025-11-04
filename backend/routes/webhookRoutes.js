import express from 'express';
import { livekitWebhook } from '../controllers/webhookController.js';

const router = express.Router();

// LiveKit Webhook endpoint
// Configure in LiveKit Cloud: POST https://<your-backend>/api/webhooks/livekit
router.post('/livekit', express.json({ type: '*/*' }), livekitWebhook);

export default router;
