import express from 'express';
import { protect } from '../middleware/auth.js';
import {
  adminLogin,
  getDashboardStats,
  getAllUsers,
  getActiveSessions,
  getCallAnalytics,
  getAlertAnalytics,
  manageUser
} from '../controllers/adminController.js';
import { runHealthChecks } from '../utils/healthCheck.js';

const router = express.Router();

// Middleware to check if user is admin
const adminOnly = (req, res, next) => {
  if (req.user && req.user.type === 'admin') {
    req.admin = req.user;
    next();
  } else {
    res.status(403).json({ message: 'Access denied. Admin only.' });
  }
};

/**
 * @route   POST /api/admin/auth/login
 * @desc    Admin login
 * @access  Public
 */
router.post('/auth/login', adminLogin);

/**
 * @route   GET /api/admin/stats
 * @desc    Get dashboard statistics
 * @access  Admin
 */
router.get('/stats', protect, adminOnly, getDashboardStats);

/**
 * @route   GET /api/admin/users
 * @desc    Get all users with pagination and filters
 * @access  Admin
 */
router.get('/users', protect, adminOnly, getAllUsers);

/**
 * @route   PUT /api/admin/users/:userId
 * @desc    Manage user (ban, unban, delete)
 * @access  Admin
 */
router.put('/users/:userId', protect, adminOnly, manageUser);

/**
 * @route   GET /api/admin/sessions/active
 * @desc    Get active sessions (ongoing calls)
 * @access  Admin
 */
router.get('/sessions/active', protect, adminOnly, getActiveSessions);

/**
 * @route   GET /api/admin/analytics/calls
 * @desc    Get call analytics
 * @access  Admin
 */
router.get('/analytics/calls', protect, adminOnly, getCallAnalytics);

/**
 * @route   GET /api/admin/analytics/alerts
 * @desc    Get alert analytics
 * @access  Admin
 */
router.get('/analytics/alerts', protect, adminOnly, getAlertAnalytics);

/**
 * @route   GET /api/admin/health
 * @desc    Get comprehensive system health check
 * @access  Admin
 */
router.get('/health', protect, adminOnly, async (req, res) => {
  try {
    const health = await runHealthChecks();
    res.json(health);
  } catch (error) {
    res.status(500).json({ message: 'Health check failed', error: error.message });
  }
});

export default router;
