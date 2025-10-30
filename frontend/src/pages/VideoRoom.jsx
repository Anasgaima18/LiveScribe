import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { LiveKitRoom, VideoConference, RoomAudioRenderer, StartAudio } from '@livekit/components-react';
import '@livekit/components-styles';
import { useAuth } from '../context/AuthContext.jsx';
import api from '../utils/api';
import TranscriptPanel from '../components/TranscriptPanel.jsx';
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

  const fetchToken = useCallback(async () => {
    try {
      const { data } = await api.get('/livekit/token', {
        params: {
          roomName: roomId,
          participantName: user.name
        }
      });
      
      setToken(data.token);
      
      const callResponse = await api.post('/calls', { roomId });
      setCallId(callResponse.data._id);
      
      setLoading(false);
    } catch (err) {
      console.error('Error fetching token:', err);
      setError('Failed to join room');
      setLoading(false);
    }
  }, [roomId, user]);

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    
    fetchToken();
  }, [user, roomId, fetchToken, navigate]);

  const handleDisconnect = async () => {
    if (callId) {
      try {
        await api.put(`/calls/${callId}/end`);
      } catch (err) {
        console.error('Error ending call:', err);
      }
    }
    navigate('/dashboard');
  };

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
        video
        audio
        token={token}
        serverUrl={import.meta.env.VITE_LIVEKIT_URL}
        data-lk-theme="default"
        style={{ height: '100vh' }}
        onDisconnected={handleDisconnect}
        connectOptions={{
          autoSubscribe: true,
          publishDefaults: {
            videoSimulcastLayers: 'hq',
            video: true,
            audio: true,
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

  <VideoConference />
  {/* Prompt user to enable audio to avoid AudioContext autoplay errors */}
  <StartAudio label="Enable Audio" />
  <RoomAudioRenderer />
        
        {showTranscripts && callId && (
          <TranscriptPanel callId={callId} />
        )}
      </LiveKitRoom>
    </div>
  );
};

export default VideoRoom;
