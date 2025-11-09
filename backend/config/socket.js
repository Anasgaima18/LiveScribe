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
    pingInterval: 25000,
    connectTimeout: 45000,
    transports: ['websocket', 'polling'], // Try WebSocket first, fallback to polling
    allowUpgrades: true,
    upgradeTimeout: 30000,
    maxHttpBufferSize: 1e8,
    path: '/socket.io/',
  });

  // Socket.IO authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      
      logger.info(`Socket auth attempt from: ${socket.handshake.address}`);
      logger.info(`Token present: ${!!token}`);
      
      if (!token) {
        logger.warn('Socket connection rejected: No token provided');
        return next(new Error('Authentication error: No token provided'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      logger.info(`Token decoded successfully for user ID: ${decoded.id}`);
      
      const user = await User.findById(decoded.id).select('-passwordHash');

      if (!user) {
        logger.warn(`Socket connection rejected: User not found (ID: ${decoded.id})`);
        return next(new Error('User not found'));
      }

      logger.info(`Socket authenticated successfully for user: ${user.name} (${user._id})`);
      socket.user = user;
      next();
    } catch (error) {
      logger.error('Socket authentication error:', error.message);
      logger.error('Error stack:', error.stack);
      next(new Error('Authentication failed'));    }
  });

  io.on('connection', (socket) => {
    const userId = socket.user._id.toString();
    logger.info(`User connected: ${socket.user.name} (${userId})`);

    // Add error handler to prevent uncaught errors from crashing socket
    socket.on('error', (error) => {
      logger.error(`Socket error for user ${socket.user.name}:`, error);
    });

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
    let sarvamReady = false;
    let audioQueue = [];
  socket.on('transcription:start', async ({ roomId, language = 'en' }) => {
      // Wrap EVERYTHING in try-catch to prevent socket disconnection
      try {
        logger.info(`=== TRANSCRIPTION START ===`);
        logger.info(`Room: ${roomId}, Language: ${language}, User: ${socket.user.name}`);
        
        const provider = process.env.TRANSCRIPTION_PROVIDER;
        const apiKey = process.env.SARVAM_API_KEY;
        
        logger.info(`Provider: "${provider}"`);
        logger.info(`API Key present: ${!!apiKey} ${apiKey ? `(length: ${apiKey.length})` : ''}`);
        
        if (provider !== 'sarvam') {
          logger.warn(`Transcription provider not sarvam: "${provider}"`);
          try {
            socket.emit('transcript:status', { status: 'disabled', reason: 'provider_not_configured' });
          } catch (emitErr) {
            logger.error('Failed to emit disabled status:', emitErr);
          }
          return;
        }
        
        if (!apiKey) {
          logger.error('SARVAM_API_KEY not configured!');
          try {
            socket.emit('transcript:status', { status: 'error', reason: 'api_key_missing' });
          } catch (emitErr) {
            logger.error('Failed to emit error status:', emitErr);
          }
          return;
        }
        
        
  const { createSarvamClient } = await import('../utils/transcription/sarvamClient.js');
  // Map language codes: 'en' -> 'en-IN', 'hi' -> 'hi-IN', etc. Support 'auto' for detection+translate
  const languageCode = language === 'auto' ? 'auto' : (language === 'en' ? 'en-IN' : language === 'hi' ? 'hi-IN' : `${language}-IN`);
        
        logger.info(`Creating Sarvam client with language: ${languageCode}`);
  sarvamSession = createSarvamClient({ language: languageCode });
        logger.info(`Sarvam client created successfully`);
        
        sarvamSession.on('partial', (data) => {
          try {
            if (!data || typeof data.text !== 'string') {
              logger.warn('Invalid partial transcript data received');
              return;
            }
            io.to(`call:${roomId}`).emit('transcript:new', {
              userId,
              userName: socket.user.name,
              segment: { text: data.text, timestamp: data.timestamp, isPartial: true },
            });
          } catch (err) {
            logger.error('Error emitting partial transcript:', err);
          }
        });        
        sarvamSession.on('final', async (data) => {
          try {
            if (!data || typeof data.text !== 'string') {
              logger.warn('Invalid final transcript data received');
              return;
            }
            const segment = { 
              text: data.text, 
              timestamp: data.timestamp, 
              isPartial: false,
              language: data.language,
              autoDetected: !!data.autoDetected
            };
            
            // Add dual-mode transcript fields if available
            if (data.dualMode && data.originalText && data.translatedText) {
              segment.originalText = data.originalText;
              segment.translatedText = data.translatedText;
              segment.dualMode = true;
              logger.info(`Dual-mode transcript: original="${data.originalText}", translated="${data.translatedText}"`);
            }
            
            // Broadcast to room participants
            io.to(`call:${roomId}`).emit('transcript:new', {
              userId,
              userName: socket.user.name,
              segment,
            });            // Persist final transcript to database
            try {
              // Find the call to get callId
              const Call = (await import('../models/Call.js')).default;
              const call = await Call.findOne({ roomId });
              
              if (call) {
                const Transcript = (await import('../models/Transcript.js')).default;
                let doc = await Transcript.findOne({ callId: call._id, userId });
                if (!doc) {
                  doc = await Transcript.create({ 
                    callId: call._id, 
                    userId, 
                    segments: [{ text: data.text, timestamp: new Date(data.timestamp) }] 
                  });
                } else {
                  doc.segments.push({ text: data.text, timestamp: new Date(data.timestamp) });
                  await doc.save();
                }
                logger.info(`Saved transcript for user ${socket.user.name} in call ${call._id}`);
              }
            } catch (err) {
              logger.error('Failed to save Sarvam transcript:', err);
            }
          } catch (err) {
            logger.error('Error in final transcript handler:', err);
          }
        });
        
        sarvamSession.on('error', (err) => {
          try {
            logger.error('Sarvam session error:', err);
            socket.emit('transcript:status', { status: 'error', reason: err.message });
          } catch (emitErr) {
            logger.error('Error emitting error status:', emitErr);
          }
        });
        
        sarvamSession.on('open', () => {
          try {
            logger.info(`Sarvam transcription started for user ${socket.user.name}`);
            sarvamReady = true;
            socket.emit('transcript:status', { status: 'active', provider: 'sarvam' });
            // Process any queued audio chunks
            if (audioQueue.length > 0) {
              logger.info(`Processing ${audioQueue.length} queued audio chunks`);
              audioQueue.forEach(({ chunk, meta }) => {
                try {
                  const buf = Buffer.from(chunk, 'base64');
                  const maybePromise = sarvamSession.sendAudio(buf, meta);
                  if (maybePromise && typeof maybePromise.catch === 'function') {
                    maybePromise.catch((err) => logger.error('Queued audio sendAudio failed:', err));
                  }
                } catch (e) {
                  logger.error('Failed to process queued audio chunk:', e);
                }
              });
              audioQueue = [];
            }
          } catch (err) {
            logger.error('Error in open handler:', err);
          }
        });
        
        // Start the session
        logger.info(`Calling sarvamSession.connect()...`);
        sarvamSession.connect();
        logger.info(`Sarvam session connected, emitting status...`);
        
        // Emit success status (don't wait for 'open' event, do it immediately)
        try {
          socket.emit('transcript:status', { status: 'active', provider: 'sarvam' });
          logger.info(`Successfully emitted active status`);
        } catch (emitErr) {
          logger.error('Failed to emit active status (immediate):', emitErr);
        }
        
        logger.info(`=== TRANSCRIPTION START COMPLETE ===`);
      } catch (e) {
        logger.error('=== TRANSCRIPTION START FAILED ===');
        logger.error('Error:', e);
        logger.error('Stack:', e.stack);
        try {
          socket.emit('transcript:status', { status: 'error', reason: e.message });
        } catch (emitErr) {
          logger.error('Failed to emit error status:', emitErr);
        }
      }
    });

    socket.on('transcription:audio', ({ chunk, meta }) => {
      try {
        if (!sarvamSession) {
          // Session not created yet - silently drop (user may have stopped before start completed)
          return;
        }
        
        if (!sarvamReady) {
          // Queue audio chunks until session is ready
          if (audioQueue.length < 100) { // cap queue to prevent memory issues
            audioQueue.push({ chunk, meta });
          }
          return;
        }
        
        if (chunk) {
          // Log metadata if present (first 10 chunks for debugging)
          if (meta && sarvamSession._chunkCount < 10) {
            logger.info(`Chunk meta: RMS_Int16=${meta.rmsInt16?.toFixed(0)}, Duration=${meta.durationMs?.toFixed(1)}ms, Samples=${meta.samples}`);
          }
          
          // Expect chunk as base64-encoded PCM16 mono 16kHz
          const buf = Buffer.from(chunk, 'base64');
          const maybePromise = sarvamSession.sendAudio(buf, meta);
          if (maybePromise && typeof maybePromise.catch === 'function') {
            maybePromise.catch((err) => {
              logger.error('sarvamSession.sendAudio failed:', err);
            });
          }
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

    socket.on('transcription:stop', async () => {
      try {
        if (sarvamSession) {
          await sarvamSession.close();
        }
        sarvamSession = null;
        sarvamReady = false;
        audioQueue = [];
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
    socket.on('disconnect', async (reason) => {
      logger.info(`User disconnected: ${socket.user.name} (${userId})`);
      logger.info(`Disconnect reason: ${reason}`);

      try {
        if (sarvamSession) {
          await sarvamSession.close();
        }
      } catch (closeErr) {
        logger.error('Error while closing Sarvam session on disconnect:', closeErr);
      } finally {
        sarvamSession = null;
        sarvamReady = false;
        audioQueue = [];
      }

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
