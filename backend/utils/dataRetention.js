import cron from 'node-cron';
import Transcript from '../models/Transcript.js';
import Alert from '../models/Alert.js';
import Call from '../models/Call.js';
import logger from '../config/logger.js';

/**
 * Privacy compliance: Delete transcripts older than retention period
 * Default: 90 days
 */
export const deleteOldTranscripts = async (retentionDays = 90) => {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    logger.info(`🗑️ Running transcript cleanup (older than ${retentionDays} days)`);

    const result = await Transcript.deleteMany({
      createdAt: { $lt: cutoffDate }
    });

    logger.info(`✅ Deleted ${result.deletedCount} old transcripts`);
    return { deletedCount: result.deletedCount, cutoffDate };
  } catch (error) {
    logger.error('❌ Failed to delete old transcripts:', error);
    throw error;
  }
};

/**
 * Delete old alerts (optional, separate retention period)
 */
export const deleteOldAlerts = async (retentionDays = 180) => {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    logger.info(`🗑️ Running alert cleanup (older than ${retentionDays} days)`);

    const result = await Alert.deleteMany({
      createdAt: { $lt: cutoffDate }
    });

    logger.info(`✅ Deleted ${result.deletedCount} old alerts`);
    return { deletedCount: result.deletedCount, cutoffDate };
  } catch (error) {
    logger.error('❌ Failed to delete old alerts:', error);
    throw error;
  }
};

/**
 * Delete ended calls older than retention period (keeps metadata only)
 */
export const archiveOldCalls = async (retentionDays = 365) => {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    logger.info(`🗑️ Running call archival (older than ${retentionDays} days)`);

    // Option 1: Delete completely
    const result = await Call.deleteMany({
      endedAt: { $lt: cutoffDate, $ne: null }
    });

    // Option 2: Keep metadata but remove heavy fields
    // await Call.updateMany(
    //   { endedAt: { $lt: cutoffDate, $ne: null } },
    //   { $unset: { recordingUrl: "", summary: "" } }
    // );

    logger.info(`✅ Archived ${result.deletedCount} old calls`);
    return { deletedCount: result.deletedCount, cutoffDate };
  } catch (error) {
    logger.error('❌ Failed to archive old calls:', error);
    throw error;
  }
};

/**
 * Schedule automatic cleanup jobs
 * Runs daily at 2 AM
 */
export const scheduleCleanupJobs = () => {
  const transcriptRetention = parseInt(process.env.TRANSCRIPT_RETENTION_DAYS) || 90;
  const alertRetention = parseInt(process.env.ALERT_RETENTION_DAYS) || 180;
  const callRetention = parseInt(process.env.CALL_RETENTION_DAYS) || 365;

  // Run daily at 2 AM
  cron.schedule('0 2 * * *', async () => {
    logger.info('⏰ Running scheduled cleanup jobs...');
    
    try {
      await deleteOldTranscripts(transcriptRetention);
      await deleteOldAlerts(alertRetention);
      await archiveOldCalls(callRetention);
      
      logger.info('✅ All cleanup jobs completed');
    } catch (error) {
      logger.error('❌ Cleanup jobs failed:', error);
    }
  });

  logger.info('📅 Cleanup jobs scheduled:');
  logger.info(`   - Transcripts: ${transcriptRetention} days`);
  logger.info(`   - Alerts: ${alertRetention} days`);
  logger.info(`   - Calls: ${callRetention} days`);
  logger.info('   - Schedule: Daily at 2:00 AM');
};

/**
 * Manual cleanup endpoint handler
 */
export const runManualCleanup = async (req, res) => {
  try {
    const { transcriptDays, alertDays, callDays } = req.query;

    const results = {
      transcripts: await deleteOldTranscripts(parseInt(transcriptDays) || 90),
      alerts: await deleteOldAlerts(parseInt(alertDays) || 180),
      calls: await archiveOldCalls(parseInt(callDays) || 365),
      timestamp: new Date()
    };

    logger.info('✅ Manual cleanup completed:', results);
    res.json({ success: true, results });
  } catch (error) {
    logger.error('❌ Manual cleanup failed:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Cleanup failed', 
      error: error.message 
    });
  }
};

export default {
  deleteOldTranscripts,
  deleteOldAlerts,
  archiveOldCalls,
  scheduleCleanupJobs,
  runManualCleanup
};
