# Production Setup Guide

## Environment Variables

### Critical Security Settings

#### 1. JWT Secret
Generate a strong random secret (minimum 64 characters):

```bash
# Generate secure JWT secret (Node.js)
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Or using OpenSSL
openssl rand -hex 64
```

Set in production `.env`:
```bash
JWT_SECRET=<your_generated_secret_here>
```

#### 2. MongoDB URI
Ensure your MongoDB Atlas URI includes the database name:
```bash
MONGODB_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/livekit-video-call?retryWrites=true&w=majority
```

#### 3. Frontend URLs
Set your production frontend URL(s):
```bash
FRONTEND_URLS=https://yourdomain.com,https://www.yourdomain.com
FRONTEND_URL=https://yourdomain.com
```

### API Keys Required

1. **LiveKit** (required for video calls)
   - Sign up at https://livekit.io
   - Get API Key, API Secret, and WebSocket URL
   
2. **OpenAI** (required for transcription summaries)
   - Get key from https://platform.openai.com/api-keys
   
3. **Sarvam AI** (optional - for realtime transcription)
   - Get key from Sarvam AI platform
   - Set `TRANSCRIPTION_PROVIDER=sarvam` to enable

### Full Production .env Template

```bash
# Server
PORT=5000
NODE_ENV=production

# Database
MONGODB_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/livekit-video-call?retryWrites=true&w=majority

# Security
JWT_SECRET=<64-char-random-hex>
JWT_EXPIRE=7d

# LiveKit
LIVEKIT_API_KEY=<your_key>
LIVEKIT_API_SECRET=<your_secret>
LIVEKIT_URL=wss://your-project.livekit.cloud

# AI Services
OPENAI_API_KEY=<your_key>
SARVAM_API_KEY=<your_key>
SARVAM_REALTIME_URL=wss://api.sarvam.ai/realtime
TRANSCRIPTION_PROVIDER=sarvam

# CORS
FRONTEND_URLS=https://yourdomain.com
FRONTEND_URL=https://yourdomain.com
```

## Deployment Checklist

- [ ] Generate and set strong JWT_SECRET
- [ ] Add database name to MONGODB_URI
- [ ] Set NODE_ENV=production
- [ ] Configure all required API keys
- [ ] Set production FRONTEND_URL(s)
- [ ] Enable HTTPS/TLS
- [ ] Configure firewall rules
- [ ] Set up monitoring and logging
- [ ] Test all endpoints before launch
- [ ] Enable rate limiting (already configured)
- [ ] Review Helmet CSP settings

## Health Check

After deployment, verify:
```bash
curl https://yourdomain.com/api/health
```

Expected response:
```json
{
  "status": "ok",
  "message": "Server is running",
  "timestamp": "...",
  "uptime": 123.45,
  "environment": "production"
}
```
