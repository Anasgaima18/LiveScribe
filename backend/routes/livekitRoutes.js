import express from 'express';
import { getToken } from '../controllers/livekitController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.get('/token', protect, getToken);

export default router;
