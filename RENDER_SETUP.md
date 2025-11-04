# Render Deployment Setup Guide

## Critical CORS Fix for Production

### Problem
Your frontend on `https://livescribe-frontend.onrender.com` cannot connect to your backend on `https://livescribe.onrender.com` because of CORS (Cross-Origin Resource Sharing) restrictions.

### Solution: Update Backend Environment Variables on Render

1. **Go to your Render Dashboard**: https://dashboard.render.com/
2. **Select your backend service** (livescribe)
3. **Navigate to "Environment" tab**
4. **Update or add the `FRONTEND_URLS` variable**:
   ```
   FRONTEND_URLS=http://localhost:5173,http://localhost:3000,https://livescribe-frontend.onrender.com
   ```

5. **Save Changes** - Render will automatically redeploy your backend

### Required Environment Variables for Production

Make sure these are set in your Render backend service:

#### Database
```bash
MONGODB_URI=mongodb+srv://username:password@cluster0.nafibm7.mongodb.net/livescribe?retryWrites=true&w=majority
```

#### Authentication
```bash
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
```

#### LiveKit Configuration
```bash
LIVEKIT_API_KEY=APIL2YNBvoSUenA
LIVEKIT_API_SECRET=your_livekit_api_secret
LIVEKIT_URL=wss://videochat-bqwb1uca.livekit.cloud
```

#### Sarvam AI (for Transcription)
```bash
SARVAM_API_KEY=sk_cecqxnly_dfQvmsElKvt7pq9o7FjjGx44
TRANSCRIPTION_PROVIDER=sarvam
```

#### OpenAI (for AI Features)
```bash
OPENAI_API_KEY=your_openai_api_key
```

#### Frontend URLs (CRITICAL for CORS)
```bash
FRONTEND_URLS=http://localhost:5173,http://localhost:3000,https://livescribe-frontend.onrender.com
FRONTEND_URL=http://localhost:5173
```

#### Optional - Data Retention
```bash
TRANSCRIPT_RETENTION_DAYS=90
ALERT_RETENTION_DAYS=180
CALL_RETENTION_DAYS=365
ENABLE_CLEANUP_JOBS=true
```

### Frontend Environment Variables

Make sure your frontend on Render has these environment variables:

```bash
VITE_API_URL=https://livescribe.onrender.com
VITE_LIVEKIT_URL=wss://videochat-bqwb1uca.livekit.cloud
VITE_TRANSCRIPTION_MODE=server
VITE_TRANSCRIPTION_AUTOSTART=false
```

## Testing After Deployment

1. **Check Backend Health**:
   ```bash
   curl https://livescribe.onrender.com/api/health
   ```
   Should return: `{"status":"ok"}`

2. **Check CORS Headers**:
   ```bash
   curl -I -X OPTIONS https://livescribe.onrender.com/api/auth/users \
     -H "Origin: https://livescribe-frontend.onrender.com" \
     -H "Access-Control-Request-Method: GET"
   ```
   Should include: `Access-Control-Allow-Origin: https://livescribe-frontend.onrender.com`

3. **Test Socket.IO Connection**:
   Open your frontend and check browser console - should see:
   ```
   [SOCKET] Connected successfully
   ```

## Common Issues

### 1. CORS Error: "No 'Access-Control-Allow-Origin' header"
**Solution**: Make sure `FRONTEND_URLS` includes your frontend domain

### 2. WebSocket Connection Failed
**Solution**: 
- Ensure backend is running on Render
- Check that frontend has correct `VITE_API_URL`
- Verify Socket.IO is properly initialized

### 3. Transcription Not Working
**Solution**:
- Verify `SARVAM_API_KEY` is set correctly
- Check `TRANSCRIPTION_PROVIDER=sarvam`
- Ensure frontend has `VITE_TRANSCRIPTION_MODE=server`

### 4. LiveKit Video Not Working
**Solution**:
- Verify `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`
- Check `LIVEKIT_URL` matches your LiveKit Cloud project
- Ensure frontend has `VITE_LIVEKIT_URL` set

## Deployment Checklist

- [ ] Backend deployed on Render with all environment variables
- [ ] Frontend deployed on Render with all environment variables
- [ ] `FRONTEND_URLS` includes production frontend URL
- [ ] MongoDB Atlas IP whitelist includes Render IPs (or set to 0.0.0.0/0)
- [ ] LiveKit credentials are valid
- [ ] Sarvam API key is active
- [ ] Health endpoint returns 200 OK
- [ ] Socket.IO connects successfully
- [ ] Video calls work
- [ ] Transcription works

## Quick Fix Commands

If you need to restart services:

```bash
# Trigger backend redeploy (commit and push)
git add .
git commit -m "Update environment configuration"
git push origin main

# Or use Render Dashboard "Manual Deploy" button
```

## Support

If issues persist:
1. Check Render logs: Dashboard → Your Service → Logs
2. Check browser console for frontend errors
3. Test API endpoints with curl/Postman
4. Verify all environment variables are set correctly
