import React, { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import '../styles/TranscriptPanel.css';

const TranscriptPanel = ({ callId }) => {
  const [transcripts, setTranscripts] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [summary, setSummary] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('transcripts');

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

    fetchTranscripts();
    fetchAlerts();

    const interval = setInterval(() => {
      fetchTranscripts();
      fetchAlerts();
    }, 5000);

    return () => clearInterval(interval);
  }, [callId, fetchTranscripts, fetchAlerts]);

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
          className="btn-summarize"
          disabled={loading || transcripts.length === 0}
        >
          {loading ? 'Generating...' : 'Generate Summary'}
        </button>
      </div>

      <div className="panel-content">
        {activeTab === 'transcripts' && (
          <div className="transcripts-list">
            {transcripts.length === 0 ? (
              <p className="empty-message">No transcripts yet</p>
            ) : (
              transcripts.map((transcript, index) => (
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
              ))
            )}
          </div>
        )}

        {activeTab === 'alerts' && (
          <div className="alerts-list">
            {alerts.length === 0 ? (
              <p className="empty-message">No alerts</p>
            ) : (
              alerts.map((alert, index) => (
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
              ))
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
