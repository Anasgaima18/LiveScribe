# LiveScribe - AI-Powered Video Conferencing Platform

A real-time video conferencing web application built with the MERN stack and LiveKit API. LiveScribe features intelligent transcription, AI-powered content moderation, meeting summaries, and seamless multi-user video collaboration.

## Features

✅ **User Authentication** - JWT-based secure authentication  
✅ **Video Conferencing** - One-to-one and group video calls using LiveKit  
✅ **Real-time Chat** - Built-in chat functionality  
✅ **Voice Transcription** - Automatic speech-to-text per user  
✅ **AI Content Moderation** - OpenAI GPT-4 powered threat detection with confidence scoring  
✅ **AI Summarization** - OpenAI-powered meeting summaries  
✅ **User Dashboard** - View all users and initiate calls  
✅ **Transcript Management** - View, store, and analyze call transcripts  

## Tech Stack

### Backend
- Node.js & Express.js
- MongoDB (Mongoose)
- JWT Authentication
- LiveKit Server SDK
- OpenAI API

### Frontend
- React.js (with Vite)
- LiveKit Components React
- React Router
- Axios
- Modern CSS

## Prerequisites

Before running this application, make sure you have:

- Node.js (v16 or higher)
- MongoDB (local or Atlas)
- LiveKit account and credentials
- OpenAI API key

## Installation

### 1. Clone the repository

```bash
cd D:\Projects\livekit-video-call
```

### 2. Backend Setup

```bash
cd backend
npm install
```

Create a `.env` file in the backend directory:

```env
PORT=5000
NODE_ENV=development

# MongoDB
MONGODB_URI=mongodb://localhost:27017/livekit-video-call

# JWT
JWT_SECRET=your_super_secret_jwt_key_change_this
JWT_EXPIRE=7d

# LiveKit (Get from https://cloud.livekit.io)
LIVEKIT_API_KEY=your_livekit_api_key
LIVEKIT_API_SECRET=your_livekit_api_secret
LIVEKIT_URL=wss://your-project.livekit.cloud

# OpenAI
OPENAI_API_KEY=your_openai_api_key

# CORS
FRONTEND_URL=http://localhost:3000
```

### 3. Frontend Setup

```bash
cd ../frontend
npm install
```

Create a `.env` file in the frontend directory:

```env
VITE_API_URL=http://localhost:5000/api
VITE_LIVEKIT_URL=wss://your-project.livekit.cloud
```

## Getting API Keys

