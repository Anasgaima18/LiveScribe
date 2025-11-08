import express from 'express';
import { register, login, getUsers, getMe } from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';
import { validate, registerSchema, loginSchema } from '../middleware/validation.js';

const router = express.Router();

router.post('/register', validate(registerSchema), register);
router.post('/login', validate(loginSchema), login);
router.get('/users', protect, getUsers);
router.get('/me', protect, getMe);

export default router;
