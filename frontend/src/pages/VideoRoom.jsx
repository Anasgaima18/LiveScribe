import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { LiveKitRoom, VideoConference, RoomAudioRenderer, StartAudio } from '@livekit/components-react';
import '@livekit/components-styles';
import { useAuth } from '../context/AuthContext.jsx';
import { useSocket } from '../context/SocketContext.jsx';
import api from '../utils/api';
import TranscriptPanel from '../components/TranscriptPanel.jsx';
import { installAllErrorSuppressors } from '../utils/errorSuppressor.js';
import { diagnoseConnectionFailure } from '../utils/livekitDiagnostics.js';
import '../styles/VideoRoom.css';

const VideoRoom = () => {
  const { roomId } = useParams();
  const { user } = useAuth();
  const socket = useSocket();
  const navigate = useNavigate();
  
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [callId, setCallId] = useState(null);
  const [showTranscripts, setShowTranscripts] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const isMountedRef = useRef(true);

  const fetchToken = useCallback(async () => {
    try {
      console.log('[VideoRoom] Fetching LiveKit token for room:', roomId);
      
      const { data } = await api.get('/livekit/token', {
        params: {
          roomName: roomId,
          participantName: user.name
        }
      });
      
      if (!isMountedRef.current) return;
      
      console.log('[VideoRoom] Token received, LiveKit URL:', data.url);
      console.log('[VideoRoom] Room name:', data.roomName);
      
      setToken(data.token);
      
      const callResponse = await api.post('/calls', { roomId });
      
      if (!isMountedRef.current) return;
      
      setCallId(callResponse.data._id);
      setLoading(false);
    } catch (err) {
      console.error('[VideoRoom] Error fetching token:', err);
      console.error('[VideoRoom] Error details:', err.response?.data);
      
      if (isMountedRef.current) {
        const errorMsg = err.response?.data?.message || 'Failed to join room. Please check LiveKit configuration.';
        setError(errorMsg);
        setLoading(false);
      }
    }
  }, [roomId, user]);

  // Join socket room when component mounts
  useEffect(() => {
    if (socket && roomId) {
      console.log(`[VideoRoom] Joining socket room: ${roomId}`);
      socket.emit('call:join', { roomId });
      
      return () => {
        console.log(`[VideoRoom] Leaving socket room: ${roomId}`);
        socket.emit('call:leave', { roomId });
      };
    }
  }, [socket, roomId]);

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    
    fetchToken();
    
    // Install error suppressors for LiveKit internal errors
    const cleanupErrorSuppressors = installAllErrorSuppressors();
    
    // Cleanup function
    return () => {
      isMountedRef.current = false;
      cleanupErrorSuppressors();
    };
  }, [user, roomId, fetchToken, navigate]);

  const handleLeaveCall = useCallback(async () => {
    setIsConnected(false);
    
    if (callId) {
      try {
        await api.put(`/calls/${callId}/end`);
      } catch (err) {
        console.error('Error ending call:', err);
      }
    }
    
    // Small delay to allow LiveKit to cleanup
    setTimeout(() => {
      if (isMountedRef.current) {
        navigate('/dashboard');
      }
    }, 300);
  }, [callId, navigate]);
  
  const handleDisconnected = useCallback(() => {
    // Only log disconnections, don't navigate away
    // This allows LiveKit to reconnect automatically
    console.log('[VideoRoom] Temporarily disconnected from LiveKit');
    setIsConnected(false);
  }, []);
  
  const handleConnected = useCallback(() => {
    setIsConnected(true);
    console.log('[VideoRoom] ✅ Successfully connected to LiveKit room');
  }, []);
  
  const handleError = useCallback((error) => {
    console.error('[VideoRoom] ❌ LiveKit error:', error);
    console.error('[VideoRoom] Error code:', error?.code);
    console.error('[VideoRoom] Error message:', error?.message);
    
    // Suppress internal LiveKit errors that don't affect functionality
    const errorMessage = error?.message || String(error);
    if (errorMessage.includes('Element not part of the array') || 
        errorMessage.includes('placeholder')) {
      // These are internal LiveKit DOM management errors that can be ignored
      return;
    }
    
    // Handle connection errors
    if (error?.code === 'CONNECTION_FAILED' || 
        error?.code === 'ROOM_DISCONNECTED' ||
        errorMessage.includes('peerconnection failed') ||
        errorMessage.includes('WebSocket')) {
      console.error('[VideoRoom] Connection issue detected. Possible causes:');
      console.error('  - LiveKit server is down or unreachable');
      console.error('  - Invalid API credentials');
      console.error('  - Network/firewall blocking WebSocket connection');
      console.error('  - STUN/TURN server configuration issue');
      
      // Run diagnostics
      if (token) {
        diagnoseConnectionFailure(import.meta.env.VITE_LIVEKIT_URL, token).catch(console.error);
      }
      
      setError(
        'Unable to establish video connection. This could be due to:\n' +
        '• LiveKit server configuration issues\n' +
        '• Network/firewall restrictions\n' +
        '• Invalid credentials\n\n' +
        'Please check the console for detailed diagnostics.'
      );
    }
  }, [token]);

  if (loading) {
    return <div className="loading">Connecting to room...</div>;
  }

  if (error) {
    return (
      <div className="error-container">
        <h2>Error</h2>
        <p>{error}</p>
        <button onClick={() => navigate('/dashboard')}>Back to Dashboard</button>
      </div>
    );
  }

  return (
    <div className="video-room-container">
      {!isConnected && (
        <div className="connection-status">
          <p>🔄 Connecting to LiveKit server...</p>
          <small>If this takes too long, the server may be inactive</small>
        </div>
      )}
      
      <LiveKitRoom
        token={token}
        serverUrl={import.meta.env.VITE_LIVEKIT_URL}
        data-lk-theme="default"
        style={{ height: '100vh' }}
        onConnected={handleConnected}
        onDisconnected={handleDisconnected}
        onError={handleError}
        connectOptions={{
          autoSubscribe: true,
          publishDefaults: {
            videoSimulcastLayers: [
              { quality: 'high', width: 1280, height: 720 },
              { quality: 'medium', width: 640, height: 360 },
              { quality: 'low', width: 320, height: 180 },
            ],
          },
          // Configure ICE servers for better connectivity
          rtcConfig: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' },
              { urls: 'stun:stun2.l.google.com:19302' },
              { urls: 'stun:stun3.l.google.com:19302' },
              { urls: 'stun:stun4.l.google.com:19302' },
            ],
            iceTransportPolicy: 'all',
            iceCandidatePoolSize: 10,
          },
          // Increase reconnection attempts with more aggressive backoff
          reconnectPolicy: {
            nextRetryDelayInMs: (context) => {
              if (context.retryCount === 0) return 500;  // First retry fast
              if (context.retryCount < 3) return 1000;   // Next few retries at 1s
              return Math.min(2000 * context.retryCount, 10000);
            },
            maxAttempts: 15,
          },
          // Add disconnection recovery
          peerConnectionTimeout: 15000,
        }}
      >
        {/* Room Header - Fixed at top */}
        <div className="room-header">
          <h3>Room: {roomId}</h3>
          <div className="room-actions">
            <button 
              onClick={() => setShowTranscripts(!showTranscripts)}
              className="btn-transcript"
            >
              {showTranscripts ? 'Hide Transcripts' : 'Show Transcripts'}
            </button>
            <button onClick={handleLeaveCall} className="btn-leave">
              Leave Call
            </button>
          </div>
        </div>

        {/* Main Video Conference - Full Screen */}
        <VideoConference 
          style={{ 
            width: '100%', 
            height: '100%',
            position: 'absolute',
            top: '65px',
            left: 0,
            right: 0,
            bottom: 0
          }}
        />
        
        {/* Audio Controls - Hidden but functional */}
        <StartAudio label="Click to Enable Audio" />
        <RoomAudioRenderer />
        
        {/* Transcript Panel - Overlay on right */}
        {showTranscripts && callId && (
          <div className="transcript-overlay">
            <TranscriptPanel callId={callId} />
          </div>
        )}
      </LiveKitRoom>
    </div>
  );
};

export default VideoRoom;
