import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSocket } from '../context/SocketContext.jsx';
import api from '../utils/api';
import '../styles/TranscriptPanel.css';
import '../styles/AutoScroll.css';

const TranscriptPanel = ({ callId }) => {
  const [transcripts, setTranscripts] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [summary, setSummary] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('transcripts');
  const [autoScroll, setAutoScroll] = useState(true);
  const socket = useSocket();
  const transcriptListRef = useRef(null);
  const alertListRef = useRef(null);

  // Auto-scroll to bottom when new content arrives
  useEffect(() => {
    if (!autoScroll) return;
    
    const scrollToBottom = () => {
      if (activeTab === 'transcripts' && transcriptListRef.current) {
        transcriptListRef.current.scrollTop = transcriptListRef.current.scrollHeight;
      } else if (activeTab === 'alerts' && alertListRef.current) {
        alertListRef.current.scrollTop = alertListRef.current.scrollHeight;
      }
    };
    
    // Small delay to ensure DOM is updated
    const timer = setTimeout(scrollToBottom, 100);
    return () => clearTimeout(timer);
  }, [transcripts, alerts, activeTab, autoScroll]);

  // Detect manual scroll to disable auto-scroll
  const handleScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    setAutoScroll(isAtBottom);
  };

  const fetchTranscripts = useCallback(async () => {
    try {
      const { data } = await api.get(`/calls/${callId}/transcripts`);
      setTranscripts(data);
    } catch (err) {
      console.error('Error fetching transcripts:', err);
    }
  }, [callId]);

  const fetchAlerts = useCallback(async () => {
    try {
      const { data } = await api.get(`/calls/${callId}/alerts`);
      setAlerts(data);
    } catch (err) {
      console.error('Error fetching alerts:', err);
    }
  }, [callId]);

  useEffect(() => {
    if (!callId) return;

    // Initial fetch
    fetchTranscripts();
    fetchAlerts();

    // Subscribe to real-time transcript and alert events
    if (socket) {
      const onTranscriptNew = (payload) => {
        // payload: { userId, userName, segment }
        setTranscripts((prev) => {
          // Try to find an existing transcript for the user
          const idx = prev.findIndex(t => t.userId && t.userId._id === payload.userId);
          const seg = payload.segment || {};
          const newSeg = {
            text: seg.text || '',
            timestamp: seg.timestamp || Date.now(),
          };
          if (idx >= 0) {
            const updated = [...prev];
            updated[idx] = {
              ...updated[idx],
              segments: [...(updated[idx].segments || []), newSeg],
            };
            return updated;
          }
          // If no transcript for this user yet, create a new one entry-like
          return [
            ...prev,
            {
              userId: { _id: payload.userId, name: payload.userName },
              segments: [newSeg],
            },
          ];
        });
      };

      const onAlertNew = (payload) => {
        // payload: { userId, userName, alert }
        setAlerts((prev) => [
          ...prev,
          {
            ...payload.alert,
            userId: { _id: payload.userId, name: payload.userName },
          },
        ]);
      };

      socket.on('transcript:new', onTranscriptNew);
      socket.on('alert:new', onAlertNew);

      return () => {
        socket.off('transcript:new', onTranscriptNew);
        socket.off('alert:new', onAlertNew);
      };
    }

    // Fallback polling every 5s if no socket
    const interval = setInterval(() => {
      fetchTranscripts();
      fetchAlerts();
    }, 5000);
    return () => clearInterval(interval);
  }, [callId, fetchTranscripts, fetchAlerts, socket]);

  const generateSummary = async () => {
    setLoading(true);
    try {
      const { data } = await api.post(`/calls/${callId}/summarize`);
      setSummary(data.summary);
      setActiveTab('summary');
    } catch (err) {
      console.error('Error generating summary:', err);
      alert('Failed to generate summary. Make sure there are transcripts available.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="transcript-panel">
      <div className="panel-header">
        <div className="panel-tabs">
          <button 
            className={activeTab === 'transcripts' ? 'active' : ''}
            onClick={() => setActiveTab('transcripts')}
          >
            Transcripts ({transcripts.length})
          </button>
          <button 
            className={activeTab === 'alerts' ? 'active' : ''}
            onClick={() => setActiveTab('alerts')}
          >
            Alerts ({alerts.length})
          </button>
          <button 
            className={activeTab === 'summary' ? 'active' : ''}
            onClick={() => setActiveTab('summary')}
          >
            Summary
          </button>
        </div>
        
        <button 
          onClick={generateSummary} 
          disabled={loading || transcripts.length === 0}
          className="btn-summarize"
        >
          {loading ? '📝 Generating...' : '📝 Generate Summary'}
        </button>
      </div>

      <div className="panel-content">
        {activeTab === 'transcripts' && (
          <div className="transcripts-list" ref={transcriptListRef} onScroll={handleScroll}>
            {transcripts.length === 0 ? (
              <p className="empty-message">No transcripts yet</p>
            ) : (
              <>
                {transcripts.map((transcript, index) => (
                  <div key={index} className="transcript-item">
                    <div className="transcript-header">
                      <strong>{transcript.userId?.name || 'Unknown'}</strong>
                    </div>
                    <div className="transcript-segments">
                      {transcript.segments.map((segment, idx) => (
                        <p key={idx} className="segment">
                          <span className="time">
                            [{new Date(segment.timestamp).toLocaleTimeString()}]
                          </span>
                          {segment.text}
                        </p>
                      ))}
                    </div>
                  </div>
                ))}
                {!autoScroll && (
                  <button
                    onClick={() => {
                      setAutoScroll(true);
                      if (transcriptListRef.current) {
                        transcriptListRef.current.scrollTop = transcriptListRef.current.scrollHeight;
                      }
                    }}
                    className="btn-scroll-bottom"
                    title="Scroll to latest transcript"
                  >
                    ↓ New transcripts
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === 'alerts' && (
          <div className="alerts-list" ref={alertListRef} onScroll={handleScroll}>
            {alerts.length === 0 ? (
              <p className="empty-message">No alerts</p>
            ) : (
              <>
                {alerts.map((alert, index) => (
                  <div key={index} className={`alert-item severity-${alert.severity}`}>
                    <div className="alert-header">
                      <span className="alert-user">{alert.userId?.name}</span>
                      <span className={`alert-badge ${alert.severity}`}>
                        {alert.severity.toUpperCase()}
                      </span>
                    </div>
                    <div className="alert-details">
                      <p className="matched-words">
                        <strong>Flagged words:</strong> {alert.matchedWords.join(', ')}
                      </p>
                      <p className="context">
                        <strong>Context:</strong> "{alert.context}"
                      </p>
                      <p className="timestamp">
                        {new Date(alert.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
                {!autoScroll && (
                  <button
                    onClick={() => {
                      setAutoScroll(true);
                      if (alertListRef.current) {
                        alertListRef.current.scrollTop = alertListRef.current.scrollHeight;
                      }
                    }}
                    className="btn-scroll-bottom"
                    title="Scroll to latest alert"
                  >
                    ↓ New alerts
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === 'summary' && (
          <div className="summary-content">
            {summary ? (
              <div className="summary-text">
                <h3>Call Summary</h3>
                <p>{summary}</p>
              </div>
            ) : (
              <p className="empty-message">
                Click "Generate Summary" to create an AI-powered summary of this call
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default TranscriptPanel;
