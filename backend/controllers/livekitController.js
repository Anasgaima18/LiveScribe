import { AccessToken } from 'livekit-server-sdk';
import logger from '../config/logger.js';
import { createSarvamWebSocketClient } from '../utils/transcription/sarvamWebSocketClient.js';

// Active WebSocket transcription sessions
const activeSessions = new Map(); // sessionId -> { client, userId, roomName }

// @desc    Generate LiveKit access token
// @route   GET /api/livekit/token
// @access  Private
export const getToken = async (req, res) => {
  try {
    const { roomName, participantName } = req.query;

    if (!roomName || !participantName) {
      return res.status(400).json({ 
        message: 'Room name and participant name are required' 
      });
    }

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;

    if (!apiKey || !apiSecret) {
      return res.status(500).json({ 
        message: 'LiveKit credentials not configured' 
      });
    }

    // Create access token
    const at = new AccessToken(apiKey, apiSecret, {
      identity: req.user._id.toString(),
      name: participantName,
    });

    // Grant permissions with extended timeout
    at.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    // Set TTL to 24 hours
    at.ttl = '24h';

    const token = await at.toJwt();

    res.json({
      token,
      url: process.env.LIVEKIT_URL,
      roomName,
      participantName,
      // Include ICE server configuration hints
      iceServers: [
        {
          urls: 'stun:stun.l.google.com:19302'
        }
      ]
    });
  } catch (error) {
    logger.error('LiveKit token generation error:', error);
    res.status(500).json({ 
      message: 'Failed to generate token',
      error: error.message 
    });
  }
};

// @desc    Start WebSocket transcription session
// @route   POST /api/livekit/transcription/start
// @access  Private
export const startTranscription = async (req, res) => {
  try {
    const { roomName, language, mode } = req.body;
    const userId = req.user._id.toString();

    if (!roomName) {
      return res.status(400).json({
        success: false,
        message: 'Room name is required'
      });
    }

    const apiKey = process.env.SARVAM_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        success: false,
        message: 'Sarvam API key not configured'
      });
    }

    const sessionId = `${userId}-${roomName}-${Date.now()}`;

    logger.info(`Starting WebSocket transcription for user ${userId} in room ${roomName} (language: ${language || 'en-IN'})`);

    // Create WebSocket client
    const wsClient = createSarvamWebSocketClient(apiKey, {
      mode: mode || 'transcribe',
      language: language || process.env.SARVAM_DEFAULT_LANGUAGE || 'en-IN',
      model: mode === 'translate' ? 'saaras:v2.5' : process.env.SARVAM_STT_MODEL || 'saarika:v2.5',
      sampleRate: '16000',
      inputAudioCodec: 'pcm_s16le',
      highVadSensitivity: 'true',
      vadSignals: 'true',
      flushSignal: 'true'
    });

    // Store session
    activeSessions.set(sessionId, {
      client: wsClient,
      userId,
      roomName,
      startTime: Date.now()
    });

    // Setup event handlers
    wsClient.on('transcript', (data) => {
      // Emit via Socket.IO (handled by socket.js)
      if (req.io) {
        req.io.to(roomName).emit('transcription', {
          sessionId,
          text: data.text,
          language: data.language,
          latency: data.metrics.processing_latency,
          isFinal: true,
          timestamp: Date.now()
        });
      }
    });

    wsClient.on('speech_start', ({ timestamp }) => {
      if (req.io) {
        req.io.to(roomName).emit('speech-event', {
          sessionId,
          type: 'start',
          timestamp
        });
      }
    });

    wsClient.on('speech_end', ({ timestamp }) => {
      if (req.io) {
        req.io.to(roomName).emit('speech-event', {
          sessionId,
          type: 'end',
          timestamp
        });
      }
    });

    wsClient.on('error', (error) => {
      logger.error(`WebSocket transcription error (session ${sessionId}):`, error);
      if (req.io) {
        req.io.to(roomName).emit('transcription-error', {
          sessionId,
          error: error.message
        });
      }
    });

    wsClient.on('api_error', ({ error, code }) => {
      logger.error(`Sarvam API error (session ${sessionId}, code ${code}): ${error}`);
      if (req.io) {
        req.io.to(roomName).emit('transcription-error', {
          sessionId,
          error: `API Error: ${error}`,
          code
        });
      }
    });

    wsClient.on('disconnected', ({ code, reason }) => {
      logger.warn(`WebSocket disconnected (session ${sessionId}, code ${code}): ${reason}`);
      if (code !== 1000 && req.io) {
        req.io.to(roomName).emit('transcription-status', {
          sessionId,
          status: 'reconnecting'
        });
      }
    });

    wsClient.on('connected', () => {
      if (req.io) {
        req.io.to(roomName).emit('transcription-status', {
          sessionId,
          status: 'connected'
        });
      }
    });

    // Connect
    await wsClient.connect();

    res.json({
      success: true,
      data: {
        sessionId,
        mode: 'websocket',
        message: 'Real-time WebSocket transcription started',
        expectedLatency: '< 100ms'
      }
    });

  } catch (error) {
    logger.error('Failed to start transcription:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to start transcription',
      error: error.message
    });
  }
};

