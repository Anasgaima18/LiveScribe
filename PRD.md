# LiveScribe PRD (Product Requirements Document)

Last updated: 2025-11-04

## 1. Summary
LiveScribe is a secure, multi-user video calling platform with live transcription, safety monitoring, and post-call insights. It uses LiveKit for video, Sarvam AI for speech-to-text (realtime and batch), OpenAI for summarization, and MongoDB for persistence.

Primary users:
- End users: join rooms, talk, see live transcripts, and receive summaries
- Admins: monitor calls, review alerts, and manage users

Success criteria:
- < 3s median transcript latency in realtime mode
- 99% API uptime (backend), 95th percentile p95 < 300ms for core APIs
- Summaries generated for >95% of ended calls within 30s

## 2. Scope
- Authentication: JWT-based login/registration
- Calls: create/join/leave using LiveKit access tokens
- Realtime STT (Sarvam): stream PCM16 to backend; broadcast transcripts to room; persist final segments
- Batch STT (Sarvam): upload large recordings after call ends (optional)
- Threat detection: AI-first (OpenAI) with keyword fallback; create alerts
- Summarization: OpenAI summary per call
- Webhooks: handle LiveKit participant and room lifecycle
- Admin: read-only dashboards for Calls, Transcripts, Alerts
- Privacy: user consent UI before recording/transcription

Out of scope v1:
- Recording storage and playback UI
- Full chat persistence
- Fine-grained role-based access control beyond admin/user

## 3. User Stories & Acceptance Criteria

### 3.1 Authentication
As a user, I can register and login to get a JWT.
- AC: POST /api/auth/register and /api/auth/login return JWT; protected routes require JWT.

### 3.2 Call Join
As a user, I can join a video room.
- AC: GET /api/livekit/token returns a valid LiveKit token; client connects and publishes media.

### 3.3 Realtime Transcription (server mode)
As a user, I can enable live captions.
- AC:
  - Frontend streams 16kHz mono PCM16 as base64 via Socket.IO to backend
  - Backend pushes partial/final segments to all participants via `transcript:new`
  - Final segments persist to `Transcript` collection when `callId` provided
  - Errors are reported via `transcript:status` and don’t crash the room

### 3.4 Summarization
As a user, I can generate a summary of the call.
- AC: POST /api/calls/:callId/summarize returns a concise summary; summary is stored on Call.

### 3.5 Threat Detection
As an admin, I want alerts when harmful content appears.
- AC: On transcript save, text is scanned. If threats are detected, an `Alert` is created with severity and context.

### 3.6 Webhooks
As a system, I track room membership.
- AC: When a participant joins/leaves, Calls are updated; when room ends, Call status becomes `ended`.

### 3.7 Consent & Privacy
As a user, I see a consent prompt before recording/transcription.
- AC: User must check a consent box before streaming audio to STT.

## 4. Functional Requirements

- Realtime transcription
  - Inputs: base64-encoded PCM16 chunks (~200–300ms per chunk) from client
  - Outputs: Socket event `transcript:new` with {userId,userName,segment}
  - Persistence: Only final (isPartial=false) segments saved under user’s Transcript

- Batch transcription
  - Inputs: audio file upload to Sarvam REST endpoint (<= 30s for REST); longer audio via Batch API
  - Outputs: single transcript string, optional timestamps

- Threat detection
  - Pipeline: AI analysis (OpenAI) → fallback keyword scan
  - Outputs: `Alert` document with severity, matched words/issues, and context

- Summaries
  - Inputs: combined per-user transcripts
  - Outputs: concise paragraph + bullet action items (prompt-guided)

## 5. Non-Functional Requirements
- Security: JWT, HTTPS, sanitized input (mongoSanitize/hpp), Helmet, rate-limits
- Observability: logs (winston), socket lifecycle logs, health endpoint `/api/health`
- Performance: Low GC pressure on audio path; batch size to keep <3s latency
- Privacy: No transcripts or audio leave the system without consent

## 6. Data Model
- User { name, email, passwordHash }
- Call { roomId, participants[{ userId, joinAt, leaveAt }], status, startedAt, endedAt, summary }
- Transcript { callId, userId, segments[{ text, timestamp, isPartial }] }
- Alert { callId, userId, matchedWords[], severity, context, aiAnalysis? }

## 7. APIs & Events
- REST
  - POST /api/calls { roomId, participants } → Call
  - PUT /api/calls/:callId/end → Call
  - GET /api/calls → Call[]
  - POST /api/calls/:callId/transcripts { segments } → Transcript
  - GET /api/calls/:callId/transcripts → Transcript[]
  - POST /api/calls/:callId/summarize → { summary }
  - GET /api/calls/:callId/alerts → Alert[]
  - GET /api/livekit/token?roomName&participantName → { token, url }

- Socket.IO
  - Client → Server: call:join, call:leave, chat:message, transcription:start, transcription:audio, transcription:text, transcription:stop
  - Server → Client: user:joined, user:left, chat:message, transcript:new, transcript:status, alert:new

## 8. Tech Stack
- Frontend: React + Vite + Tailwind CSS
- Backend: Node.js + Express, Socket.IO
- Video: LiveKit (server token gen, client WebRTC)
- STT: Sarvam AI (Realtime via REST micro-batching, Batch API for long audio)
- AI: OpenAI (summarization, threat analysis)
- Database: MongoDB Atlas
- Storage: AWS S3 (optional recordings)

## 9. Environments & Config
- .env keys: see `backend/.env.example`
- Vite env: VITE_TRANSCRIPTION_MODE=server|browser, VITE_TRANSCRIPTION_AUTOSTART=true|false

## 10. Risks & Mitigations
- STT latency too high → tune batch size, reduce resampling cost, send smaller chunks
- OpenAI outages → degrade to keyword-only threat detection; mark alerts as `method: keyword`
- CORS / WS failures → keep allowedOrigins list in sync; log socket handshake errors

## 11. Rollout
- Dev → Staging (with mock users and rooms) → Production
- Health checks and minimal synthetic test (join room, send audio, expect transcript)

## 12. KPI & Monitoring
- Transcript latency distribution, errors per minute
- Summary success rate and generation time
- Alert counts by severity per call
- Socket active connections, room counts
