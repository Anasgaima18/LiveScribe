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
      // Notify backend to start Sarvam session
      socket.emit('transcription:start', { roomId, language: 'en' });

      // Start audio capture and stream chunks
      await startCapture((base64Chunk) => {
        socket.emit('transcription:audio', { chunk: base64Chunk });
      });

      setStatus('active');
    } catch (err) {
      console.error('Failed to start realtime transcription:', err);
      setStatus('idle');
    }
  };

  const handleStop = () => {
    if (!socket) return;

    setStatus('stopping');
    stopCapture();
    socket.emit('transcription:stop');
    setStatus('idle');
  };

  if (!enabled) {
    return null;
  }

  return (
    <div className="realtime-transcription">
      <div className="rt-header">
        <h4>Realtime Transcription</h4>
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
