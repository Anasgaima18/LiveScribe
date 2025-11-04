# LiveScribe Deployment Guide

Complete guide for deploying LiveScribe to production.

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Environment Configuration](#environment-configuration)
3. [Database Setup (MongoDB Atlas)](#database-setup)
4. [Backend Deployment](#backend-deployment)
5. [Frontend Deployment](#frontend-deployment)
6. [LiveKit Configuration](#livekit-configuration)
7. [Post-Deployment Setup](#post-deployment-setup)
8. [CI/CD Pipeline](#cicd-pipeline)
9. [Monitoring & Maintenance](#monitoring--maintenance)

---

## Prerequisites

- Node.js 18+ and npm
- MongoDB Atlas account
- LiveKit Cloud account
- Sarvam AI API key
- OpenAI API key
- Git repository (GitHub/GitLab)
- Deployment platforms:
  - Backend: Render / Railway / Heroku
  - Frontend: Vercel / Netlify
  - Optional: AWS S3 for recordings

---

## Environment Configuration

### Backend Environment Variables

Create `.env` in `backend/` directory:

```bash
# Server
PORT=5000
NODE_ENV=production
FRONTEND_URLS=https://your-frontend.vercel.app

# Database
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/livescribe?retryWrites=true&w=majority

# JWT
JWT_SECRET=your_super_secret_jwt_key_min_32_chars
JWT_EXPIRE=7d

# LiveKit
LIVEKIT_API_KEY=APIxxxxxxxxxx
LIVEKIT_API_SECRET=secretxxxxxxxxxx
LIVEKIT_URL=wss://your-project.livekit.cloud
WEBHOOK_SKIP_VERIFY=false

# Sarvam AI
SARVAM_API_KEY=your_sarvam_api_key
TRANSCRIPTION_PROVIDER=sarvam

# OpenAI
OPENAI_API_KEY=sk-xxxxxxxxxx

# Optional: AWS S3 for recordings
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_aws_key
AWS_SECRET_ACCESS_KEY=your_aws_secret
AWS_S3_BUCKET=livescribe-recordings
```

### Frontend Environment Variables

Create `.env` in `frontend/` directory:

```bash
VITE_API_URL=https://your-backend.render.com/api
VITE_LIVEKIT_URL=wss://your-project.livekit.cloud
VITE_TRANSCRIPTION_MODE=server
VITE_TRANSCRIPTION_AUTOSTART=false
```

---

## Database Setup

### MongoDB Atlas Configuration

1. **Create Cluster**
   - Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
   - Create a free M0 cluster or paid cluster
   - Choose region closest to your backend server

2. **Network Access**
   - Whitelist IP: `0.0.0.0/0` (all IPs) or specific backend IPs
   - For Render/Railway, they provide IP ranges

3. **Database User**
   - Create database user with read/write permissions
   - Use strong password (no special chars that need URL encoding)

4. **Connection String**
   - Format: `mongodb+srv://username:password@cluster.mongodb.net/livescribe`
   - Replace `<password>` with actual password
   - Add database name: `livescribe`

5. **Collections**
   - Collections auto-create on first write
   - Recommended indexes (run in MongoDB shell):
   ```js
   db.transcripts.createIndex({ callId: 1, userId: 1 });
   db.calls.createIndex({ roomId: 1 });
   db.alerts.createIndex({ callId: 1, severity: 1, createdAt: -1 });
   ```

---

## Backend Deployment

### Option 1: Render

1. **Connect Repository**
   - Sign up at [Render](https://render.com)
   - New → Web Service
   - Connect GitHub repo

2. **Configuration**
   ```yaml
   Name: livescribe-backend
   Environment: Node
   Region: Oregon (US West) or closest
   Branch: main
   Root Directory: backend
   Build Command: npm install
   Start Command: npm start
   ```

3. **Environment Variables**
   - Add all backend env vars from section above
   - Use Render's secret management

4. **Deploy**
   - Click "Create Web Service"
   - Wait for build (~3-5 min)
   - Note the URL: `https://livescribe-backend.onrender.com`

### Option 2: Railway

1. **Setup**
   - Sign up at [Railway](https://railway.app)
   - New Project → Deploy from GitHub
   - Select repository

2. **Configuration**
   - Root directory: `backend`
   - Start command: `npm start`
   - Auto-detects Node.js

3. **Environment Variables**
   - Settings → Variables
   - Add all backend env vars

4. **Custom Domain** (optional)
   - Settings → Domains
   - Add custom domain or use Railway subdomain

---

## Frontend Deployment

### Option 1: Vercel (Recommended)

1. **Import Project**
   - Sign up at [Vercel](https://vercel.com)
   - Import Git Repository
   - Select your repo

2. **Configuration**
   ```yaml
   Framework Preset: Vite
   Root Directory: frontend
   Build Command: npm run build
   Output Directory: dist
   Install Command: npm install
   ```

3. **Environment Variables**
   - Add all frontend env vars
   - Use Vercel's environment management

4. **Deploy**
   - Click Deploy
   - Wait ~2 min
   - Note URL: `https://livescribe.vercel.app`

### Option 2: Netlify

1. **New Site**
   - Sign up at [Netlify](https://www.netlify.com)
   - Sites → Add new site → Import existing project

2. **Build Settings**
   ```yaml
   Base directory: frontend
   Build command: npm run build
   Publish directory: frontend/dist
   ```

3. **Environment Variables**
   - Site settings → Build & deploy → Environment
   - Add all frontend env vars

4. **Deploy**
   - Trigger deploy
   - Note URL: `https://livescribe.netlify.app`

---

## LiveKit Configuration

### 1. Create LiveKit Project

1. Go to [LiveKit Cloud](https://cloud.livekit.io)
2. Create new project
3. Note:
   - **API Key**: `APIxxxxxxxxxx`
   - **API Secret**: `secretxxxxxxxxxx`
   - **WebSocket URL**: `wss://your-project.livekit.cloud`

### 2. Configure Webhooks

1. In LiveKit Dashboard → Webhooks
2. Add webhook URL: `https://your-backend.render.com/api/webhooks/livekit`
3. Select events:
   - `room_started`
   - `room_finished`
   - `participant_joined`
   - `participant_left`
4. Save webhook

### 3. TURN Server (Optional)

- LiveKit Cloud provides TURN servers by default
- For self-hosted: configure `coturn` or use service like Twilio TURN

---

## Post-Deployment Setup

### 1. Update CORS

Ensure backend `FRONTEND_URLS` includes your deployed frontend URL:
```bash
FRONTEND_URLS=https://livescribe.vercel.app,https://livescribe.netlify.app
```

### 2. Test Connections

```bash
# Backend health check
curl https://your-backend.render.com/api/health

# Expected response:
{
  "status": "ok",
  "timestamp": "2025-11-04T...",
  "uptime": 123.45
}
```

### 3. Create Admin User

Run this in MongoDB shell or create via API:
```js
db.admins.insertOne({
  name: "Admin User",
  email: "admin@livescribe.com",
  password: "$2a$10$hashedpassword", // Use bcrypt to hash
  role: "super_admin",
  permissions: ["all"],
  isActive: true,
  createdAt: new Date()
});
```

Or use the backend seed script if you create one.

### 4. Test Full Flow

1. Register user
2. Login
3. Create room
4. Join call with 2+ users
5. Enable transcription
6. Speak and verify transcripts appear
7. Generate summary
8. Check admin dashboard

---

## CI/CD Pipeline

### GitHub Actions (Recommended)

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy LiveScribe

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test-backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - name: Install backend deps
        run: cd backend && npm install
      - name: Run backend tests
        run: cd backend && npm test || echo "No tests yet"

  test-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - name: Install frontend deps
        run: cd frontend && npm install
      - name: Build frontend
        run: cd frontend && npm run build
      - name: Run frontend tests
        run: cd frontend && npm test || echo "No tests yet"

  deploy-backend:
    needs: [test-backend]
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - name: Trigger Render Deploy
        run: |
          curl -X POST https://api.render.com/deploy/srv-xxx?key=${{ secrets.RENDER_DEPLOY_KEY }}

  deploy-frontend:
    needs: [test-frontend]
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - name: Deploy to Vercel
        run: echo "Vercel auto-deploys on push to main"
```

### Environment Secrets

Add to GitHub → Settings → Secrets:
- `RENDER_DEPLOY_KEY`
- `MONGODB_URI`
- `JWT_SECRET`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
- `SARVAM_API_KEY`
- `OPENAI_API_KEY`

---

## Monitoring & Maintenance

### 1. Uptime Monitoring

**UptimeRobot** (Free tier):
- Monitor: `https://your-backend.render.com/api/health`
- Alert: Email/SMS when down
- Check interval: 5 minutes

### 2. Application Monitoring

**Option A: LogTail / BetterStack**
- Collect logs from backend
- Search and filter errors
- Set alerts for critical issues

**Option B: Sentry**
- Error tracking and performance monitoring
- Install Sentry SDK in backend and frontend

### 3. Database Monitoring

**MongoDB Atlas Built-in**
- Performance metrics
- Query optimization suggestions
- Disk usage alerts

### 4. Cost Monitoring

| Service | Free Tier | Paid Starts At |
|---------|-----------|----------------|
| Render | 750 hrs/mo | $7/mo |
| Vercel | Unlimited | $20/mo (team) |
| MongoDB Atlas | 512 MB | $9/mo (M10) |
| LiveKit Cloud | 10k mins/mo | $99/mo |
| Sarvam AI | Pay per use | ~$0.01/min |
| OpenAI | Pay per use | ~$0.002/1k tokens |

### 5. Backup Strategy

**Automated MongoDB Backups** (Atlas M10+):
- Daily snapshots
- Point-in-time recovery
- Retention: 7 days

**Manual Backups**:
```bash
# Export database
mongodump --uri="mongodb+srv://..." --out=./backup-2025-11-04

# Restore
mongorestore --uri="mongodb+srv://..." ./backup-2025-11-04
```

### 6. Security Checklist

- [ ] HTTPS enabled on all domains
- [ ] JWT secret is strong (32+ chars)
- [ ] Database credentials rotated
- [ ] API keys stored in secrets (not code)
- [ ] Rate limiting enabled (already in code)
- [ ] CORS configured correctly
- [ ] Helmet security headers active
- [ ] Input sanitization working
- [ ] Webhook signature verification on
- [ ] Regular dependency updates (`npm audit`)

### 7. Performance Optimization

**Backend**:
- Enable compression (already enabled)
- Use Redis for session caching (optional)
- Database indexes for frequent queries
- CDN for static assets (if self-hosting frontend)

**Frontend**:
- Lazy load components
- Code splitting (Vite does this)
- Image optimization
- Service worker for offline (optional)

### 8. Scheduled Maintenance

**Weekly**:
- Review error logs
- Check uptime reports
- Verify backups

**Monthly**:
- Update dependencies
- Review and delete old transcripts (90-day policy)
- Analyze usage and costs

**Quarterly**:
- Security audit
- Performance review
- Cost optimization

---

## Troubleshooting

### Backend won't start
- Check env vars are set correctly
- Verify MongoDB connection string
- Check logs: `render logs -t` or Railway logs

### Frontend can't connect to backend
- Verify CORS: `FRONTEND_URLS` includes frontend domain
- Check `VITE_API_URL` points to correct backend
- Test backend health endpoint directly

### LiveKit connection fails
- Verify `LIVEKIT_URL`, `API_KEY`, `API_SECRET`
- Check firewall allows WebSocket (wss://)
- Test with LiveKit example app

### Transcription not working
- Verify `SARVAM_API_KEY` is valid
- Check `TRANSCRIPTION_PROVIDER=sarvam`
- Look for errors in backend logs
- Ensure audio format is supported (PCM16 16kHz mono)

### Webhooks not triggering
- Verify webhook URL in LiveKit dashboard
- Set `WEBHOOK_SKIP_VERIFY=false` in production
- Check backend logs for webhook errors

---

## Support & Resources

- [LiveKit Docs](https://docs.livekit.io)
- [Sarvam AI Docs](https://docs.sarvam.ai)
- [MongoDB Atlas Docs](https://www.mongodb.com/docs/atlas/)
- [Render Docs](https://render.com/docs)
- [Vercel Docs](https://vercel.com/docs)

---

**Last Updated**: 2025-11-04  
**Version**: 1.0.0
