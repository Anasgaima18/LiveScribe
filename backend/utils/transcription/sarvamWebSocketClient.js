/**
 * Sarvam AI WebSocket Client for Real-Time Speech-to-Text Streaming
 * Native WebSocket implementation using Sarvam's official streaming API
 * 
 * Official Documentation:
 * - STT: https://docs.sarvam.ai/api-reference-docs/speech-to-text-streaming/transcribe/ws
 * - STT+Translate: https://docs.sarvam.ai/api-reference-docs/speech-to-text-translate-streaming/translate/ws
 * 
 * Features:
 * - True real-time streaming (< 100ms latency)
 * - Native WebSocket connection to wss://api.sarvam.ai/
 * - VAD (Voice Activity Detection) signals
 * - Automatic reconnection and error handling
 * - Support for both transcription and translation modes
 * - Metrics tracking (audio_duration, processing_latency)
 */

import WebSocket from 'ws';
import EventEmitter from 'events';
import logger from '../../config/logger.js';

const SARVAM_WS_BASE_URL = 'wss://api.sarvam.ai';

/**
 * Sarvam WebSocket Streaming Client
 * Provides real-time speech-to-text with sub-second latency
 */
export class SarvamWebSocketClient extends EventEmitter {
  constructor(apiKey, options = {}) {
    super();
    
    if (!apiKey) {
      throw new Error('Sarvam API key is required');
    }
    
    this.apiKey = apiKey;
    this.options = {
      language: options.language || 'en-IN',
      model: options.model || 'saarika:v2.5',
      mode: options.mode || 'transcribe', // 'transcribe' or 'translate'
      sampleRate: options.sampleRate || '16000',
      inputAudioCodec: options.inputAudioCodec || 'pcm_s16le',
      highVadSensitivity: options.highVadSensitivity || 'true',
      vadSignals: options.vadSignals || 'true',
      flushSignal: options.flushSignal || 'true',
      ...options
    };
    
    this.ws = null;
    this.isConnected = false;
    this.isConnecting = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000; // Start with 1s
    this.maxReconnectDelay = 30000; // Max 30s
    
    // Metrics tracking
    this.metrics = {
      totalChunks: 0,
      totalDuration: 0,
      totalLatency: 0,
      avgLatency: 0,
      startTime: null
    };
    
    // State management
    this.isSpeaking = false;
    this.lastTranscript = '';
    this.sessionId = null;
  }

