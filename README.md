<div align="center">

# 📹 LiveScribe

### AI-Powered Video Conferencing Platform with Intelligent Transcription

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen)](https://nodejs.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-8.0-green)](https://www.mongodb.com/)
[![React](https://img.shields.io/badge/React-18.2-blue)](https://reactjs.org/)
[![LiveKit](https://img.shields.io/badge/LiveKit-2.0-orange)](https://livekit.io/)
[![OpenAI](https://img.shields.io/badge/OpenAI-GPT--4-purple)](https://openai.com/)

[Features](#-features) • [Installation](#-installation) • [Usage](#-usage) • [API Documentation](#-api-documentation) • [Deployment](#-deployment) • [Contributing](#-contributing)

---

</div>

## 📖 About

**LiveScribe** is a modern, enterprise-grade video conferencing platform that combines real-time video communication with AI-powered features. Built with the MERN stack and LiveKit infrastructure, it offers intelligent transcription, automated content moderation, meeting summaries, and seamless collaboration tools.

### 🎯 Key Highlights

- 🎥 **HD Video Calls** - Crystal-clear one-to-one and group video conferencing
- 🤖 **AI-Powered** - Intelligent content moderation and meeting summarization
- 📝 **Live Transcription** - Real-time speech-to-text with per-user tracking
- 🔒 **Enterprise Security** - JWT authentication, encrypted communications, CORS protection
- 🌐 **Multi-language Support** - Translation capabilities for global teams
- 📊 **Admin Dashboard** - Comprehensive analytics and monitoring tools
- ⚡ **High Performance** - Built with Vite for optimized load times
- 🎨 **Modern UI/UX** - Clean, intuitive interface with responsive design

---

## ✨ Features

### 🔐 Core Functionality

- **User Authentication & Authorization**
  - JWT-based secure authentication
  - Password hashing with bcrypt
  - Role-based access control
  - Session management

- **Video Conferencing**
  - One-to-one video calls
  - Multi-participant group calls
  - HD video quality powered by LiveKit
  - Adaptive bitrate streaming
  - Camera and microphone controls

- **Real-time Communication**
  - Built-in text chat
  - Socket.IO integration
  - Low-latency messaging
  - Typing indicators

### 🤖 AI-Powered Features

- **Intelligent Content Moderation**
  - OpenAI GPT-4 powered threat detection
  - Real-time transcript analysis
  - Confidence scoring (0-100%)
  - Multi-category classification:
    - Violence & weapons detection
    - Harassment & hate speech
    - Threats & intimidation
    - Sexual content filtering
    - Self-harm prevention
  - Automated alert generation
  - Email notifications for critical threats

- **AI Meeting Summarization**
  - Automatic meeting summaries
  - Key points extraction
  - Action items identification
  - Powered by OpenAI GPT models

- **Voice Transcription**
  - Real-time speech-to-text
  - Per-user transcript tracking
  - Timestamp synchronization
  - Searchable transcript history

### 🌟 Advanced Features

- **Real-time Transcription (Sarvam AI)** ⚡ **NEW: Native WebSocket Streaming**
  - **Sub-100ms latency** (22x faster than batch processing!)
  - Native WebSocket streaming via official Sarvam AI API
  - Automatic VAD (Voice Activity Detection)
  - Hybrid mode support (batch + WebSocket)
  - Models: Saarika v2.5 (STT), Saaras v2.5 (Translation)
  - 11 Indian languages: en-IN, hi-IN, bn-IN, ta-IN, te-IN, gu-IN, kn-IN, ml-IN, mr-IN, pa-IN, od-IN
  - Industry-leading accuracy: 4.96% CER, 8.26% WER (English)
  - Superior telephony performance (8KHz optimized)
  - Auto-reconnection with exponential backoff
  - **See `WEBSOCKET_QUICKSTART.md` for instant setup!**

- **Multi-language Translation** *(11 Indian languages + English)*
  - Sarvam Saaras v2.5: Direct speech-to-English translation
  - Domain-aware prompting for context-specific translation
  - Built-in Language Identification (LID)
  - 89.3% COMET score globally
  - Superior entity preservation

- **Cloud Storage Integration**
  - AWS S3 support
  - Azure Blob Storage support
  - Cloudinary integration
  - Automatic recording uploads

- **Admin Dashboard**
  - User management
  - Call analytics and statistics
  - Real-time monitoring
  - Threat alert management
  - System health metrics endpoint

- **Dashboard & Analytics**
  - User directory
  - Call history
  - Transcript management
  - Alert notifications
  - Activity tracking

- **Production Ready**
  - Error boundaries for graceful failure handling
  - React Router v7 future flags enabled
  - Multi-origin CORS support (3000, 5173)
  - Comprehensive health monitoring
  - Security hardened with Helmet and rate limiting

---
## 🏗️ Tech Stack

### Backend
| Technology | Version | Purpose |
|-----------|---------|---------|
| **Node.js** | 18+ | Runtime environment |
| **Express.js** | 4.21.2 | Web framework |
| **MongoDB** | 8.19.2 | Database |
| **Mongoose** | 8.9.5 | ODM |
| **JWT** | 9.0.2 | Authentication |
| **LiveKit Server SDK** | 2.0+ | Video infrastructure |
| **OpenAI API** | 4.24+ | AI capabilities |
| **Socket.IO** | 4.6+ | Real-time communication |
| **Sarvam AI** | Latest | Real-time transcription (optional) |
| **bcrypt** | 2.4.3 | Password hashing |
| **Helmet** | 7.2.0 | Security middleware |
| **Express Rate Limit** | 7.5.1 | Rate limiting |
| **Winston** | 3.18.0 | Logging |

### Frontend
| Technology | Version | Purpose |
|-----------|---------|---------|
| **React** | 18.2+ | UI framework |
| **Vite** | 7.1+ | Build tool |
| **LiveKit Components** | 2.6.3+ | Video UI components |
| **LiveKit Client** | 2.6.1+ | LiveKit SDK |
| **React Router** | 6.20+ | Routing (v7 flags enabled) |
| **Axios** | 1.6+ | HTTP client |
| **Socket.IO Client** | 4.8+ | Real-time client |

### Infrastructure & DevOps
- **LiveKit Cloud** - Video infrastructure
- **MongoDB Atlas** - Cloud database
- **OpenRouter/OpenAI** - AI services
- **AWS S3** - File storage (optional)
- **Azure Blob** - File storage (optional)
- **Cloudinary** - Media storage (optional)

---

## 📋 Prerequisites

Before running this application, make sure you have:

- Node.js (v16 or higher)
- MongoDB (local or Atlas)
- LiveKit account and credentials
- OpenAI API key

---

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v16.0.0 or higher) - [Download](https://nodejs.org/)
- **npm** (v7.0.0 or higher) or **yarn** (v1.22.0 or higher)
- **MongoDB** (v5.0 or higher) - [Download](https://www.mongodb.com/try/download/community) or use [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
- **Git** - [Download](https://git-scm.com/downloads)

### Required API Keys

You'll need to create accounts and obtain API keys from:

1. **LiveKit** - [Sign up](https://cloud.livekit.io) (Free tier available)
2. **OpenAI** or **OpenRouter** - [OpenAI](https://platform.openai.com) | [OpenRouter](https://openrouter.ai)
3. **MongoDB Atlas** (optional) - [Sign up](https://www.mongodb.com/cloud/atlas/register) (Free tier available)

---

## 🚀 Installation

### 1️⃣ Clone the Repository

```bash
git clone https://github.com/Anasgaima18/LiveScribe.git
cd LiveScribe
```

### 2️⃣ Backend Setup

#### Install Dependencies

```bash
cd backend
npm install
```

#### Configure Environment Variables

Create a `.env` file in the `backend` directory:

```env
# Server Configuration
PORT=5000
NODE_ENV=development

# Database
MONGODB_URI=mongodb://localhost:27017/livescribe
# Or use MongoDB Atlas:
# MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/livescribe?retryWrites=true&w=majority

# JWT Configuration
JWT_SECRET=your_super_secret_jwt_key_minimum_32_characters_long
JWT_EXPIRE=7d

# LiveKit Configuration
# Get these from https://cloud.livekit.io/projects
LIVEKIT_API_KEY=your_livekit_api_key
LIVEKIT_API_SECRET=your_livekit_api_secret
LIVEKIT_URL=wss://your-project-id.livekit.cloud

# OpenAI Configuration
# Option 1: OpenAI (https://platform.openai.com/api-keys)
OPENAI_API_KEY=sk-...

# Option 2: OpenRouter (https://openrouter.ai/keys)
# OPENAI_API_KEY=sk-or-v1-...

# Email Configuration (Optional - for alert notifications)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-specific-password
EMAIL_FROM=noreply@livescribe.com

# Cloud Storage (Optional)
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_REGION=us-east-1
AWS_S3_BUCKET=your-bucket-name

AZURE_STORAGE_ACCOUNT=your_storage_account
AZURE_STORAGE_KEY=your_storage_key
AZURE_CONTAINER=your-container-name

CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# CORS (supports multiple origins)
FRONTEND_URLS=http://localhost:5173,http://localhost:3000
FRONTEND_URL=http://localhost:3000
```

### 3️⃣ Frontend Setup

#### Install Dependencies

```bash
cd ../frontend
npm install
```

#### Configure Environment Variables

Create a `.env` file in the `frontend` directory:

```env
# API Configuration
VITE_API_URL=http://localhost:5000/api

# LiveKit Configuration
VITE_LIVEKIT_URL=wss://your-project-id.livekit.cloud
```

---

## 🎮 Usage

### Development Mode

#### Start the Backend Server

```bash
cd backend
npm run dev
```

The backend will start on `http://localhost:5000`

#### Start the Frontend Development Server

```bash
cd frontend
npm run dev
```

The frontend will start on `http://localhost:3000`

### Production Build

#### Build Frontend

```bash
cd frontend
npm run build
```

#### Start Backend in Production

```bash
cd backend
NODE_ENV=production npm start
```

---

## 📱 Quick Start Guide

### 1. Create an Account

1. Navigate to `http://localhost:3000/register`
2. Fill in your details:
   - Full Name
   - Email Address
   - Password (minimum 8 characters)
3. Click **Register**

### 2. Sign In

1. Go to `http://localhost:3000/login`
2. Enter your credentials
3. Click **Login**

### 3. Start a Video Call

1. From the **Dashboard**, view all registered users
2. Select one or multiple participants
3. Click **Start Video Call**
4. Grant camera and microphone permissions when prompted

### 4. During a Call

- **Toggle Camera**: Turn video on/off
- **Toggle Microphone**: Mute/unmute audio
- **View Transcripts**: Click "Show Transcripts" to see real-time transcription
- **Generate Summary**: Click "Generate Summary" for AI-powered meeting notes
- **Monitor Alerts**: View content moderation alerts in the transcript panel
- **Leave Call**: Click "Leave Call" to exit

### 5. Admin Dashboard (Admin Users Only)

1. Navigate to `http://localhost:3000/admin`
2. View comprehensive analytics:
   - **Dashboard Stats**: Total users, calls, active sessions, and alerts
   - **Active Sessions**: Monitor all ongoing video calls in real-time
   - **User Management**: View, manage, and moderate user accounts
   - **Call Analytics**: Analyze call duration, participants, and patterns
   - **Alert Analytics**: Review content moderation alerts by severity
3. Manage system health and performance

---

## 🔧 API Documentation

### Authentication Endpoints

#### Register User
```http
POST /api/auth/register
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "securepassword123"
}
```

#### Login User
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "securepassword123"
}
```

#### Get All Users
```http
GET /api/auth/users
Authorization: Bearer <token>
```

#### Get Current User
```http
GET /api/auth/me
Authorization: Bearer <token>
```

### LiveKit Endpoints

#### Generate Room Token
```http
GET /api/livekit/token?roomName=room123&participantName=John
Authorization: Bearer <token>
```

### Call Endpoints

#### Create Call
```http
POST /api/calls
Authorization: Bearer <token>
Content-Type: application/json

{
  "participants": ["userId1", "userId2"],
  "roomName": "meeting-room-123"
}
```

#### Get User Calls
```http
GET /api/calls
Authorization: Bearer <token>
```

#### End Call
```http
PUT /api/calls/:callId/end
Authorization: Bearer <token>
```

#### Save Transcript
```http
POST /api/calls/:callId/transcripts
Authorization: Bearer <token>
Content-Type: application/json

{
  "userId": "user123",
  "userName": "John Doe",
  "segments": [
    {
      "text": "Hello everyone",
      "startTime": 0,
      "endTime": 2.5
    }
  ]
}
```

#### Get Transcripts
```http
GET /api/calls/:callId/transcripts
Authorization: Bearer <token>
```

#### Generate AI Summary
```http
POST /api/calls/:callId/summarize
Authorization: Bearer <token>
```

#### Get Alerts
```http
GET /api/calls/:callId/alerts
Authorization: Bearer <token>
```

---

## 📁 Project Structure

```
LiveScribe/
├── 📂 backend/                    # Backend application
│   ├── 📂 config/                # Configuration files
│   │   ├── db.js                 # MongoDB connection
│   │   ├── logger.js             # Winston logger setup
│   │   └── socket.js             # Socket.IO configuration
│   ├── 📂 controllers/           # Request handlers
│   │   ├── authController.js     # Authentication logic
│   │   ├── callController.js     # Call management
│   │   ├── livekitController.js  # LiveKit token generation
│   │   └── adminController.js    # Admin operations
│   ├── 📂 middleware/            # Custom middleware
│   │   ├── auth.js               # JWT verification
│   │   ├── errorHandler.js       # Error handling
│   │   └── validation.js         # Input validation
│   ├── 📂 models/                # Database schemas
│   │   ├── User.js               # User model
│   │   ├── Call.js               # Call model
│   │   ├── Transcript.js         # Transcript model
│   │   ├── Alert.js              # Alert model
│   │   └── Admin.js              # Admin model
│   ├── 📂 routes/                # API routes
│   │   ├── authRoutes.js         # /api/auth/*
│   │   ├── callRoutes.js         # /api/calls/*
│   │   ├── livekitRoutes.js      # /api/livekit/*
│   │   ├── adminRoutes.js        # /api/admin/*
│   │   └── translationRoutes.js  # /api/translate/*
│   ├── 📂 utils/                 # Utility functions
│   │   ├── threatDetection.js    # AI content moderation
│   │   ├── emailService.js       # Email notifications
│   │   ├── translationService.js # Translation API
│   │   ├── cloudStorage.js       # Cloud storage integration
│   │   ├── healthCheck.js        # System health monitoring
│   │   ├── errors.js             # Custom error classes
│   │   └── 📂 transcription/
│   │       └── sarvamClient.js   # Sarvam AI WebSocket client
│   ├── 📄 .env                   # Environment variables
│   ├── 📄 package.json           # Dependencies
│   └── 📄 server.js              # Entry point
│
├── 📂 frontend/                   # Frontend application
│   ├── 📂 src/
│   │   ├── 📂 components/        # React components
│   │   │   ├── TranscriptPanel.jsx
│   │   │   ├── RealtimeTranscription.jsx
│   │   │   └── ErrorBoundary.jsx # Error handling
│   │   ├── 📂 context/           # React context
│   │   │   ├── AuthContext.jsx   # Authentication state
│   │   │   └── SocketContext.jsx # Socket.IO connection
│   │   ├── 📂 pages/             # Page components
│   │   │   ├── Login.jsx         # Login page
│   │   │   ├── Register.jsx      # Registration page
│   │   │   ├── Dashboard.jsx     # User dashboard
│   │   │   ├── VideoRoom.jsx     # Video call room
│   │   │   └── AdminDashboard.jsx # Admin panel
│   │   ├── 📂 styles/            # CSS modules
│   │   │   ├── Auth.css
│   │   │   ├── Dashboard.css
│   │   │   ├── VideoRoom.css
│   │   │   ├── TranscriptPanel.css
│   │   │   └── AdminDashboard.css
│   │   ├── 📂 utils/             # Utility functions
│   │   │   ├── api.js            # Axios configuration
│   │   │   └── audioCapture.js   # Browser audio capture
│   │   ├── 📄 App.js             # Main component
│   │   ├── 📄 index.js           # Entry point
│   │   └── 📄 index.css          # Global styles
│   ├── 📄 .env                   # Environment variables
│   ├── 📄 package.json           # Dependencies
│   └── 📄 vite.config.js         # Vite configuration
│
├── 📄 README.md                   # Main documentation
├── 📄 QUICKSTART.md              # Quick start guide
├── 📄 PRODUCTION_SETUP.md        # Production deployment guide
├── 📄 TESTING_GUIDE.md           # Testing instructions
└── 📄 .gitignore                 # Git ignore rules
```

---

## 🔒 Security Features

- **🔐 Authentication & Authorization**
  - JSON Web Tokens (JWT) for stateless authentication
  - Password hashing using bcrypt (10 rounds)
  - Token expiration and refresh mechanisms
  - Protected routes with middleware

- **🛡️ Security Middleware**
  - **Helmet.js** - Sets secure HTTP headers
  - **CORS** - Cross-Origin Resource Sharing configuration
  - **Rate Limiting** - 20 requests per 15 minutes per IP
  - **Input Sanitization** - HTML sanitization to prevent XSS
  - **MongoDB Injection Protection** - Query sanitization

- **📧 Alert System**
  - Real-time threat detection notifications
  - Email alerts for critical content
  - Admin dashboard for monitoring
  - Configurable alert thresholds

- **🔒 Data Protection**
  - Environment variable isolation
  - Encrypted database connections
  - HTTPS enforcement (production)
  - Secure credential storage

---

## 🧪 Testing

### Manual Testing

#### Test Threat Detection

```bash
cd backend
node -e "import('dotenv').then(d => d.default.config()); setTimeout(() => import('./utils/threatDetection.js').then(async (module) => { const result = await module.detectThreats('I will harm you'); console.log(JSON.stringify(result, null, 2)); }), 100)"
```

Expected output:
```json
{
  "hasThreats": true,
  "severity": "critical",
  "detectedWords": ["harm"],
  "categories": ["violence", "threats"],
  "confidence": 95,
  "explanation": "The text contains explicit violent threats..."
}
```

### API Testing with curl

```bash
# Register a user
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com","password":"testpass123"}'

# Login
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"testpass123"}'
```

---

## 🚀 Deployment

### Backend Deployment (Railway/Render)

1. Push code to GitHub
2. Connect repository to Railway or Render
3. Set environment variables
4. Deploy automatically

### Frontend Deployment (Vercel/Netlify)

1. Build the frontend: `npm run build`
2. Deploy the `dist` folder
3. Set environment variables
4. Configure rewrites for SPA routing

### Environment-Specific Configuration

**Production Backend .env:**
```env
NODE_ENV=production
MONGODB_URI=mongodb+srv://...
FRONTEND_URL=https://your-app.vercel.app
```

**Production Frontend .env:**
```env
VITE_API_URL=https://your-backend.railway.app/api
VITE_LIVEKIT_URL=wss://your-project.livekit.cloud
```

---

## 🐛 Troubleshooting

### Common Issues

#### ❌ Backend Won't Start

**Problem**: `Error: connect ECONNREFUSED 127.0.0.1:27017`

**Solution**:
- Ensure MongoDB is running: `mongod` or use MongoDB Atlas
- Check `MONGODB_URI` in `.env`
- Verify MongoDB connection string format

---

#### ❌ Frontend Can't Connect to Backend

**Problem**: `Network Error` or CORS errors

**Solution**:
- Verify backend is running on port 5000
- Check `VITE_API_URL` in frontend `.env`
- Ensure `FRONTEND_URL` in backend `.env` matches frontend URL
- Clear browser cache and restart dev server

---

#### ❌ Video Call Not Working

**Problem**: "Failed to connect to room" or camera not showing

**Solution**:
- Verify LiveKit credentials are correct
- Check `LIVEKIT_URL` format: must start with `wss://`
- Grant camera/microphone permissions in browser
- Test LiveKit connection at https://livekit.io/playground

---

#### ❌ OpenAI API Errors

**Problem**: `401 Unauthorized` or `Invalid API key`

**Solution**:
- Verify `OPENAI_API_KEY` in backend `.env`
- For OpenRouter: ensure key starts with `sk-or-v1-`
- Check API credits/billing
- Test API key: `curl https://api.openai.com/v1/models -H "Authorization: Bearer YOUR_KEY"`

---

#### ❌ Rate Limit Errors

**Problem**: `429 Too Many Requests`

**Solution**:
- Wait 15 minutes for rate limit reset
- Increase limit in `server.js`:
  ```javascript
  max: 20, // Increase this number
  windowMs: 15 * 60 * 1000
  ```

---

## 🛣️ Roadmap

### Completed ✅
- [x] Core video conferencing with LiveKit
- [x] User authentication (JWT)
- [x] Real-time transcription (Sarvam AI ready)
- [x] AI content moderation (GPT-4/OpenAI)
- [x] AI meeting summaries
- [x] Multi-language translation
- [x] Cloud storage integration (AWS/Azure/Cloudinary)
- [x] Admin dashboard with analytics
- [x] Email notifications for alerts
- [x] Screen sharing support
- [x] Error boundaries for React
- [x] React Router v7 migration flags
- [x] Multi-origin CORS support
- [x] System health monitoring endpoint
- [x] Browser audio capture for real-time transcription
- [x] Socket.IO real-time updates
- [x] Production-ready security (Helmet, rate limiting)

### Planned �
- [ ] Mobile application (React Native)
- [ ] WebRTC fallback for unsupported browsers
- [ ] Advanced analytics dashboard
- [ ] End-to-end encryption
- [ ] Chat history persistence
- [ ] Video recording playback
- [ ] Breakout rooms
- [ ] Virtual backgrounds
- [ ] Whiteboard integration
- [ ] Calendar integration (Google, Outlook)
- [ ] SSO/SAML authentication
- [ ] Webhooks for integrations
- [ ] AI-powered meeting notes export (PDF/DOCX)
- [ ] Sentiment analysis during calls
- [ ] Speaker diarization improvements

---

## 🤝 Contributing

We welcome contributions! Please follow these steps:

1. **Fork the repository**
2. **Create a feature branch**
   ```bash
   git checkout -b feature/AmazingFeature
   ```
3. **Commit your changes**
   ```bash
   git commit -m 'Add some AmazingFeature'
   ```
4. **Push to the branch**
   ```bash
   git push origin feature/AmazingFeature
   ```
5. **Open a Pull Request**

### Development Guidelines

- Follow existing code style
- Write meaningful commit messages
- Add comments for complex logic
- Update documentation for new features
- Test thoroughly before submitting PR

---

## 📄 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

```
MIT License

Copyright (c) 2025 LiveScribe

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.
```

---

## 👥 Authors

- **Anasgaima18** - *Initial work* - [GitHub](https://github.com/Anasgaima18)

---

## 🙏 Acknowledgments

- [LiveKit](https://livekit.io/) for excellent video infrastructure
- [OpenAI](https://openai.com/) for GPT-4 API
- [MongoDB](https://www.mongodb.com/) for database solutions
- [React](https://reactjs.org/) team for the amazing framework
- All contributors who help improve this project

---

## � Additional Documentation

- **[QUICKSTART.md](QUICKSTART.md)** - Get started in 5 minutes
- **[PRODUCTION_SETUP.md](PRODUCTION_SETUP.md)** - Production deployment guide with security best practices
- **[TESTING_GUIDE.md](TESTING_GUIDE.md)** - Comprehensive testing scenarios and instructions

## �📞 Support

- **Issues**: [GitHub Issues](https://github.com/Anasgaima18/LiveScribe/issues)
- **Discussions**: [GitHub Discussions](https://github.com/Anasgaima18/LiveScribe/discussions)
- **Documentation**: See additional guides in repository root
- **Email**: support@livescribe.com (if configured)

---

## 📊 Project Stats

![GitHub stars](https://img.shields.io/github/stars/Anasgaima18/LiveScribe?style=social)
![GitHub forks](https://img.shields.io/github/forks/Anasgaima18/LiveScribe?style=social)
![GitHub watchers](https://img.shields.io/github/watchers/Anasgaima18/LiveScribe?style=social)

---

<div align="center">

### 🌟 Star this repository if you find it helpful!

Made with ❤️ using **MERN Stack** + **LiveKit** + **OpenAI**

[⬆ Back to Top](#-livescribe)

</div>
