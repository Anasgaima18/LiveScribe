/**
 * LiveKit Room Controller - Hybrid Transcription Support
 * Supports both batch-based and WebSocket streaming transcription
 * 
 * Migration Path:
 * 1. Set SARVAM_USE_WEBSOCKET=false (default) - uses existing batch system
 * 2. Set SARVAM_USE_WEBSOCKET=true - uses new WebSocket streaming (< 100ms latency)
 */

import { RoomServiceClient, AccessToken } from 'livekit-server-sdk';
import logger from '../config/logger.js';
import { SarvamRealtimeClient } from '../utils/transcription/sarvamClient.js';
import { createSarvamWebSocketClient } from '../utils/transcription/sarvamWebSocketClient.js';

const USE_WEBSOCKET = process.env.SARVAM_USE_WEBSOCKET === 'true';

// LiveKit configuration
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;
const LIVEKIT_URL = process.env.LIVEKIT_URL;

// Sarvam AI configuration
const SARVAM_API_KEY = process.env.SARVAM_API_KEY;

// Active transcription sessions
const activeSessions = new Map(); // sessionId -> { client, userId, roomName }

/**
 * Generate LiveKit access token
 */
export const generateToken = async (req, res, next) => {
  try {
    const { roomName, participantName } = req.body;
    const userId = req.user._id.toString();

    if (!roomName || !participantName) {
      return res.status(400).json({
        success: false,
        message: 'Room name and participant name are required'
      });
    }

    const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity: userId,
      name: participantName,
      ttl: '24h'
    });

    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true
    });

    const token = at.toJwt();

    logger.info(`Generated LiveKit token for user ${userId} in room ${roomName}`);

    res.json({
      success: true,
      data: {
        token,
        wsUrl: LIVEKIT_URL
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Start transcription - Hybrid approach
 * Automatically chooses between batch and WebSocket based on env config
 */
export const startTranscription = async (req, res, next) => {
  try {
    const { roomName, language, mode } = req.body;
    const userId = req.user._id.toString();

    if (!roomName) {
      return res.status(400).json({
        success: false,
        message: 'Room name is required'
      });
    }

    const transcriptionMode = USE_WEBSOCKET ? 'websocket' : 'batch';
    const sessionId = `${userId}-${roomName}-${Date.now()}`;

    logger.info(`Starting ${transcriptionMode} transcription for user ${userId} in room ${roomName} (language: ${language || 'en-IN'})`);

    if (USE_WEBSOCKET) {
      // WebSocket Streaming (< 100ms latency)
      const wsClient = createSarvamWebSocketClient(SARVAM_API_KEY, {
        mode: mode || 'transcribe',
        language: language || 'en-IN',
        model: mode === 'translate' ? 'saaras:v2.5' : 'saarika:v2.5',
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
        mode: 'websocket',
        startTime: Date.now()
      });

      // Setup event handlers
      wsClient.on('transcript', (data) => {
        // Emit via Socket.IO (will be handled by socket.js)
        req.io.to(roomName).emit('transcription', {
          sessionId,
          text: data.text,
          language: data.language,
          latency: data.metrics.processing_latency,
          isFinal: true,
          timestamp: Date.now(),
          mode: 'websocket'
        });
      });

      wsClient.on('speech_start', ({ timestamp }) => {
        req.io.to(roomName).emit('speech-event', {
          sessionId,
          type: 'start',
          timestamp
        });
      });

      wsClient.on('speech_end', ({ timestamp }) => {
        req.io.to(roomName).emit('speech-event', {
          sessionId,
          type: 'end',
          timestamp
        });
      });

      wsClient.on('error', (error) => {
        logger.error(`WebSocket transcription error (session ${sessionId}):`, error);
        req.io.to(roomName).emit('transcription-error', {
          sessionId,
          error: error.message
        });
      });

      wsClient.on('api_error', ({ error, code }) => {
        logger.error(`Sarvam API error (session ${sessionId}, code ${code}): ${error}`);
        req.io.to(roomName).emit('transcription-error', {
          sessionId,
          error: `API Error: ${error}`,
          code
        });
      });

      wsClient.on('disconnected', ({ code, reason }) => {
        logger.warn(`WebSocket disconnected (session ${sessionId}, code ${code}): ${reason}`);
        if (code !== 1000) {
          req.io.to(roomName).emit('transcription-status', {
            sessionId,
            status: 'reconnecting'
          });
        }
      });

      wsClient.on('connected', () => {
        req.io.to(roomName).emit('transcription-status', {
          sessionId,
          status: 'connected'
        });
      });

      // Connect
      await wsClient.connect();

    } else {
      // Batch-based (existing system, 1-2s latency)
      const batchClient = new SarvamRealtimeClient(SARVAM_API_KEY, {
        language: language || 'en-IN',
        mode: 'SPEED' // Use fastest preset
      });

      // Store session
      activeSessions.set(sessionId, {
        client: batchClient,
        userId,
        roomName,
        mode: 'batch',
        startTime: Date.now()
      });

      // Setup event handlers
      batchClient.on('transcription', (data) => {
        req.io.to(roomName).emit('transcription', {
          sessionId,
          text: data.text,
          language: data.language,
          confidence: data.confidence,
          isFinal: true,
          timestamp: Date.now(),
          mode: 'batch'
        });
      });

      batchClient.on('error', (error) => {
        logger.error(`Batch transcription error (session ${sessionId}):`, error);
        req.io.to(roomName).emit('transcription-error', {
          sessionId,
          error: error.message
        });
      });

      // Start processing (batch client doesn't need explicit connection)
      await batchClient.start();
    }

    res.json({
      success: true,
      data: {
        sessionId,
        mode: transcriptionMode,
        message: `${transcriptionMode === 'websocket' ? 'Real-time' : 'Batch'} transcription started`,
        expectedLatency: transcriptionMode === 'websocket' ? '< 100ms' : '1-2s'
      }
    });

  } catch (error) {
    next(error);
  }
};

/**
 * Stop transcription
 */
export const stopTranscription = async (req, res, next) => {
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

    // Get final metrics before closing
    const duration = Date.now() - session.startTime;
    let metrics = null;

    if (session.mode === 'websocket') {
      metrics = session.client.getMetrics();
      session.client.sendFlush();
      session.client.close();
    } else {
      await session.client.stop();
      metrics = session.client.getMetrics();
    }

    // Remove from active sessions
    activeSessions.delete(sessionId);

    logger.info(`Stopped ${session.mode} transcription (session ${sessionId}, duration: ${(duration / 1000).toFixed(1)}s)`);

    res.json({
      success: true,
      data: {
        sessionId,
        duration,
        metrics: {
          mode: session.mode,
          totalChunks: metrics?.totalChunks || 0,
          avgLatency: metrics?.avgLatency || 0,
          uptime: metrics?.uptime || duration
        }
      }
    });

  } catch (error) {
    next(error);
  }
};

/**
 * Process audio chunk
 * Handles audio streaming for both batch and WebSocket clients
 */
export const processAudioChunk = async (req, res, next) => {
  try {
    const { sessionId, audioData } = req.body; // audioData should be base64-encoded PCM16
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

    // Process based on mode
    if (session.mode === 'websocket') {
      const sent = session.client.sendAudio(audioBuffer);
      if (!sent) {
        return res.status(500).json({
          success: false,
          message: 'Failed to send audio (WebSocket not connected)'
        });
      }
    } else {
      await session.client.processChunk(audioBuffer);
    }

    res.json({
      success: true,
      data: {
        sessionId,
        bytesProcessed: audioBuffer.length
      }
    });

  } catch (error) {
    next(error);
  }
};

/**
 * Get transcription metrics
 */
export const getTranscriptionMetrics = async (req, res, next) => {
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
        mode: session.mode,
        roomName: session.roomName,
        duration,
        metrics: {
          totalChunks: metrics.totalChunks,
          avgLatency: metrics.avgLatency,
          totalDuration: metrics.totalDuration || 0,
          uptime: metrics.uptime || duration,
          isConnected: session.mode === 'websocket' ? metrics.isConnected : true,
          isSpeaking: metrics.isSpeaking || false
        }
      }
    });

  } catch (error) {
    next(error);
  }
};

