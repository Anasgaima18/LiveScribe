/**
 * Performance Monitoring and Metrics for Production STT
 * Tracks accuracy, latency, and quality metrics
 */

import logger from '../../config/logger.js';

export class PerformanceMonitor {
  constructor() {
    this.metrics = {
      // Batch metrics
      totalBatches: 0,
      successfulBatches: 0,
      failedBatches: 0,
      emptyBatches: 0,
      
      // Latency tracking
      latencies: [],
      totalLatency: 0,
      minLatency: Infinity,
      maxLatency: 0,
      
      // Language detection
      languageHits: {},
      languageMisses: 0,
      preflightAccuracy: 0,
      preflightAttempts: 0,
      
      // Quality scores
      qualityScores: [],
      lowQualityCount: 0,
      highQualityCount: 0,
      
      // API performance
      apiCalls: 0,
      apiErrors: 0,
      apiRetries: 0,
      rateLimits: 0,
      
      // Audio quality
      audioQuality: {
        excellent: 0,
        good: 0,
        fair: 0,
        poor: 0,
        silence: 0,
      },
      
      // Errors
      errors: {},
      
      // Session
      sessionStart: Date.now(),
    };
    
    // Sliding window for recent performance
    this.recentWindow = [];
    this.windowSize = 100;
    
    // Performance thresholds
    this.thresholds = {
      maxLatency: 8000,
      minSuccessRate: 0.95,
      maxEmptyRate: 0.1,
      minQualityScore: 150,
    };
  }

  /**
   * Record batch processing
   */
  recordBatch(result) {
    this.metrics.totalBatches++;
    
    if (result.success) {
      this.metrics.successfulBatches++;
      
      if (result.transcript && result.transcript.length > 0) {
        // Record quality
        if (result.qualityScore) {
          this.metrics.qualityScores.push(result.qualityScore);
          if (result.qualityScore >= 200) this.metrics.highQualityCount++;
          else if (result.qualityScore < 150) this.metrics.lowQualityCount++;
        }
        
        // Record language
        if (result.language) {
          this.metrics.languageHits[result.language] = 
            (this.metrics.languageHits[result.language] || 0) + 1;
        }
      } else {
        this.metrics.emptyBatches++;
      }
    } else {
      this.metrics.failedBatches++;
    }
    
    // Record latency
    if (result.latency) {
      this.metrics.latencies.push(result.latency);
      this.metrics.totalLatency += result.latency;
      if (result.latency < this.metrics.minLatency) this.metrics.minLatency = result.latency;
      if (result.latency > this.metrics.maxLatency) this.metrics.maxLatency = result.latency;
    }
    
    // Add to recent window
    this.recentWindow.push({
      timestamp: Date.now(),
      success: result.success,
      latency: result.latency,
      qualityScore: result.qualityScore,
      empty: !result.transcript || result.transcript.length === 0,
    });
    
    if (this.recentWindow.length > this.windowSize) {
      this.recentWindow.shift();
    }
    
    // Check for alerts
    this._checkAlerts(result);
  }

  /**
   * Record preflight detection accuracy
   */
  recordPreflight(detected, actual, matched) {
    this.metrics.preflightAttempts++;
    if (matched) {
      this.metrics.preflightAccuracy++;
    }
  }

  /**
   * Record API call
   */
  recordAPICall(endpoint, success, error = null) {
    this.metrics.apiCalls++;
    
    if (!success) {
      this.metrics.apiErrors++;
      
      if (error) {
        const errorKey = error.message || 'unknown';
        this.metrics.errors[errorKey] = (this.metrics.errors[errorKey] || 0) + 1;
        
        if (error.response?.status === 429) {
          this.metrics.rateLimits++;
        }
      }
    }
  }

  /**
   * Record API retry
   */
  recordRetry() {
    this.metrics.apiRetries++;
  }

  /**
   * Record audio quality
   */
  recordAudioQuality(quality) {
    if (this.metrics.audioQuality[quality] !== undefined) {
      this.metrics.audioQuality[quality]++;
    }
  }

