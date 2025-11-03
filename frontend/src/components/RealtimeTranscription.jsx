import React, { useState, useEffect } from 'react';
import { useSocket } from '../context/SocketContext.jsx';
import { useAudioCapture } from '../utils/audioCapture.js';
import '../styles/RealtimeTranscription.css';

/**
 * RealtimeTranscription - UI control for Sarvam realtime transcription
 * Captures audio and streams to backend via Socket.IO
 */
const RealtimeTranscription = ({ roomId, callId, enabled = true }) => {
  const socket = useSocket();
  const { startCapture, stopCapture, isCapturing, error } = useAudioCapture();
  const [transcripts, setTranscripts] = useState([]);
  const [status, setStatus] = useState('idle'); // idle, starting, active, stopping
  const mode = (import.meta.env.VITE_TRANSCRIPTION_MODE || 'server').toLowerCase(); // 'server' | 'browser'
  const autoStart = (import.meta.env.VITE_TRANSCRIPTION_AUTOSTART === 'true');
  const [providerStatus, setProviderStatus] = useState('idle'); // idle | active | disabled | error
  const [providerName, setProviderName] = useState('');

  useEffect(() => {
    if (!socket || !enabled) return;

    // Listen for realtime transcript updates
    const handleTranscript = ({ userId, userName, segment }) => {
      setTranscripts((prev) => {
        // If partial, replace last partial with new partial
        // If final, append as new entry
        if (segment.isPartial && prev.length > 0 && prev[prev.length - 1].isPartial) {
          const updated = [...prev];
          updated[updated.length - 1] = { userName, text: segment.text, isPartial: true };
          return updated;
        }
        return [...prev, { userName, text: segment.text, isPartial: segment.isPartial }];
      });
    };

    socket.on('transcript:new', handleTranscript);

    return () => {
      socket.off('transcript:new', handleTranscript);
    };
  }, [socket, enabled]);

  const handleStart = async () => {
    if (!socket || !roomId) return;

    setStatus('starting');
    try {
  if (mode === 'browser' && (('webkitSpeechRecognition' in window) || ('SpeechRecognition' in window))) {
        // Browser speech recognition fallback
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.lang = 'en-US';
        recognition.interimResults = true;
        recognition.continuous = true;

        recognition.onresult = (event) => {
          let interim = '';
          let finalText = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) finalText += transcript;
            else interim += transcript;
          }
          if (interim) {
            socket.emit('transcription:text', { roomId, callId, text: interim, isPartial: true });
          }
          if (finalText) {
            socket.emit('transcription:text', { roomId, callId, text: finalText, isPartial: false });
          }
        };
        recognition.onerror = (e) => console.warn('SpeechRecognition error', e.error);
        recognition.onend = () => console.log('SpeechRecognition ended');
        recognition.start();
        // Attach to window so we can stop later
        window.__rt_recognition = recognition;
        setProviderStatus('active');
        setProviderName('browser');
      } else {
        // Server-side (Sarvam) mode
        socket.emit('transcription:start', { roomId, language: 'en' });
        // Start audio capture and stream chunks to backend
        await startCapture((base64Chunk) => {
          socket.emit('transcription:audio', { chunk: base64Chunk });
        });
        setProviderName('sarvam');
      }

      setStatus('active');
    } catch (err) {
      console.error('Failed to start realtime transcription:', err);
      setStatus('idle');
    }
  };

  const handleStop = () => {
    if (!socket) return;

    setStatus('stopping');
    if (window.__rt_recognition) {
      try { window.__rt_recognition.stop(); } catch {}
      window.__rt_recognition = null;
    }
    stopCapture();
    socket.emit('transcription:stop');
    setStatus('idle');
    setProviderStatus('idle');
  };

  // Listen for backend provider status updates
  useEffect(() => {
    if (!socket) return;
    const onStatus = ({ status, provider, reason }) => {
      setProviderStatus(status);
      if (provider) setProviderName(provider);
      if (status === 'error') console.warn('Transcription provider error:', reason);
      if (status === 'disabled') console.warn('Transcription provider disabled:', reason);
    };
    socket.on('transcript:status', onStatus);
    return () => socket.off('transcript:status', onStatus);
  }, [socket]);

  // Auto start if enabled
  useEffect(() => {
    if (autoStart && status === 'idle') {
      handleStart();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  if (!enabled) {
    return null;
  }

  return (
    <div className="realtime-transcription">
      <div className="rt-header">
        <h4>Realtime Transcription</h4>
        <div className="rt-status">{`Mode: ${providerName || mode} | Status: ${providerStatus}`}</div>
        <div className="rt-controls">
          {!isCapturing ? (
            <button
              onClick={handleStart}
              disabled={status === 'starting'}
              className="btn-start"
            >
              {status === 'starting' ? 'Starting...' : '🎤 Start'}
            </button>
          ) : (
            <button
              onClick={handleStop}
              disabled={status === 'stopping'}
              className="btn-stop"
            >
              {status === 'stopping' ? 'Stopping...' : '⏹ Stop'}
            </button>
          )}
        </div>
      </div>

      {isCapturing && (
        <div className="rt-indicator">
          <span className="pulse-dot"></span>
          Recording...
        </div>
      )}

      {error && (
        <div className="rt-error">
          ⚠️ {error}
        </div>
      )}

      <div className="rt-transcript-list">
        {transcripts.length === 0 ? (
          <p className="rt-empty">Start recording to see realtime transcripts...</p>
        ) : (
          transcripts.map((t, idx) => (
            <div
              key={idx}
              className={`rt-item ${t.isPartial ? 'partial' : 'final'}`}
            >
              <span className="rt-speaker">{t.userName}:</span>
              <span className="rt-text">{t.text}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default RealtimeTranscription;
