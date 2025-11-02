import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { LiveKitRoom, VideoConference, RoomAudioRenderer, StartAudio } from '@livekit/components-react';
import '@livekit/components-styles';
import { useAuth } from '../context/AuthContext.jsx';
import api from '../utils/api';
import TranscriptPanel from '../components/TranscriptPanel.jsx';
import { installAllErrorSuppressors } from '../utils/errorSuppressor.js';
import '../styles/VideoRoom.css';

const VideoRoom = () => {
  const { roomId } = useParams();
  const { user } = useAuth();
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
      const { data } = await api.get('/livekit/token', {
        params: {
          roomName: roomId,
          participantName: user.name
        }
      });
      
      if (!isMountedRef.current) return;
      
      setToken(data.token);
      
      const callResponse = await api.post('/calls', { roomId });
      
      if (!isMountedRef.current) return;
      
      setCallId(callResponse.data._id);
      setLoading(false);
    } catch (err) {
      console.error('Error fetching token:', err);
      if (isMountedRef.current) {
        setError('Failed to join room');
        setLoading(false);
      }
    }
  }, [roomId, user]);

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

  const handleDisconnect = useCallback(async () => {
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
  
  const handleConnected = useCallback(() => {
    setIsConnected(true);
    console.log('Connected to LiveKit room');
  }, []);
  
  const handleError = useCallback((error) => {
    console.error('LiveKit error:', error);
    
    // Suppress internal LiveKit errors that don't affect functionality
    const errorMessage = error?.message || String(error);
    if (errorMessage.includes('Element not part of the array') || 
        errorMessage.includes('placeholder')) {
      // These are internal LiveKit DOM management errors that can be ignored
      return;
    }
    
    // Only show critical errors to the user
    if (error?.code === 'CONNECTION_FAILED' || error?.code === 'ROOM_DISCONNECTED') {
      setError('Connection lost. Please try rejoining the room.');
    }
  }, []);

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
      <LiveKitRoom
        token={token}
        serverUrl={import.meta.env.VITE_LIVEKIT_URL}
        data-lk-theme="default"
        style={{ height: '100vh' }}
        onConnected={handleConnected}
        onDisconnected={handleDisconnect}
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
        }}
      >
        <div className="room-header">
          <h3>Room: {roomId}</h3>
          <div className="room-actions">
            <button 
              onClick={() => setShowTranscripts(!showTranscripts)}
              className="btn-transcript"
            >
              {showTranscripts ? 'Hide Transcripts' : 'Show Transcripts'}
            </button>
            <button onClick={handleDisconnect} className="btn-leave">
              Leave Call
            </button>
          </div>
        </div>

        {/* Video Conference Component */}
        <div className="video-conference-wrapper">
          <VideoConference 
            chatMessageFormatter={undefined}
            SettingsComponent={undefined}
          />
        </div>
        
        {/* Audio Controls */}
        <StartAudio label="Enable Audio" />
        <RoomAudioRenderer />
        
        {/* Transcript Panel */}
        {showTranscripts && callId && (
          <TranscriptPanel callId={callId} />
        )}
      </LiveKitRoom>
    </div>
  );
};

export default VideoRoom;