  /**
   * Get current statistics
   */
  getStats() {
    const now = Date.now();
    const sessionDuration = now - this.metrics.sessionStart;
    const sessionDurationMin = sessionDuration / 60000;
    
    // Calculate rates
    const successRate = this.metrics.totalBatches > 0
      ? this.metrics.successfulBatches / this.metrics.totalBatches
      : 0;
    
    const emptyRate = this.metrics.totalBatches > 0
      ? this.metrics.emptyBatches / this.metrics.totalBatches
      : 0;
    
    const errorRate = this.metrics.apiCalls > 0
      ? this.metrics.apiErrors / this.metrics.apiCalls
      : 0;
    
    // Calculate averages
    const avgLatency = this.metrics.latencies.length > 0
      ? this.metrics.totalLatency / this.metrics.latencies.length
      : 0;
    
    const avgQuality = this.metrics.qualityScores.length > 0
      ? this.metrics.qualityScores.reduce((a, b) => a + b, 0) / this.metrics.qualityScores.length
      : 0;
    
    const preflightAccuracy = this.metrics.preflightAttempts > 0
      ? this.metrics.preflightAccuracy / this.metrics.preflightAttempts
      : 0;
    
    // Recent performance (last N batches)
    const recentSuccessRate = this.recentWindow.length > 0
      ? this.recentWindow.filter(b => b.success).length / this.recentWindow.length
      : 0;
    
    const recentAvgLatency = this.recentWindow.length > 0
      ? this.recentWindow.reduce((sum, b) => sum + (b.latency || 0), 0) / this.recentWindow.length
      : 0;
    
    return {
      // Overall
      sessionDurationMin: parseFloat(sessionDurationMin.toFixed(2)),
      totalBatches: this.metrics.totalBatches,
      
      // Success rates
      successRate: parseFloat((successRate * 100).toFixed(2)),
      emptyRate: parseFloat((emptyRate * 100).toFixed(2)),
      errorRate: parseFloat((errorRate * 100).toFixed(2)),
      
      // Latency
      avgLatency: Math.round(avgLatency),
      minLatency: this.metrics.minLatency === Infinity ? 0 : this.metrics.minLatency,
      maxLatency: this.metrics.maxLatency,
      
      // Quality
      avgQuality: Math.round(avgQuality),
      highQualityRate: this.metrics.successfulBatches > 0
        ? parseFloat((this.metrics.highQualityCount / this.metrics.successfulBatches * 100).toFixed(2))
        : 0,
      lowQualityRate: this.metrics.successfulBatches > 0
        ? parseFloat((this.metrics.lowQualityCount / this.metrics.successfulBatches * 100).toFixed(2))
        : 0,
      
      // Language detection
      topLanguages: Object.entries(this.metrics.languageHits)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([lang, count]) => ({ lang, count })),
      preflightAccuracy: parseFloat((preflightAccuracy * 100).toFixed(2)),
      
      // API
      totalAPICalls: this.metrics.apiCalls,
      apiErrors: this.metrics.apiErrors,
      apiRetries: this.metrics.apiRetries,
      rateLimits: this.metrics.rateLimits,
      
      // Audio quality distribution
      audioQuality: this.metrics.audioQuality,
      
      // Recent performance
      recentSuccessRate: parseFloat((recentSuccessRate * 100).toFixed(2)),
      recentAvgLatency: Math.round(recentAvgLatency),
      
      // Top errors
      topErrors: Object.entries(this.metrics.errors)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([error, count]) => ({ error, count })),
    };
  }

  /**
   * Get performance summary for logging
   */
  getSummary() {
    const stats = this.getStats();
    
    return {
      batches: `${stats.totalBatches} total (${stats.successRate}% success, ${stats.emptyRate}% empty)`,
      latency: `${stats.avgLatency}ms avg (${stats.minLatency}-${stats.maxLatency}ms)`,
      quality: `${stats.avgQuality} avg (${stats.highQualityRate}% high, ${stats.lowQualityRate}% low)`,
      languages: stats.topLanguages.map(l => `${l.lang}:${l.count}`).join(', '),
      api: `${stats.totalAPICalls} calls (${stats.errorRate}% errors, ${stats.rateLimits} rate limits)`,
    };
  }

  /**
   * Check for performance alerts
   */
  _checkAlerts(result) {
    // High latency
    if (result.latency && result.latency > this.thresholds.maxLatency) {
      logger.warn(`⚠️ High latency detected: ${result.latency}ms (threshold: ${this.thresholds.maxLatency}ms)`);
    }
    
    // Low quality
    if (result.qualityScore && result.qualityScore < this.thresholds.minQualityScore) {
      logger.warn(`⚠️ Low quality transcript: score ${result.qualityScore} (threshold: ${this.thresholds.minQualityScore})`);
    }
    
    // Check recent window for degraded performance
    if (this.recentWindow.length >= 20) {
      const recentSuccesses = this.recentWindow.slice(-20).filter(b => b.success).length;
      const recentSuccessRate = recentSuccesses / 20;
      
      if (recentSuccessRate < this.thresholds.minSuccessRate) {
        logger.error(`🚨 Performance degradation: ${(recentSuccessRate * 100).toFixed(0)}% success rate in last 20 batches`);
      }
    }
  }

  /**
   * Log periodic performance report
   */
  logReport() {
    const stats = this.getStats();
    const summary = this.getSummary();
    
    logger.info('📊 Performance Report:');
    logger.info(`   Session: ${stats.sessionDurationMin} minutes`);
    logger.info(`   Batches: ${summary.batches}`);
    logger.info(`   Latency: ${summary.latency}`);
    logger.info(`   Quality: ${summary.quality}`);
    logger.info(`   Languages: ${summary.languages}`);
    logger.info(`   API: ${summary.api}`);
    logger.info(`   Preflight accuracy: ${stats.preflightAccuracy}%`);
    
    if (stats.topErrors.length > 0) {
      logger.warn(`   Top errors: ${stats.topErrors.map(e => `${e.error}(${e.count})`).join(', ')}`);
    }
  }

  /**
   * Reset metrics
   */
  reset() {
    this.metrics = {
      totalBatches: 0,
      successfulBatches: 0,
      failedBatches: 0,
      emptyBatches: 0,
      latencies: [],
      totalLatency: 0,
      minLatency: Infinity,
      maxLatency: 0,
      languageHits: {},
      languageMisses: 0,
      preflightAccuracy: 0,
      preflightAttempts: 0,
      qualityScores: [],
      lowQualityCount: 0,
      highQualityCount: 0,
      apiCalls: 0,
      apiErrors: 0,
      apiRetries: 0,
      rateLimits: 0,
      audioQuality: {
        excellent: 0,
        good: 0,
        fair: 0,
        poor: 0,
        silence: 0,
      },
      errors: {},
      sessionStart: Date.now(),
    };
    
    this.recentWindow = [];
  }
}

export default PerformanceMonitor;