  /**
   * Connect to Sarvam WebSocket server
   */
  async connect() {
    if (this.isConnected || this.isConnecting) {
      logger.warn('Already connected or connecting to Sarvam WebSocket');
      return;
    }
    
    this.isConnecting = true;
    
    try {
      const endpoint = this.options.mode === 'translate' 
        ? '/speech-to-text-translate/ws'
        : '/speech-to-text/ws';
      
      // Build query parameters
      const params = new URLSearchParams({
        model: this.options.mode === 'translate' ? 'saaras:v2.5' : this.options.model,
        input_audio_codec: this.options.inputAudioCodec,
        sample_rate: this.options.sampleRate,
        high_vad_sensitivity: this.options.highVadSensitivity,
        vad_signals: this.options.vadSignals,
        flush_signal: this.options.flushSignal
      });
      
      // Add language code only for transcription mode
      if (this.options.mode === 'transcribe') {
        params.append('language-code', this.options.language);
      }
      
      const wsUrl = `${SARVAM_WS_BASE_URL}${endpoint}?${params.toString()}`;
      
      logger.info(`🔌 Connecting to Sarvam WebSocket: ${endpoint} (${this.options.mode} mode, ${this.options.language})`);
      
      this.ws = new WebSocket(wsUrl, {
        headers: {
          'Api-Subscription-Key': this.apiKey
        }
      });
      
      this.setupEventHandlers();
      
      // Wait for connection with timeout
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('WebSocket connection timeout'));
        }, 10000);
        
        this.ws.once('open', () => {
          clearTimeout(timeout);
          resolve();
        });
        
        this.ws.once('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });
      
    } catch (error) {
      this.isConnecting = false;
      logger.error('Failed to connect to Sarvam WebSocket:', error);
      throw error;
    }
  }

  /**
   * Setup WebSocket event handlers
   */
  setupEventHandlers() {
    this.ws.on('open', () => {
      this.isConnected = true;
      this.isConnecting = false;
      this.reconnectAttempts = 0;
      this.reconnectDelay = 1000;
      this.sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      this.metrics.startTime = Date.now();
      
      logger.info(`✅ Connected to Sarvam WebSocket (session: ${this.sessionId})`);
      this.emit('connected', { sessionId: this.sessionId });
      
      // Send config message if in translate mode and prompt is provided
      if (this.options.mode === 'translate' && this.options.prompt) {
        this.sendConfig(this.options.prompt);
      }
    });

    this.ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleMessage(message);
      } catch (error) {
        logger.error('Failed to parse WebSocket message:', error);
      }
    });

    this.ws.on('error', (error) => {
      logger.error('Sarvam WebSocket error:', error);
      this.emit('error', error);
    });

    this.ws.on('close', (code, reason) => {
      this.isConnected = false;
      this.isConnecting = false;
      
      logger.warn(`Sarvam WebSocket closed (code: ${code}, reason: ${reason})`);
      this.emit('disconnected', { code, reason: reason.toString() });
      
      // Attempt reconnection if not intentionally closed
      if (code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
        this.scheduleReconnect();
      }
    });
  }

  /**
   * Handle incoming WebSocket messages
   */
  handleMessage(message) {
    const { type, data } = message;
    
    switch (type) {
      case 'data':
        this.handleTranscriptionData(data);
        break;
        
      case 'events':
        this.handleEventData(data);
        break;
        
      case 'error':
        this.handleErrorData(data);
        break;
        
      default:
        logger.warn('Unknown message type:', type);
    }
  }

  /**
   * Handle transcription data
   */
  handleTranscriptionData(data) {
    const { request_id, transcript, language_code, metrics } = data;
    
    if (!transcript || transcript.trim().length === 0) {
      return;
    }
    
    // Update metrics
    if (metrics) {
      this.metrics.totalChunks++;
      this.metrics.totalDuration += metrics.audio_duration || 0;
      this.metrics.totalLatency += metrics.processing_latency || 0;
      this.metrics.avgLatency = this.metrics.totalLatency / this.metrics.totalChunks;
    }
    
    // Emit transcript
    this.lastTranscript = transcript;
    this.emit('transcript', {
      requestId: request_id,
      text: transcript,
      language: language_code,
      metrics: metrics,
      isFinal: true, // Sarvam WebSocket returns final transcripts
      sessionId: this.sessionId
    });
    
    logger.debug(`📝 Transcript (${language_code || 'detected'}): "${transcript.substring(0, 50)}..." [latency: ${metrics?.processing_latency?.toFixed(0)}ms]`);
  }

  /**
   * Handle VAD event data
   */
  handleEventData(data) {
    const { signal_type, occured_at } = data;
    
    if (signal_type === 'START_SPEECH') {
      this.isSpeaking = true;
      this.emit('speech_start', { timestamp: occured_at });
      logger.debug('🎤 Speech started');
    } else if (signal_type === 'END_SPEECH') {
      this.isSpeaking = false;
      this.emit('speech_end', { timestamp: occured_at });
      logger.debug('🔇 Speech ended');
    }
  }

  /**
   * Handle error data
   */
  handleErrorData(data) {
    const { error, code } = data;
    logger.error(`Sarvam API error (${code}): ${error}`);
    this.emit('api_error', { error, code });
  }

  /**
   * Send audio chunk to Sarvam
   * @param {Buffer} audioBuffer - PCM audio buffer (16kHz, mono, 16-bit)
   */
  sendAudio(audioBuffer) {
    if (!this.isConnected || !this.ws) {
      logger.warn('Cannot send audio: WebSocket not connected');
      return false;
    }
    
    try {
      // Convert buffer to base64
      const base64Audio = audioBuffer.toString('base64');
      
      const message = {
        audio: {
          data: base64Audio,
          sample_rate: this.options.sampleRate,
          encoding: 'audio/wav',
          input_audio_codec: this.options.inputAudioCodec
        }
      };
      
      this.ws.send(JSON.stringify(message));
      return true;
    } catch (error) {
      logger.error('Failed to send audio:', error);
      return false;
    }
  }

  /**
   * Send config message (for translate mode with domain prompting)
   * @param {string} prompt - Domain-specific prompt for better translation
   */
  sendConfig(prompt) {
    if (!this.isConnected || !this.ws) {
      logger.warn('Cannot send config: WebSocket not connected');
      return false;
    }
    
    if (this.options.mode !== 'translate') {
      logger.warn('Config message only supported in translate mode');
      return false;
    }
    
    try {
      const message = {
        type: 'config',
        prompt: prompt
      };
      
      this.ws.send(JSON.stringify(message));
      logger.info(`📋 Sent domain prompt: "${prompt.substring(0, 50)}..."`);
      return true;
    } catch (error) {
      logger.error('Failed to send config:', error);
      return false;
    }
  }

  /**
   * Send flush signal to finalize transcription
   */
  sendFlush() {
    if (!this.isConnected || !this.ws) {
      logger.warn('Cannot send flush: WebSocket not connected');
      return false;
    }
    
    try {
      const message = {
        type: 'flush'
      };
      
      this.ws.send(JSON.stringify(message));
      logger.debug('🔄 Sent flush signal');
      return true;
    } catch (error) {
      logger.error('Failed to send flush:', error);
      return false;
    }
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  scheduleReconnect() {
    this.reconnectAttempts++;
    
    const delay = Math.min(
      this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
      this.maxReconnectDelay
    );
    
    logger.info(`🔄 Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
    setTimeout(() => {
      this.connect().catch(error => {
        logger.error('Reconnection failed:', error);
      });
    }, delay);
  }

  /**
   * Get current metrics
   */
  getMetrics() {
    const uptime = this.metrics.startTime 
      ? Date.now() - this.metrics.startTime 
      : 0;
    
    return {
      ...this.metrics,
      uptime,
      isConnected: this.isConnected,
      isSpeaking: this.isSpeaking
    };
  }

  /**
   * Close WebSocket connection
   */
  close() {
    if (this.ws) {
      this.reconnectAttempts = this.maxReconnectAttempts; // Prevent reconnection
      this.ws.close(1000, 'Client closed connection');
      this.ws = null;
      this.isConnected = false;
      logger.info('👋 Closed Sarvam WebSocket connection');
    }
  }

  /**
   * Check if connected
   */
  get connected() {
    return this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN;
  }
}

/**
 * Factory function to create Sarvam WebSocket client
 */
export function createSarvamWebSocketClient(apiKey, options = {}) {
  return new SarvamWebSocketClient(apiKey, options);
}

export default SarvamWebSocketClient;
