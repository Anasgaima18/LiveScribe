# Quick Start Guide

## 🚀 Get Started in 5 Minutes

### Step 1: Install Dependencies

```powershell
# Backend
cd D:\Projects\livekit-video-call\backend
npm install

# Frontend
cd D:\Projects\livekit-video-call\frontend
npm install
```

### Step 2: Configure Environment Variables

**Backend (.env):**
```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/livekit-video-call
JWT_SECRET=your_secret_key_here
LIVEKIT_API_KEY=your_livekit_key
LIVEKIT_API_SECRET=your_livekit_secret
LIVEKIT_URL=wss://your-project.livekit.cloud
OPENAI_API_KEY=your_openai_key
FRONTEND_URL=http://localhost:3000
```

**Frontend (.env):**
```env
VITE_API_URL=http://localhost:5000/api
VITE_LIVEKIT_URL=wss://your-project.livekit.cloud
```

### Step 3: Start MongoDB

```powershell
# If using local MongoDB
mongod
```

Or use MongoDB Atlas (cloud) - see README.md

### Step 4: Run the Application

**Terminal 1 - Backend:**
```powershell
cd backend
npm run dev
```

**Terminal 2 - Frontend:**
```powershell
cd frontend
npm run dev
```

### Step 5: Access the Application

Open your browser and navigate to:
- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:5000

### First Use

1. **Register** a new account at `/register`
2. **Login** with your credentials
3. **View Dashboard** - see all users
4. **Select users** and click "Start Video Call"
5. **Join the call** and test video/audio
6. **View transcripts** (add manually via API for testing)
7. **Generate summary** with OpenAI

## 📝 Need Help?

- Check the full **README.md** for detailed documentation
- Review API endpoints and architecture
- Troubleshooting section available in README

## 🔑 Getting Free API Keys

- **LiveKit:** https://cloud.livekit.io (Free tier available)
- **OpenAI:** https://platform.openai.com (Free trial credits)
- **MongoDB Atlas:** https://www.mongodb.com/cloud/atlas (Free tier available)

---

**Note:** This is a development setup. For production, ensure you:
- Use HTTPS
- Secure your environment variables
- Set up proper database backups
- Configure production-grade LiveKit servers
- Implement rate limiting and security measures
