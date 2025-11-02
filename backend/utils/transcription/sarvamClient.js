// Sarvam AI Realtime Transcription Client (Skeleton)
// NOTE: Fill in the actual Sarvam realtime API endpoint and message protocol.
// This module provides a thin wrapper around a WebSocket connection to Sarvam's
// realtime ASR and emits partial/final transcripts.

import WebSocket from 'ws';
import EventEmitter from 'events';

/**
 * SarvamRealtimeClient
 * Emits events:
 *  - 'open' when the upstream connection is ready
 *  - 'partial' with { text, timestamp }
 *  - 'final' with { text, timestamp }
 *  - 'error' with Error
 *  - 'close'
 */
export class SarvamRealtimeClient extends EventEmitter {
  constructor({ url, apiKey, language = 'en', sampleRate = 16000 }) {
    super();
    this.url = url;
    this.apiKey = apiKey;
    this.language = language;
    this.sampleRate = sampleRate;
    this.ws = null;
  }

  connect() {
    if (!this.url || !this.apiKey) {
      throw new Error('Sarvam URL/API key not configured');
    }
    const headers = {
      Authorization: `Bearer ${this.apiKey}`,
    };
    this.ws = new WebSocket(this.url, { headers });

    this.ws.on('open', () => {
      // Initialize stream/session if protocol requires
      this.emit('open');
    });

    this.ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        // TODO: Adapt to Sarvam's actual message schema
        if (msg.type === 'partial') {
          this.emit('partial', { text: msg.text, timestamp: Date.now() });
        } else if (msg.type === 'final') {
          this.emit('final', { text: msg.text, timestamp: Date.now() });
        }
      } catch (e) {
        // Non-JSON payloads are ignored
      }
    });

    this.ws.on('error', (err) => this.emit('error', err));
    this.ws.on('close', () => this.emit('close'));
  }

  /**
   * Send raw PCM16 mono 16kHz audio bytes
   * @param {Buffer} pcmChunk
   */
  sendAudio(pcmChunk) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      // TODO: Wrap according to Sarvam protocol if needed
      this.ws.send(pcmChunk);
    }
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

/**
 * Factory to create a realtime client from env vars
 */
export function createSarvamClient() {
  const url = process.env.SARVAM_REALTIME_URL;
  const apiKey = process.env.SARVAM_API_KEY;
  return new SarvamRealtimeClient({ url, apiKey });
}
