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
  const [language, setLanguage] = useState('auto'); // 'auto' | 'en' | 'hi' | 'kn' | 'te' | 'ta' | 'gu' ...
  const [detectedLanguage, setDetectedLanguage] = useState('');

  useEffect(() => {
    if (!socket || !enabled) return;

    // Listen for realtime transcript updates
    const handleTranscript = ({ userId, userName, segment }) => {
      console.log('Received transcript:', { userId, userName, segment });
      if (segment && segment.language) {
        setDetectedLanguage(segment.language);
      }
      setTranscripts((prev) => {
        // If partial, replace last partial with new partial
        // If final, append as new entry
        if (segment.isPartial && prev.length > 0 && prev[prev.length - 1].isPartial) {
          const updated = [...prev];
          updated[updated.length - 1] = {
            userName,
            text: segment.text,
            isPartial: true,
            originalText: segment.originalText,
            translatedText: segment.translatedText,
            dualMode: segment.dualMode
          };
          return updated;
        }
        return [...prev, {
          userName,
          text: segment.text,
          isPartial: segment.isPartial,
          originalText: segment.originalText,
          translatedText: segment.translatedText,
          dualMode: segment.dualMode,
          language: segment.language
        }];
      });
    };

    // Listen for provider status updates
    const handleStatus = ({ status, provider, reason }) => {
      console.log('Transcription status:', { status, provider, reason });
      setProviderStatus(status);
      if (provider) setProviderName(provider);

      if (status === 'active') {
        setStatus('active');
      } else if (status === 'error') {
        setStatus('idle');
        console.error('Transcription error:', reason);
      }
    };

    socket.on('transcript:new', handleTranscript);
    socket.on('transcript:status', handleStatus);

    return () => {
      socket.off('transcript:new', handleTranscript);
      socket.off('transcript:status', handleStatus);
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
        console.log('Starting Sarvam transcription for room:', roomId, 'lang:', language);
        socket.emit('transcription:start', { roomId, language });

        // Start audio capture and stream chunks to backend
        await startCapture((base64Chunk, meta) => {
          if (base64Chunk && base64Chunk.length > 0) {
            socket.emit('transcription:audio', { chunk: base64Chunk, meta });
          }
        });

        setProviderName('sarvam');
        console.log('Audio capture started, waiting for backend confirmation...');
      }

      setStatus('active');
    } catch (err) {
      console.error('Failed to start realtime transcription:', err);
      setStatus('idle');
      setProviderStatus('error');
    }
  };

  const handleStop = () => {
    if (!socket) return;

    setStatus('stopping');
    if (window.__rt_recognition) {
      try { window.__rt_recognition.stop(); } catch { }
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

  // Auto start transcription when component mounts
  useEffect(() => {
    if (enabled && roomId && status === 'idle' && socket) {
      // Small delay to ensure LiveKit connection is established
      const timer = setTimeout(() => {
        handleStart();
      }, 500); // Reduced from 2000ms for faster start
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, roomId, socket]);

  return (
    <div className="realtime-transcription">
      <div className="rt-header">
        <div className="rt-header-row">
          <h4>Realtime Transcription</h4>
          <div className="rt-status">
            Mode: {providerName || mode} | Status: {providerStatus}
            {detectedLanguage && ` | Lang: ${detectedLanguage}`}
          </div>
        </div>
        
        <div className="rt-controls-group">
          <label className="rt-label">
            Language:
            <select 
              value={language} 
              onChange={(e) => setLanguage(e.target.value)} 
              className="rt-select"
            >
              <option value="auto">Auto (detect + English)</option>
              <option value="en">English</option>
              <option value="hi">Hindi</option>
              <option value="kn">Kannada</option>
              <option value="te">Telugu</option>
              <option value="ta">Tamil</option>
              <option value="gu">Gujarati</option>
            </select>
          </label>
          
          <div className="rt-controls">
            {!isCapturing ? (
              <button
                onClick={handleStart}
                disabled={status === 'starting' || !enabled}
                className="btn-start"
                title={!enabled ? 'Accept consent to enable transcription' : 'Start transcription'}
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
        
        {!enabled && (
          <div className="rt-warning">
            ⚠️ Consent required - Reload page to accept recording consent
          </div>
        )}
      </div>

      {isCapturing && (
        <div className="rt-indicator">
          <span className="pulse-dot"></span>
          Recording... {providerStatus === 'active' ? `(${providerName} active)` : '(waiting for server...)'}
        </div>
      )}

      {providerStatus === 'error' && (
        <div className="rt-error">
          ⚠️ Transcription service error. Check console for details.
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
              className={`rt-item ${t.isPartial ? 'partial' : 'final'} ${t.dualMode ? 'dual-mode' : ''}`}
            >
              <span className="rt-speaker">{t.userName}:</span>
              {t.dualMode ? (
                <div className="rt-dual-content">
                  <div className="rt-dual-row">
                    <span className="rt-dual-label">Original ({t.language || 'detected'}):</span>
                    <span className="rt-text rt-original">{t.originalText}</span>
                  </div>
                  <div className="rt-dual-row">
                    <span className="rt-dual-label">English:</span>
                    <span className="rt-text rt-translated">{t.translatedText}</span>
                  </div>
                </div>
              ) : (
                <span className="rt-text">{t.text}</span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default RealtimeTranscription;