### LiveKit Setup
1. Go to [LiveKit Cloud](https://cloud.livekit.io)
2. Create a free account
3. Create a new project
4. Copy your API Key, Secret, and WebSocket URL
5. Add them to your backend `.env` file

### OpenAI Setup
1. Go to [OpenAI Platform](https://platform.openai.com)
2. Create an account or sign in
3. Navigate to API Keys section
4. Create a new API key
5. Add it to your backend `.env` file

### MongoDB Setup

**Option 1: Local MongoDB**
```bash
# Install MongoDB locally and start the service
mongod
```

**Option 2: MongoDB Atlas (Cloud)**
1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Create a free account
3. Create a cluster
4. Get your connection string
5. Update `MONGODB_URI` in your `.env` file

## Running the Application

### Start Backend Server

```bash
cd backend
npm run dev
```

Backend will run on `http://localhost:5000`

### Start Frontend Development Server

```bash
cd frontend
npm run dev
```

Frontend will run on `http://localhost:3000`

## Usage Guide

### 1. Register an Account
- Navigate to `http://localhost:3000/register`
- Fill in your name, email, and password
- Click "Register"

### 2. Login
- Navigate to `http://localhost:3000/login`
- Enter your credentials
- Click "Login"

### 3. Dashboard
- View all registered users
- Select one or multiple users
- Click "Start Video Call" to initiate a call

### 4. Video Call Room
- Join the video call
- Use camera and microphone
- Click "Show Transcripts" to view the transcript panel
- View real-time transcripts organized by user
- Check alerts for any flagged content
- Click "Generate Summary" to create an AI summary of the call
- Click "Leave Call" to end the session

### 5. Transcription (Manual Testing)

To test transcription functionality, you can manually add transcripts via API:

```bash
# Example: Add a transcript segment
curl -X POST http://localhost:5000/api/calls/{callId}/transcripts \
  -H "Authorization: Bearer {your_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "segments": [{
      "text": "Hello, this is a test transcript",
      "startTime": 0,
      "endTime": 5
    }]
  }'
```

**Note:** In a production environment, you would integrate with a Speech-to-Text service (like OpenAI Whisper, Google Speech-to-Text, or LiveKit's transcription) to automatically transcribe audio in real-time.

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/users` - Get all users (protected)
- `GET /api/auth/me` - Get current user (protected)

### LiveKit
- `GET /api/livekit/token` - Generate room access token (protected)

### Calls
- `POST /api/calls` - Create new call (protected)
- `GET /api/calls` - Get user's calls (protected)
- `PUT /api/calls/:callId/end` - End a call (protected)
- `POST /api/calls/:callId/transcripts` - Save transcript (protected)
- `GET /api/calls/:callId/transcripts` - Get transcripts (protected)
- `POST /api/calls/:callId/summarize` - Generate AI summary (protected)
- `GET /api/calls/:callId/alerts` - Get alerts (protected)

## Project Structure

```
livekit-video-call/
├── backend/
│   ├── config/
│   │   └── db.js
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── callController.js
│   │   └── livekitController.js
│   ├── middleware/
│   │   └── auth.js
│   ├── models/
│   │   ├── User.js
│   │   ├── Call.js
│   │   ├── Transcript.js
│   │   └── Alert.js
│   ├── routes/
│   │   ├── authRoutes.js
│   │   ├── callRoutes.js
│   │   └── livekitRoutes.js
│   ├── utils/
│   │   └── threatDetection.js
│   ├── .env
│   ├── package.json
│   └── server.js
├── frontend/
│   ├── public/
│   │   └── index.html
│   ├── src/
│   │   ├── components/
│   │   │   └── TranscriptPanel.js
│   │   ├── context/
│   │   │   └── AuthContext.js
│   │   ├── pages/
│   │   │   ├── Dashboard.js
│   │   │   ├── Login.js
│   │   │   ├── Register.js
│   │   │   └── VideoRoom.js
│   │   ├── styles/
│   │   │   ├── Auth.css
│   │   │   ├── Dashboard.css
│   │   │   ├── TranscriptPanel.css
│   │   │   └── VideoRoom.css
│   │   ├── utils/
│   │   │   └── api.js
│   │   ├── App.js
│   │   ├── index.js
│   │   └── index.css
│   ├── .env
│   └── package.json
└── README.md
```

## Threat Detection

The system automatically scans transcripts for threatening or inappropriate words across multiple severity levels:

- **Critical**: Violence, weapons, death threats
- **High**: Serious threats, abuse, assault
- **Medium**: Harassment, discrimination, fraud
- **Low**: General inappropriate language

Alerts are automatically generated and stored when flagged content is detected.

## Security Features

- JWT-based authentication
- Password hashing with bcrypt
- HTTPS encryption (recommended for production)
- Protected API routes
- CORS configuration
- Input validation
- Secure credential storage via environment variables

## Future Enhancements

✅ **Real-time Translation** - Multi-language support (15+ languages)  
✅ **Cloud Storage** - AWS/Azure/Cloudinary support for recordings  
✅ **Admin Dashboard** - Comprehensive monitoring and analytics  
✅ **AI Content Moderation** - Advanced threat detection using OpenAI GPT-4  
✅ **Screen Sharing** - Share your screen during calls  
✅ **Email Notifications** - Alert system for security events  
- [ ] Chat history persistence
- [ ] Video recording playback

## Troubleshooting

### Backend won't start
- Check if MongoDB is running
- Verify all environment variables are set correctly
- Ensure port 5000 is not in use

### Frontend won't connect
- Verify backend is running
- Check CORS settings in backend
- Ensure proxy is configured in frontend package.json

### Video call not working
- Verify LiveKit credentials are correct
- Check LiveKit URL format (should start with wss://)
- Ensure camera/microphone permissions are granted in browser

### OpenAI summarization fails
- Verify OpenAI API key is valid
- Check you have sufficient API credits
- Ensure transcripts exist before generating summary

## License

This project is open source and available under the MIT License.

## Support

For issues and questions, please create an issue in the repository or contact the development team.

---

Built with ❤️ using MERN Stack + LiveKit + OpenAI
