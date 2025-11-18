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

    // WebSocket-only Realtime Transcription (Sarvam AI)
    let sarvamSession = null;
    
  socket.on('transcription:start', async ({ roomId, language = 'en', mode = 'transcribe' }) => {
      try {
        logger.info(`Starting WebSocket transcription for room ${roomId}, language: ${language}, user: ${socket.user.name}`);
        
        const provider = process.env.TRANSCRIPTION_PROVIDER;
        const apiKey = process.env.SARVAM_API_KEY;
        
        if (provider !== 'sarvam') {
          logger.warn(`Transcription provider not configured: "${provider}"`);
          socket.emit('transcript:status', { status: 'disabled', reason: 'provider_not_configured' });
          return;
        }
        
        if (!apiKey) {
          logger.error('SARVAM_API_KEY not configured');
          socket.emit('transcript:status', { status: 'error', reason: 'api_key_missing' });
          return;
        }
        
        // Import WebSocket client
        const { createSarvamWebSocketClient, getSupportedLanguages } = await import('../utils/transcription/sarvamWebSocketClient.js');
        
        // Map language codes to Sarvam format (e.g., 'en' -> 'en-IN')
        // Supported: en-IN, hi-IN, bn-IN, kn-IN, ml-IN, mr-IN, od-IN, pa-IN, ta-IN, te-IN, gu-IN
        let languageCode;
        
        if (language === 'auto' || language === 'unknown') {
          // Use default language for auto detection
          languageCode = process.env.SARVAM_DEFAULT_LANGUAGE || 'en-IN';
        } else if (language.includes('-')) {
          // Already in correct format (e.g., 'en-IN')
          languageCode = language;
        } else {
          // Map short code to full code (e.g., 'en' -> 'en-IN', 'hi' -> 'hi-IN')
          const supportedLanguages = getSupportedLanguages();
          const fullCode = `${language}-IN`;
          languageCode = supportedLanguages.includes(fullCode) ? fullCode : 'en-IN';
        }
        
        logger.info(`Creating Sarvam WebSocket client (mode: ${mode}, language: ${languageCode})`);

        
        // Create WebSocket client
        sarvamSession = createSarvamWebSocketClient(apiKey, {
          mode: mode,
          language: languageCode,
          model: mode === 'translate' ? 'saaras:v2.5' : (process.env.SARVAM_STT_MODEL || 'saarika:v2.5'),
          sampleRate: '16000',
          inputAudioCodec: 'pcm_s16le',
          highVadSensitivity: 'true',
          vadSignals: 'true',
          flushSignal: 'true'
        });
        
        logger.info('WebSocket client created successfully');
        
        // Handle transcript events
        sarvamSession.on('transcript', async (data) => {
          try {
            const segment = { 
              text: data.text, 
              timestamp: Date.now(), 
              isPartial: false,
              isFinal: data.isFinal,
              language: data.language,
              latency: data.metrics?.processing_latency
            };
            
            // Broadcast to room
            io.to(`call:${roomId}`).emit('transcript:new', {
              userId,
              userName: socket.user.name,
              segment
            });
            
            // Save to database
            try {
              const Call = (await import('../models/Call.js')).default;
              const call = await Call.findOne({ roomId });
              
              if (call) {
                const Transcript = (await import('../models/Transcript.js')).default;
                let doc = await Transcript.findOne({ callId: call._id, userId });
                if (!doc) {
                  doc = await Transcript.create({ 
                    callId: call._id, 
                    userId, 
                    segments: [{ text: data.text, timestamp: new Date() }] 
                  });
                } else {
                  doc.segments.push({ text: data.text, timestamp: new Date() });
                  await doc.save();
                }
                logger.debug(`Saved transcript for user ${socket.user.name} in call ${call._id}`);
              }
            } catch (err) {
              logger.error('Failed to save transcript:', err);
            }
          } catch (err) {
            logger.error('Error handling transcript:', err);
          }
        });
        
        // Handle speech events
        sarvamSession.on('speech_start', () => {
          try {
            io.to(`call:${roomId}`).emit('speech:event', {
              userId,
              userName: socket.user.name,
              type: 'start'
            });
          } catch (err) {
            logger.error('Error emitting speech start:', err);
          }
        });
        
        sarvamSession.on('speech_end', () => {
          try {
            io.to(`call:${roomId}`).emit('speech:event', {
              userId,
              userName: socket.user.name,
              type: 'end'
            });
          } catch (err) {
            logger.error('Error emitting speech end:', err);
          }
        });
        
        // Handle errors
        sarvamSession.on('error', (error) => {
          logger.error('WebSocket transcription error:', error);
          socket.emit('transcript:status', { 
            status: 'error', 
            reason: error.message || 'WebSocket error' 
          });
        });
        
        sarvamSession.on('api_error', ({ error, code }) => {
          logger.error(`Sarvam API error (${code}): ${error}`);
          socket.emit('transcript:status', { 
            status: 'error', 
            reason: `API Error: ${error}`,
            code 
          });
        });
        
        // Handle connection events
        sarvamSession.on('connected', () => {
          logger.info(`WebSocket transcription connected for user ${socket.user.name}`);
          socket.emit('transcript:status', { 
            status: 'active', 
            provider: 'sarvam-websocket',
            mode: mode,
            language: languageCode,
            expectedLatency: '< 100ms'
          });
        });
        
        sarvamSession.on('disconnected', ({ code, reason }) => {
          logger.warn(`WebSocket disconnected (code: ${code}, reason: ${reason})`);
          if (code !== 1000) {
            socket.emit('transcript:status', { status: 'reconnecting' });
          }
        });
        
        // Connect to WebSocket
        await sarvamSession.connect();
        
        logger.info('WebSocket transcription started successfully');
        
      } catch (e) {
        logger.error('Failed to start WebSocket transcription:', e);
        socket.emit('transcript:status', { status: 'error', reason: e.message });
      }
    });

    socket.on('transcription:audio', ({ chunk, meta }) => {
      try {
        if (!sarvamSession) {
          return;
        }
        
        if (chunk) {
          // Decode base64 audio chunk to Buffer
          const buf = Buffer.from(chunk, 'base64');
          
          // Send audio to WebSocket client
          sarvamSession.sendAudio(buf, meta);
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
          const metrics = sarvamSession.getMetrics();
          logger.info(`Stopping WebSocket transcription. Metrics: ${JSON.stringify(metrics)}`);
          await sarvamSession.close();
        }
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
