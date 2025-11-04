import Admin from '../models/Admin.js';
import User from '../models/User.js';
import Call from '../models/Call.js';
import Alert from '../models/Alert.js';
import Transcript from '../models/Transcript.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import logger from '../config/logger.js';

/**
 * @desc    Admin login
 * @route   POST /api/admin/auth/login
 * @access  Public
 */
export const adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find admin
    const admin = await Admin.findOne({ email });
    if (!admin) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Check if active
    if (!admin.isActive) {
      return res.status(403).json({ message: 'Account is deactivated' });
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Update last login
    admin.lastLogin = new Date();
    await admin.save();

    // Generate token
    const token = jwt.sign(
      { id: admin._id, role: admin.role, type: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE }
    );

    res.json({
      token,
      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        permissions: admin.permissions
      }
    });
  } catch (error) {
    logger.error('Admin login error:', error);
    res.status(500).json({ message: 'Login failed', error: error.message });
  }
};

/**
 * @desc    Get dashboard statistics
 * @route   GET /api/admin/stats
 * @access  Admin
 */
export const getDashboardStats = async (req, res) => {
  try {
    const [
      totalUsers,
      totalCalls,
      activeCalls,
      totalAlerts,
      criticalAlerts,
      recentUsers,
      recentCalls,
      recentAlerts
    ] = await Promise.all([
      User.countDocuments(),
      Call.countDocuments(),
      Call.countDocuments({ endedAt: null }),
      Alert.countDocuments(),
      Alert.countDocuments({ severity: 'CRITICAL' }),
      User.find().sort({ createdAt: -1 }).limit(5),
      Call.find().sort({ startedAt: -1 }).limit(10).populate('participants.userId', 'name email'),
      Alert.find().sort({ createdAt: -1 }).limit(10).populate('userId', 'name email')
    ]);

    // Calculate growth metrics (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    const [newUsers, newCalls, newAlerts] = await Promise.all([
      User.countDocuments({ createdAt: { $gte: sevenDaysAgo } }),
      Call.countDocuments({ startedAt: { $gte: sevenDaysAgo } }),
      Alert.countDocuments({ createdAt: { $gte: sevenDaysAgo } })
    ]);

    res.json({
      overview: {
        totalUsers,
        totalCalls,
        activeCalls,
        totalAlerts,
        criticalAlerts
      },
      growth: {
        newUsers,
        newCalls,
        newAlerts,
        period: '7 days'
      },
      recent: {
        users: recentUsers,
        calls: recentCalls,
        alerts: recentAlerts
      }
    });
  } catch (error) {
    logger.error('Dashboard stats error:', error);
    res.status(500).json({ message: 'Failed to fetch statistics', error: error.message });
  }
};

/**
 * @desc    Get all users with filters
 * @route   GET /api/admin/users
 * @access  Admin
 */