/**
 * Get all active sessions (admin)
 */
export const getActiveSessions = async (req, res, next) => {
  try {
    const sessions = Array.from(activeSessions.entries()).map(([sessionId, session]) => ({
      sessionId,
      userId: session.userId,
      roomName: session.roomName,
      mode: session.mode,
      duration: Date.now() - session.startTime,
      isConnected: session.mode === 'websocket' 
        ? session.client.connected 
        : true
    }));

    res.json({
      success: true,
      data: {
        totalSessions: sessions.length,
        websocketSessions: sessions.filter(s => s.mode === 'websocket').length,
        batchSessions: sessions.filter(s => s.mode === 'batch').length,
        sessions
      }
    });

  } catch (error) {
    next(error);
  }
};

/**
 * Cleanup on server shutdown
 */
export const cleanupSessions = () => {
  logger.info(`Cleaning up ${activeSessions.size} active transcription sessions`);
  
  for (const [sessionId, session] of activeSessions.entries()) {
    try {
      if (session.mode === 'websocket') {
        session.client.sendFlush();
        session.client.close();
      } else {
        session.client.stop();
      }
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

export default {
  generateToken,
  startTranscription,
  stopTranscription,
  processAudioChunk,
  getTranscriptionMetrics,
  getActiveSessions,
  cleanupSessions
};
