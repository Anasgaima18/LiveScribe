/**
 * System Health Checker
 * Validates environment configuration and service availability
 */

import mongoose from 'mongoose';
import logger from '../config/logger.js';

const healthChecks = {
  // Check MongoDB connection
  async mongodb() {
    try {
      const state = mongoose.connection.readyState;
      const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
      
      return {
        name: 'MongoDB',
        status: state === 1 ? 'healthy' : 'unhealthy',
        details: {
          state: states[state],
          host: mongoose.connection.host,
          database: mongoose.connection.name,
        },
      };
    } catch (error) {
      return {
        name: 'MongoDB',
        status: 'unhealthy',
        error: error.message,
      };
    }
  },

  // Check required environment variables
  async environment() {
    const required = [
      'JWT_SECRET',
      'MONGODB_URI',
      'LIVEKIT_API_KEY',
      'LIVEKIT_API_SECRET',
      'LIVEKIT_URL',
      'OPENAI_API_KEY',
    ];

    const missing = required.filter((key) => !process.env[key]);
    const weak = [];

    // Check for weak secrets
    if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
      weak.push('JWT_SECRET (too short, use 64+ characters)');
    }

    return {
      name: 'Environment',
      status: missing.length === 0 && weak.length === 0 ? 'healthy' : 'unhealthy',
      details: {
        missing: missing.length > 0 ? missing : undefined,
        warnings: weak.length > 0 ? weak : undefined,
      },
    };
  },

  // Check LiveKit configuration
  async livekit() {
    try {
      const { AccessToken } = await import('livekit-server-sdk');
      
      // Try to create a test token
      const token = new AccessToken(
        process.env.LIVEKIT_API_KEY,
        process.env.LIVEKIT_API_SECRET,
        {
          identity: 'health-check',
        }
      );
      
      token.addGrant({ roomJoin: true, room: 'health-check' });
      const jwt = token.toJwt();

      return {
        name: 'LiveKit',
        status: jwt ? 'healthy' : 'unhealthy',
        details: {
          url: process.env.LIVEKIT_URL,
          tokenGeneration: 'working',
        },
      };
    } catch (error) {
      return {
        name: 'LiveKit',
        status: 'unhealthy',
        error: error.message,
      };
    }
  },

  // Check OpenAI API key format
  async openai() {
    const apiKey = process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      return {
        name: 'OpenAI',
        status: 'unconfigured',
        details: { message: 'API key not set' },
      };
    }

    // Basic format validation
    const isValid = apiKey.startsWith('sk-') && apiKey.length > 20;

    return {
      name: 'OpenAI',
      status: isValid ? 'configured' : 'invalid',
      details: {
        format: isValid ? 'valid' : 'invalid (should start with sk-)',
        note: 'Call /api/health/openai/test to test actual API connectivity',
      },
    };
  },

  // Check Sarvam AI configuration (optional)
  async sarvam() {
    const provider = process.env.TRANSCRIPTION_PROVIDER;
    const apiKey = process.env.SARVAM_API_KEY;
    const url = process.env.SARVAM_REALTIME_URL;

    if (provider !== 'sarvam') {
      return {
        name: 'Sarvam AI',
        status: 'disabled',
        details: { message: 'Not configured as transcription provider' },
      };
    }

    const isConfigured = apiKey && url;

    return {
      name: 'Sarvam AI',
      status: isConfigured ? 'configured' : 'incomplete',
      details: {
        provider,
        hasApiKey: !!apiKey,
        hasUrl: !!url,
        url: url || 'not set',
      },
    };
  },

  // Check system resources
  async system() {
    const uptime = process.uptime();
    const memUsage = process.memoryUsage();

    return {
      name: 'System',
      status: 'healthy',
      details: {
        uptime: `${Math.floor(uptime / 60)} minutes`,
        memory: {
          rss: `${Math.round(memUsage.rss / 1024 / 1024)} MB`,
          heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)} MB`,
          heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)} MB`,
        },
        nodeVersion: process.version,
        platform: process.platform,
      },
    };
  },
};

/**
 * Run all health checks
 */
export async function runHealthChecks() {
  const results = {};
  const checks = Object.keys(healthChecks);

  for (const check of checks) {
    try {
      results[check] = await healthChecks[check]();
    } catch (error) {
      logger.error(`Health check ${check} failed:`, error);
      results[check] = {
        name: check,
        status: 'error',
        error: error.message,
      };
    }
  }

  // Overall system health
  const allHealthy = Object.values(results).every(
    (r) => r.status === 'healthy' || r.status === 'configured' || r.status === 'disabled'
  );

  return {
    healthy: allHealthy,
    timestamp: new Date().toISOString(),
    checks: results,
  };
}

/**
 * Get a simplified health status
 */
export async function getHealthStatus() {
  const mongoHealth = await healthChecks.mongodb();
  const envHealth = await healthChecks.environment();

  return {
    status: mongoHealth.status === 'healthy' && envHealth.status === 'healthy' ? 'ok' : 'degraded',
    mongodb: mongoHealth.status,
    environment: envHealth.status,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  };
}

export default healthChecks;
