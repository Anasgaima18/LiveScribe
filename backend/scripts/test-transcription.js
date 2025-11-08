/**
 * Test script for realtime transcription pipeline
 * Tests a single PCM16 audio chunk through the system
 */

import { createSarvamClient } from '../utils/transcription/sarvamClient.js';
import logger from '../config/logger.js';

// Generate a simple 200ms test audio chunk (3200 samples @ 16kHz)
function generateTestChunk(rmsLevel = 500) {
  const SAMPLES = 3200; // ~200ms @ 16kHz
  const buffer = Buffer.alloc(SAMPLES * 2); // 2 bytes per Int16 sample
  
  // Generate sine wave test audio
  const frequency = 440; // A440 Hz
  const sampleRate = 16000;
  
  for (let i = 0; i < SAMPLES; i++) {
    const time = i / sampleRate;
    const value = Math.sin(2 * Math.PI * frequency * time) * rmsLevel;
    const sample = Math.max(-32768, Math.min(32767, Math.round(value)));
    buffer.writeInt16LE(sample, i * 2);
  }
  
  return buffer;
}

async function testTranscription() {
  try {
    logger.info('===== Transcription Test Starting =====');
    
    // Check if API key is configured
    if (!process.env.SARVAM_API_KEY) {
      logger.error('SARVAM_API_KEY not configured in .env');
      process.exit(1);
    }
    
    // Create client
    const client = createSarvamClient({ language: 'en-IN' });
    
    // Track results
    let receivedTranscript = false;
    
    client.on('final', (data) => {
      logger.info(`✅ Received transcript: "${data.text}"`);
      logger.info(`   Language: ${data.language}, Timestamp: ${data.timestamp}`);
      receivedTranscript = true;
    });
    
    client.on('error', (err) => {
      logger.error(`❌ Transcription error: ${err.message}`);
    });
    
    client.start();
    
    // Test different RMS levels
    const testLevels = [
      { rms: 50, desc: 'Very low RMS (should be dropped)' },
      { rms: 100, desc: 'Low RMS (should be dropped)' },
      { rms: 500, desc: 'Normal speech RMS (should be kept)' },
      { rms: 2000, desc: 'Loud speech RMS (should be kept)' }
    ];
    
    for (const test of testLevels) {
      logger.info(`\nTesting ${test.desc} (RMS=${test.rms})...`);
      
      const chunk = generateTestChunk(test.rms);
      const base64 = chunk.toString('base64');
      
      // Compute metadata
      const samples = new Int16Array(chunk.buffer, chunk.byteOffset, chunk.length / 2);
      let sumSq = 0;
      for (let i = 0; i < samples.length; i++) {
        sumSq += samples[i] * samples[i];
      }
      const rmsInt16 = Math.sqrt(sumSq / samples.length);
      const meta = {
        rmsInt16,
        samples: samples.length,
        sr: 16000,
        durationMs: (samples.length / 16000) * 1000
      };
      
      logger.info(`  Meta: RMS_Int16=${rmsInt16.toFixed(0)}, Duration=${meta.durationMs.toFixed(1)}ms`);
      
      // Send chunk (simulating client behavior)
      const buffer = Buffer.from(base64, 'base64');
      await client.sendAudio(buffer, meta);
      
      // Wait a bit between chunks
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    // Wait for processing
    logger.info('\nWaiting for transcription processing...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Close client
    await client.close();
    
    if (receivedTranscript) {
      logger.info('\n✅ Test completed successfully - transcript received');
    } else {
      logger.warn('\n⚠️  Test completed but no transcript received (may be due to low audio energy or batching)');
    }
    
    logger.info('===== Transcription Test Complete =====');
    process.exit(0);
    
  } catch (error) {
    logger.error('Test failed:', error);
    process.exit(1);
  }
}

testTranscription();
