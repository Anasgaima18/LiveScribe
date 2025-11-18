import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoSanitize from 'express-mongo-sanitize';
import hpp from 'hpp';
import sanitizeRequest from './middleware/sanitizer.js';
import compression from 'compression';
import morgan from 'morgan';
import { createServer } from 'http';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';

import connectDB from './config/db.js';
import logger from './config/logger.js';
import { initSocket } from './config/socket.js';
import { errorHandler, notFound, handleUnhandledRejection, handleUncaughtException } from './middleware/errorHandler.js';
import { scheduleCleanupJobs } from './utils/dataRetention.js';

import authRoutes from './routes/authRoutes.js';
import livekitRoutes from './routes/livekitRoutes.js';
import callRoutes from './routes/callRoutes.js';
import translationRoutes from './routes/translationRoutes.js';
import adminRoutes from './routes/adminRoutes.js';

// Handle uncaught exceptions
handleUncaughtException();

// Load environment variables
dotenv.config();

// Log transcription configuration on startup
console.log('🎤 Transcription Config:', {
  provider: process.env.TRANSCRIPTION_PROVIDER,
  sarvamKeySet: !!process.env.SARVAM_API_KEY,
  mode: process.env.NODE_ENV
});

// Connect to MongoDB
connectDB();

const app = express();
const server = createServer(app);

// Initialize Socket.IO
const io = initSocket(server);

// Trust proxy
app.set('trust proxy', 1);

// Build allowed frontend origins (supports multiple origins via FRONTEND_URLS)
const configuredOrigins = (process.env.FRONTEND_URLS || process.env.FRONTEND_URL || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const defaultDevOrigins = ['http://localhost:5173', 'http://localhost:3000'];
const allowedOrigins = Array.from(new Set([...configuredOrigins, ...defaultDevOrigins]));

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      // Allow API calls and WebSocket connections to our backend and LiveKit
      connectSrc: [
        "'self'",
        'https:',
        'wss:',
        ...allowedOrigins,
        process.env.LIVEKIT_URL || 'wss://*.livekit.cloud',
      ].filter(Boolean),
      imgSrc: ["'self'", 'data:', 'blob:'],
      mediaSrc: ["'self'", 'data:', 'blob:'],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20, // Limit login/register attempts (increased for development)
  message: 'Too many authentication attempts, please try again later.',
  skipSuccessfulRequests: true,
});

app.use('/api/', limiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// CORS (allow multiple dev origins and configurable list)
app.use(cors({
  origin(origin, callback) {
    // Allow non-browser requests or same-origin
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    
    logger.warn(`CORS blocked for origin: ${origin}. Allowed origins: ${allowedOrigins.join(', ')}`);
    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Body parser
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Data sanitization against NoSQL query injection
app.use(mongoSanitize());

// Targeted sanitization against XSS
app.use(sanitizeRequest);

// Prevent parameter pollution
app.use(hpp());

// Compression
app.use(compression());

// Logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined', { stream: logger.stream }));
}

// Swagger documentation
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'LiveKit Video Call API',
      version: '1.0.0',
      description: 'API documentation for LiveKit Video Call application',
      contact: {
        name: 'API Support',
        email: 'support@livekit-video.com'
      }
    },
    servers: [
      {
        url: `http://localhost:${process.env.PORT || 5000}`,
        description: 'Development server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      }
    },
    security: [{
      bearerAuth: []
    }]
  },
  apis: ['./routes/*.js', './controllers/*.js']
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/livekit', livekitRoutes);
app.use('/api/calls', callRoutes);
app.use('/api/translation', translationRoutes);
app.use('/api/admin', adminRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV
  });
});

// API info endpoint
app.get('/api', (req, res) => {
  res.json({
    name: 'LiveKit Video Call API',
    version: '1.0.0',
    documentation: '/api-docs',
    endpoints: {
      auth: '/api/auth',
      livekit: '/api/livekit',
      calls: '/api/calls'
    }
  });
});

// Root path welcome handler
app.get('/', (req, res) => {
  res.status(200).json({
    status: "success",
    message: "Welcome to the LiveScribe API!",
    documentation: "/api-docs"
  });
});

// Handle 404
app.use(notFound);

// Global error handler
app.use(errorHandler);

// Handle unhandled rejections
handleUnhandledRejection();

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  logger.info(`🚀 Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
  logger.info(`📚 API Documentation available at http://localhost:${PORT}/api-docs`);
  logger.info(`🔌 Socket.IO initialized and ready`);
  
  // Schedule automated cleanup jobs for privacy compliance
  if (process.env.NODE_ENV === 'production' || process.env.ENABLE_CLEANUP_JOBS === 'true') {
    scheduleCleanupJobs();
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    logger.info('Process terminated');
  });
});

export default app;