// @desc    Stop WebSocket transcription session
// @route   POST /api/livekit/transcription/stop
// @access  Private
export const stopTranscription = async (req, res) => {
  try {
    const { sessionId } = req.body;
    const userId = req.user._id.toString();

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Session ID is required'
      });
    }

    const session = activeSessions.get(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Transcription session not found'
      });
    }

    if (session.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to stop this session'
      });
    }

    // Get final metrics
    const duration = Date.now() - session.startTime;
    const metrics = session.client.getMetrics();
    
    session.client.sendFlush();
    session.client.close();

    // Remove from active sessions
    activeSessions.delete(sessionId);

    logger.info(`Stopped WebSocket transcription (session ${sessionId}, duration: ${(duration / 1000).toFixed(1)}s)`);

    res.json({
      success: true,
      data: {
        sessionId,
        duration,
        metrics: {
          totalChunks: metrics.totalChunks,
          avgLatency: metrics.avgLatency,
          uptime: metrics.uptime
        }
      }
    });

  } catch (error) {
    logger.error('Failed to stop transcription:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to stop transcription',
      error: error.message
    });
  }
};

// @desc    Send audio chunk to WebSocket transcription
// @route   POST /api/livekit/transcription/audio
// @access  Private
export const sendAudioChunk = async (req, res) => {
  try {
    const { sessionId, audioData } = req.body;
    const userId = req.user._id.toString();

    if (!sessionId || !audioData) {
      return res.status(400).json({
        success: false,
        message: 'Session ID and audio data are required'
      });
    }

    const session = activeSessions.get(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Transcription session not found'
      });
    }

    if (session.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to send audio to this session'
      });
    }

    // Decode base64 audio
    const audioBuffer = Buffer.from(audioData, 'base64');

    // Send to WebSocket
    const sent = session.client.sendAudio(audioBuffer);
    
    if (!sent) {
      return res.status(500).json({
        success: false,
        message: 'Failed to send audio (WebSocket not connected)'
      });
    }

    res.json({
      success: true,
      data: {
        sessionId,
        bytesProcessed: audioBuffer.length
      }
    });

  } catch (error) {
    logger.error('Failed to send audio chunk:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send audio chunk',
      error: error.message
    });
  }
};

// @desc    Get transcription metrics
// @route   GET /api/livekit/transcription/:sessionId/metrics
// @access  Private
export const getTranscriptionMetrics = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user._id.toString();

    const session = activeSessions.get(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Transcription session not found'
      });
    }

    if (session.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this session'
      });
    }

    const metrics = session.client.getMetrics();
    const duration = Date.now() - session.startTime;

    res.json({
      success: true,
      data: {
        sessionId,
        roomName: session.roomName,
        duration,
        metrics: {
          totalChunks: metrics.totalChunks,
          avgLatency: metrics.avgLatency,
          totalDuration: metrics.totalDuration,
          uptime: metrics.uptime,
          isConnected: metrics.isConnected,
          isSpeaking: metrics.isSpeaking
        }
      }
    });

  } catch (error) {
    logger.error('Failed to get transcription metrics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get transcription metrics',
      error: error.message
    });
  }
};

// Cleanup on server shutdown
export const cleanupSessions = () => {
  logger.info(`Cleaning up ${activeSessions.size} active WebSocket transcription sessions`);
  
  for (const [sessionId, session] of activeSessions.entries()) {
    try {
      session.client.sendFlush();
      session.client.close();
      logger.info(`Closed session ${sessionId}`);
    } catch (error) {
      logger.error(`Error closing session ${sessionId}:`, error);
    }
  }
  
  activeSessions.clear();
};

// Register cleanup on process exit
process.on('SIGTERM', cleanupSessions);
process.on('SIGINT', cleanupSessions);
