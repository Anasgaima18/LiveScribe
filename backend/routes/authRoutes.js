import express from 'express';
import { register, login, getUsers, getMe } from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.get('/users', protect, getUsers);
router.get('/me', protect, getMe);

export default router;
