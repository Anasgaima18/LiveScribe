import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import logger from './logger.js';
import User from '../models/User.js';
import Transcript from '../models/Transcript.js';

let io;

// Store active users and their socket IDs
const activeUsers = new Map();

export const initSocket = (server) => {
  const configuredOrigins = (process.env.FRONTEND_URLS || process.env.FRONTEND_URL || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const defaultDevOrigins = ['http://localhost:5173', 'http://localhost:3000'];
  const allowedOrigins = Array.from(new Set([...configuredOrigins, ...defaultDevOrigins]));

  io = new Server(server, {
    cors: {
      origin: allowedOrigins,
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
    socket.on('call:invite', ({ to, targetUserId, roomId, callId, from }) => {
      const recipientUserId = to || targetUserId;
      const targetUser = activeUsers.get(recipientUserId);
      
      if (targetUser) {
        // Send to both 'call:invitation' and 'call:invite' for compatibility
        io.to(targetUser.socketId).emit('call:invitation', {
          from: from || socket.user,
          roomId,
          callId
        });
        io.to(targetUser.socketId).emit('call:invite', {
          from: from || socket.user,
          roomId,
          callId
        });
        logger.info(`Call invitation sent from ${socket.user.name} to ${recipientUserId}`);
      } else {
        logger.warn(`User ${recipientUserId} is not online or not found`);
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

    // OPTIONAL: Realtime transcription passthrough (Sarvam AI skeleton)
    // Client can send raw PCM chunks; backend forwards to Sarvam and emits
    // 'transcript:new' events to the room. This is a skeleton; fill Sarvam client.
    let sarvamSession = null;
    socket.on('transcription:start', async ({ roomId, language = 'en' }) => {
      try {
        const provider = process.env.TRANSCRIPTION_PROVIDER;
        logger.info(`Transcription start requested. Provider: "${provider}", Expected: "sarvam"`);
        
        if (provider !== 'sarvam') {
          logger.warn(`Transcription provider not configured. Current: "${provider}", Expected: "sarvam"`);
          socket.emit('transcript:status', { status: 'disabled', reason: 'provider_not_configured' });
          return;
        }
        const { createSarvamClient } = await import('../utils/transcription/sarvamClient.js');
        sarvamSession = createSarvamClient();
        sarvamSession.on('partial', (data) => {
          io.to(`call:${roomId}`).emit('transcript:new', {
            userId,
            userName: socket.user.name,
            segment: { text: data.text, timestamp: data.timestamp, isPartial: true },
          });
        });
        sarvamSession.on('final', (data) => {
          io.to(`call:${roomId}`).emit('transcript:new', {
            userId,
            userName: socket.user.name,
            segment: { text: data.text, timestamp: data.timestamp, isPartial: false },
          });
        });
        sarvamSession.on('error', (err) => {
          logger.error('Sarvam session error:', err);
          socket.emit('transcript:status', { status: 'error', reason: err.message });
        });
        sarvamSession.on('open', () => {
          socket.emit('transcript:status', { status: 'active', provider: 'sarvam' });
        });
        sarvamSession.connect();
      } catch (e) {
        logger.error('Failed to start transcription:', e);
        socket.emit('transcript:status', { status: 'error', reason: e.message });
      }
    });

    socket.on('transcription:audio', ({ chunk }) => {
      try {
        if (sarvamSession && chunk) {
          // Expect chunk as base64-encoded PCM16 mono 16kHz
          const buf = Buffer.from(chunk, 'base64');
          sarvamSession.sendAudio(buf);
        }
      } catch (e) {
        logger.error('transcription:audio error:', e);
      }
    });

    // Browser-based STT fallback: client sends recognized text directly
    socket.on('transcription:text', async ({ roomId, callId, text, isPartial, timestamp }) => {
      try {
        const segment = {
          text: text || '',
          timestamp: timestamp ? new Date(timestamp) : new Date(),
          isPartial: !!isPartial,
        };

        // Broadcast to room participants
        io.to(`call:${roomId}`).emit('transcript:new', {
          userId,
          userName: socket.user.name,
          segment,
        });

        // Persist only final segments if callId is provided
        if (callId && !segment.isPartial) {
          let doc = await Transcript.findOne({ callId, userId });
          if (!doc) {
            doc = await Transcript.create({ callId, userId, segments: [segment] });
          } else {
            doc.segments.push(segment);
            await doc.save();
          }
        }
      } catch (e) {
        logger.error('transcription:text error:', e);
      }
    });

    socket.on('transcription:stop', () => {
      try {
        if (sarvamSession) sarvamSession.close();
        sarvamSession = null;
      } catch (e) {
        logger.error('Failed to stop transcription:', e);
      }
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
