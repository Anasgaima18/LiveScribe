import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import logger from './logger.js';
import User from '../models/User.js';

let io;

// Store active users and their socket IDs
const activeUsers = new Map();

export const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:3000',
      credentials: true
    },
    pingTimeout: 60000,
  });

  // Socket.IO authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      
      if (!token) {
        return next(new Error('Authentication error'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('-passwordHash');

      if (!user) {
        return next(new Error('User not found'));
      }

      socket.user = user;
      next();
    } catch (error) {
      logger.error('Socket authentication error:', error);
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.user._id.toString();
    logger.info(`User connected: ${socket.user.name} (${userId})`);

    // Store active user
    activeUsers.set(userId, {
      socketId: socket.id,
      user: socket.user,
      status: 'online',
      lastSeen: new Date()
    });

    // Broadcast online status
    socket.broadcast.emit('user:online', {
      userId,
      name: socket.user.name,
      status: 'online'
    });

    // Send list of active users to the newly connected user
    const activeUsersList = Array.from(activeUsers.entries()).map(([id, data]) => ({
      userId: id,
      name: data.user.name,
      status: data.status
    }));
    socket.emit('users:active', activeUsersList);

    // Join user to their personal room
    socket.join(`user:${userId}`);

    // Handle joining a call room
    socket.on('call:join', ({ roomId }) => {
      socket.join(`call:${roomId}`);
      socket.to(`call:${roomId}`).emit('user:joined', {
        userId,
        name: socket.user.name
      });
      logger.info(`User ${socket.user.name} joined call ${roomId}`);
    });

    // Handle leaving a call room
    socket.on('call:leave', ({ roomId }) => {
      socket.leave(`call:${roomId}`);
      socket.to(`call:${roomId}`).emit('user:left', {
        userId,
        name: socket.user.name
      });
      logger.info(`User ${socket.user.name} left call ${roomId}`);
    });

    // Handle chat messages in a call
    socket.on('chat:message', ({ roomId, message }) => {
      const chatMessage = {
        userId,
        userName: socket.user.name,
        message,
        timestamp: new Date()
      };
      io.to(`call:${roomId}`).emit('chat:message', chatMessage);
      logger.info(`Chat message in room ${roomId} from ${socket.user.name}`);
    });

    // Handle typing indicator
    socket.on('chat:typing', ({ roomId, isTyping }) => {
      socket.to(`call:${roomId}`).emit('chat:typing', {
        userId,
        userName: socket.user.name,
        isTyping
      });
    });

    // Handle call invitation
    socket.on('call:invite', ({ targetUserId, roomId, callId }) => {
      const targetUser = activeUsers.get(targetUserId);
      if (targetUser) {
        io.to(targetUser.socketId).emit('call:invitation', {
          from: socket.user,
          roomId,
          callId
        });
        logger.info(`Call invitation sent to ${targetUserId}`);
      }
    });

    // Handle call response
    socket.on('call:response', ({ targetUserId, accepted, roomId }) => {
      const targetUser = activeUsers.get(targetUserId);
      if (targetUser) {
        io.to(targetUser.socketId).emit('call:response', {
          from: socket.user,
          accepted,
          roomId
        });
      }
    });

    // Handle status update
    socket.on('status:update', ({ status }) => {
      const userData = activeUsers.get(userId);
      if (userData) {
        userData.status = status;
        activeUsers.set(userId, userData);
        socket.broadcast.emit('user:status', {
          userId,
          status
        });
      }
    });

    // Handle transcript update
    socket.on('transcript:update', ({ roomId, segment }) => {
      socket.to(`call:${roomId}`).emit('transcript:new', {
        userId,
        userName: socket.user.name,
        segment
      });
    });

    // Handle alert notification
    socket.on('alert:detected', ({ roomId, alert }) => {
      io.to(`call:${roomId}`).emit('alert:new', {
        userId,
        userName: socket.user.name,
        alert
      });
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      logger.info(`User disconnected: ${socket.user.name} (${userId})`);
      activeUsers.delete(userId);
      
      socket.broadcast.emit('user:offline', {
        userId,
        name: socket.user.name,
        status: 'offline',
        lastSeen: new Date()
      });
    });
  });

  return io;
};

export const getIO = () => {
  if (!io) {
    throw new Error('Socket.io not initialized');
  }
  return io;
};

export const getActiveUsers = () => {
  return Array.from(activeUsers.entries()).map(([id, data]) => ({
    userId: id,
    name: data.user.name,
    status: data.status,
    lastSeen: data.lastSeen
  }));
};

export const sendToUser = (userId, event, data) => {
  const user = activeUsers.get(userId);
  if (user && io) {
    io.to(user.socketId).emit(event, data);
  }
};

export const sendToRoom = (roomId, event, data) => {
  if (io) {
    io.to(`call:${roomId}`).emit(event, data);
  }
};
