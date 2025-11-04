import React from 'react';
import '../styles/ErrorBoundary.css';

const ConsentModal = ({ open, onAccept, onDecline }) => {
  if (!open) return null;
  return (
    <div className="error-overlay" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
      <div className="error-modal" role="dialog" aria-modal="true" aria-labelledby="consent-title">
        <h2 id="consent-title">Recording & Transcription Consent</h2>
        <p>
          This meeting may record and transcribe audio to provide live captions and post-call summaries.
          By continuing, you consent to processing your audio for these features.
        </p>
        <ul style={{ textAlign: 'left', marginTop: 8 }}>
          <li>Realtime captions powered by Sarvam AI</li>
          <li>Optional post-call summary with OpenAI</li>
          <li>Transcripts stored securely for your call</li>
        </ul>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 16 }}>
          <button onClick={onDecline} className="btn-stop">Decline</button>
          <button onClick={onAccept} className="btn-start">I Agree</button>
        </div>
      </div>
    </div>
  );
};

export default ConsentModal;