export const getAllUsers = async (req, res) => {
  try {
    const { page = 1, limit = 20, search, sortBy = 'createdAt', order = 'desc' } = req.query;

    const query = {};
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const users = await User.find(query)
      .sort({ [sortBy]: order === 'desc' ? -1 : 1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .select('-password');

    const count = await User.countDocuments(query);

    res.json({
      users,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
      totalUsers: count
    });
  } catch (error) {
    logger.error('Get users error:', error);
    res.status(500).json({ message: 'Failed to fetch users', error: error.message });
  }
};

/**
 * @desc    Get active sessions (ongoing calls)
 * @route   GET /api/admin/sessions/active
 * @access  Admin
 */
export const getActiveSessions = async (req, res) => {
  try {
    const activeCalls = await Call.find({ endedAt: null })
      .populate('participants.userId', 'name email')
      .sort({ startedAt: -1 });

    const sessionsWithDetails = activeCalls.map(call => ({
      callId: call._id,
      roomId: call.roomId,
      startedAt: call.startedAt,
      duration: Math.floor((Date.now() - call.startedAt) / 1000), // in seconds
      participantCount: call.participants.length,
      participants: call.participants.map(p => ({
        userId: p.userId._id,
        name: p.userId.name,
        email: p.userId.email,
        joinedAt: p.joinedAt,
        status: p.leftAt ? 'left' : 'active'
      }))
    }));

    res.json({
      activeSessions: sessionsWithDetails,
      count: sessionsWithDetails.length
    });
  } catch (error) {
    logger.error('Get active sessions error:', error);
    res.status(500).json({ message: 'Failed to fetch active sessions', error: error.message });
  }
};

/**
 * @desc    Get call analytics
 * @route   GET /api/admin/analytics/calls
 * @access  Admin
 */
export const getCallAnalytics = async (req, res) => {
  try {
    const { period = '30' } = req.query; // days
    const startDate = new Date(Date.now() - parseInt(period) * 24 * 60 * 60 * 1000);

    // Calls per day
    const callsPerDay = await Call.aggregate([
      { $match: { startedAt: { $gte: startDate } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$startedAt' } },
          count: { $sum: 1 },
          avgDuration: {
            $avg: {
              $cond: [
                { $ne: ['$endedAt', null] },
                { $subtract: ['$endedAt', '$startedAt'] },
                0
              ]
            }
          }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Total stats
    const totalCalls = await Call.countDocuments({ startedAt: { $gte: startDate } });
    const completedCalls = await Call.countDocuments({ 
      startedAt: { $gte: startDate },
      endedAt: { $ne: null }
    });

    // Average participants
    const avgParticipants = await Call.aggregate([
      { $match: { startedAt: { $gte: startDate } } },
      {
        $group: {
          _id: null,
          avgParticipants: { $avg: { $size: '$participants' } }
        }
      }
    ]);

    res.json({
      period: `${period} days`,
      totalCalls,
      completedCalls,
      activeCalls: totalCalls - completedCalls,
      avgParticipants: avgParticipants[0]?.avgParticipants || 0,
      callsPerDay
    });
  } catch (error) {
    logger.error('Call analytics error:', error);
    res.status(500).json({ message: 'Failed to fetch analytics', error: error.message });
  }
};

/**
 * @desc    Get alert analytics
 * @route   GET /api/admin/analytics/alerts
 * @access  Admin
 */
export const getAlertAnalytics = async (req, res) => {
  try {
    const { period = '30' } = req.query;
    const startDate = new Date(Date.now() - parseInt(period) * 24 * 60 * 60 * 1000);

    // Alerts by severity
    const alertsBySeverity = await Alert.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: '$severity',
          count: { $sum: 1 }
        }
      }
    ]);

    // Alerts over time
    const alertsOverTime = await Alert.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Most flagged users
    const mostFlaggedUsers = await Alert.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: '$userId',
          alertCount: { $sum: 1 }
        }
      },
      { $sort: { alertCount: -1 } },
      { $limit: 10 }
    ]);

    // Populate user details
    await Alert.populate(mostFlaggedUsers, {
      path: '_id',
      select: 'name email'
    });

    res.json({
      period: `${period} days`,
      totalAlerts: await Alert.countDocuments({ createdAt: { $gte: startDate } }),
      alertsBySeverity,
      alertsOverTime,
      mostFlaggedUsers: mostFlaggedUsers.map(item => ({
        user: item._id,
        alertCount: item.alertCount
      }))
    });
  } catch (error) {
    logger.error('Alert analytics error:', error);
    res.status(500).json({ message: 'Failed to fetch alert analytics', error: error.message });
  }
};

/**
 * @desc    Get all alerts with filtering
 * @route   GET /api/admin/alerts
 * @access  Admin
 */
export const getAllAlerts = async (req, res) => {
  try {
    const { page = 1, limit = 50, severity, startDate, endDate } = req.query;

    const query = {};
    if (severity) {
      query.severity = severity.toUpperCase();
    }
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const alerts = await Alert.find(query)
      .populate('userId', 'name email')
      .populate('callId', 'roomId startedAt')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const count = await Alert.countDocuments(query);

    res.json({
      alerts,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
      totalAlerts: count
    });
  } catch (error) {
    logger.error('Get alerts error:', error);
    res.status(500).json({ message: 'Failed to fetch alerts', error: error.message });
  }
};

/**
 * @desc    Manage user (ban, unban, delete)
 * @route   PUT /api/admin/users/:userId
 * @access  Admin (with permissions)
 */
export const manageUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { action } = req.body; // 'ban', 'unban', 'delete'

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    switch (action) {
      case 'ban':
        user.isActive = false;
        await user.save();
        logger.info(`User ${userId} banned by admin ${req.admin.id}`);
        break;

      case 'unban':
        user.isActive = true;
        await user.save();
        logger.info(`User ${userId} unbanned by admin ${req.admin.id}`);
        break;

      case 'delete':
        await User.findByIdAndDelete(userId);
        logger.info(`User ${userId} deleted by admin ${req.admin.id}`);
        break;

      default:
        return res.status(400).json({ message: 'Invalid action' });
    }

    res.json({
      success: true,
      message: `User ${action}ed successfully`,
      user: action !== 'delete' ? user : null
    });
  } catch (error) {
    logger.error('Manage user error:', error);
    res.status(500).json({ message: 'Failed to manage user', error: error.message });
  }
};

export default {
  adminLogin,
  getDashboardStats,
  getAllUsers,
  getAllAlerts,
  getActiveSessions,
  getCallAnalytics,
  getAlertAnalytics,
  manageUser
};
