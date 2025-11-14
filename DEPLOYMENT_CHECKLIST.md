# Deployment Checklist for Render

## Backend Environment Variables (Render Backend Service)

```bash
# Server
NODE_ENV=production
PORT=5000

# CORS - ADD YOUR FRONTEND URL HERE
FRONTEND_URLS=https://livescribe-frontend.onrender.com

# MongoDB
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/livescribe

# JWT
JWT_SECRET=your-strong-jwt-secret-here

# LiveKit
LIVEKIT_API_KEY=your-livekit-api-key
LIVEKIT_API_SECRET=your-livekit-api-secret
LIVEKIT_URL=wss://your-project.livekit.cloud

# Sarvam AI (for transcription)
TRANSCRIPTION_PROVIDER=sarvam
SARVAM_API_KEY=your-sarvam-api-key

# Optional: OpenAI for summaries
OPENAI_API_KEY=your-openai-key
```

## Frontend Environment Variables (Render Frontend Service)

```bash
# Backend API - ADD YOUR BACKEND URL HERE
VITE_API_URL=https://livescribe-backend.onrender.com/api

# LiveKit
VITE_LIVEKIT_URL=wss://your-project.livekit.cloud

# Transcription
VITE_TRANSCRIPTION_MODE=server
VITE_TRANSCRIPTION_AUTOSTART=true
```

## Common Issues & Fixes

### 1. CORS Errors
**Problem:** Browser shows "has been blocked by CORS policy"

**Fix:** Ensure `FRONTEND_URLS` in backend includes your exact frontend URL:
```bash
FRONTEND_URLS=https://livescribe-frontend.onrender.com
```

### 2. Socket.IO Connection Fails
**Problem:** Socket.IO shows "xhr poll error"

**Fix:** Same as CORS - make sure `FRONTEND_URLS` is set correctly in backend.

### 3. API Calls Fail
**Problem:** "Failed to load users" or other API errors

**Fix:** Ensure `VITE_API_URL` in frontend points to your backend:
```bash
VITE_API_URL=https://livescribe-backend.onrender.com/api
```

### 4. Transcription Not Working
**Problem:** No transcripts appearing

**Fix:** Check backend has:
```bash
TRANSCRIPTION_PROVIDER=sarvam
SARVAM_API_KEY=your-actual-key
```

## Verification Steps

After deployment:

1. **Check Backend Health:**
   - Visit: `https://your-backend.onrender.com/api/health`
   - Should return: `{"status":"ok",...}`

2. **Check Frontend Loads:**
   - Visit: `https://your-frontend.onrender.com`
   - Should show login page without errors

3. **Check Browser Console:**
   - Open DevTools → Console
   - Should NOT see CORS errors
   - Socket.IO should show "connected"

4. **Test Login:**
   - Create account or login
   - Should redirect to dashboard
   - "Available Users" should load (not "Failed to load users")

## Performance Notes

- **Transcription Latency:** Now tuned for ~1-1.5s delay (was 5s+)
- **Batch Settings:** Optimized for realtime feel
- **Mode:** Default is `accuracy`; set `SARVAM_LATENCY_MODE=speed` for even lower latency

## Support

If issues persist:
1. Check Render logs (backend & frontend)
2. Check browser DevTools → Network tab
3. Verify all environment variables are set correctly
4. Ensure MongoDB is accessible from Render
