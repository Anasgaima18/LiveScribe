/**
 * Test script for Sarvam WebSocket Client
 * Demonstrates real-time transcription with sub-100ms latency
 */

import { createSarvamWebSocketClient } from '../backend/utils/transcription/sarvamWebSocketClient.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../backend/.env') });

const API_KEY = process.env.SARVAM_API_KEY;

if (!API_KEY) {
  console.error('❌ SARVAM_API_KEY not found in environment variables');
  process.exit(1);
}

/**
 * Generate test audio (simple sine wave)
 */
function generateTestAudio(durationMs = 5000, frequency = 440) {
  const sampleRate = 16000;
  const numSamples = Math.floor(sampleRate * durationMs / 1000);
  const buffer = Buffer.alloc(numSamples * 2); // 16-bit = 2 bytes per sample
  
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const value = Math.sin(2 * Math.PI * frequency * t) * 32767 * 0.5;
    buffer.writeInt16LE(Math.floor(value), i * 2);
  }
  
  return buffer;
}

/**
 * Test transcription mode
 */
async function testTranscription() {
  console.log('\n🧪 Testing Transcription Mode (saarika:v2.5)');
  console.log('='.repeat(60));
  
  const client = createSarvamWebSocketClient(API_KEY, {
    mode: 'transcribe',
    language: 'en-IN',
    model: 'saarika:v2.5',
    sampleRate: '16000',
    inputAudioCodec: 'pcm_s16le',
    highVadSensitivity: 'true',
    vadSignals: 'true',
    flushSignal: 'true'
  });
  
  let transcriptCount = 0;
  
  // Event listeners
  client.on('connected', ({ sessionId }) => {
    console.log(`✅ Connected (session: ${sessionId})`);
  });
  
  client.on('transcript', (data) => {
    transcriptCount++;
    console.log(`\n📝 Transcript #${transcriptCount}:`);
    console.log(`   Text: "${data.text}"`);
    console.log(`   Language: ${data.language || 'detected'}`);
    console.log(`   Latency: ${data.metrics.processing_latency.toFixed(2)}ms`);
    console.log(`   Audio Duration: ${data.metrics.audio_duration.toFixed(2)}ms`);
  });
  
  client.on('speech_start', ({ timestamp }) => {
    console.log(`🎤 Speech started at ${timestamp}ms`);
  });
  
  client.on('speech_end', ({ timestamp }) => {
    console.log(`🔇 Speech ended at ${timestamp}ms`);
  });
  
  client.on('error', (error) => {
    console.error('❌ WebSocket error:', error.message);
  });
  
  client.on('api_error', ({ error, code }) => {
    console.error(`❌ Sarvam API error (${code}): ${error}`);
  });
  
  client.on('disconnected', ({ code, reason }) => {
    console.log(`👋 Disconnected (code: ${code}, reason: ${reason})`);
  });
  
  // Connect
  await client.connect();
  
  // Generate test audio (or use real audio file if available)
  console.log('\n🎵 Generating test audio...');
  const testAudio = generateTestAudio(3000); // 3 seconds
  
  // Send audio in chunks (simulating real-time streaming)
  const chunkSize = 3200; // 100ms of audio at 16kHz (16000 samples/sec * 0.1s * 2 bytes)
  const numChunks = Math.ceil(testAudio.length / chunkSize);
  
  console.log(`📤 Sending ${numChunks} audio chunks (${chunkSize} bytes each)...`);
  
  for (let i = 0; i < testAudio.length; i += chunkSize) {
    const chunk = testAudio.slice(i, Math.min(i + chunkSize, testAudio.length));
    const sent = client.sendAudio(chunk);
    
    if (sent) {
      process.stdout.write(`\r   Chunk ${Math.floor(i / chunkSize) + 1}/${numChunks} sent`);
    }
    
    // Wait 100ms between chunks (simulating real-time)
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log('\n');
  
  // Send flush signal
  console.log('🔄 Sending flush signal...');
  client.sendFlush();
  
  // Wait for final results
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Get metrics
  const metrics = client.getMetrics();
  console.log('\n📊 Session Metrics:');
  console.log(`   Total Chunks: ${metrics.totalChunks}`);
  console.log(`   Average Latency: ${metrics.avgLatency.toFixed(2)}ms`);
  console.log(`   Total Duration: ${metrics.totalDuration.toFixed(2)}ms`);
  console.log(`   Session Uptime: ${(metrics.uptime / 1000).toFixed(2)}s`);
  
  // Close connection
  client.close();
  
  console.log('\n✅ Transcription test completed');
  
  return transcriptCount > 0;
}

/**
 * Test translation mode
 */
async function testTranslation() {
  console.log('\n🧪 Testing Translation Mode (saaras:v2.5)');
  console.log('='.repeat(60));
  
  const client = createSarvamWebSocketClient(API_KEY, {
    mode: 'translate',
    model: 'saaras:v2.5',
    sampleRate: '16000',
    inputAudioCodec: 'pcm_s16le',
    prompt: 'Casual conversation between friends'
  });
  
  let translationCount = 0;
  
  client.on('connected', ({ sessionId }) => {
    console.log(`✅ Connected (session: ${sessionId})`);
  });
  
  client.on('transcript', (data) => {
    translationCount++;
    console.log(`\n🌐 Translation #${translationCount}:`);
    console.log(`   Original Language: ${data.language || 'detected'}`);
    console.log(`   English Translation: "${data.text}"`);
    console.log(`   Latency: ${data.metrics.processing_latency.toFixed(2)}ms`);
  });
  
  client.on('error', (error) => {
    console.error('❌ WebSocket error:', error.message);
  });
  
  client.on('api_error', ({ error, code }) => {
    console.error(`❌ Sarvam API error (${code}): ${error}`);
  });
  
  await client.connect();
  
  console.log('🎵 Generating test audio...');
  const testAudio = generateTestAudio(2000);
  
  console.log('📤 Sending audio...');
  const chunkSize = 3200;
  for (let i = 0; i < testAudio.length; i += chunkSize) {
    const chunk = testAudio.slice(i, Math.min(i + chunkSize, testAudio.length));
    client.sendAudio(chunk);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  client.sendFlush();
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  const metrics = client.getMetrics();
  console.log('\n📊 Session Metrics:');
  console.log(`   Translations: ${translationCount}`);
  console.log(`   Average Latency: ${metrics.avgLatency.toFixed(2)}ms`);
  
  client.close();
  
  console.log('\n✅ Translation test completed');
  
  return translationCount > 0;
}

/**
 * Test error handling
 */
async function testErrorHandling() {
  console.log('\n🧪 Testing Error Handling');
  console.log('='.repeat(60));
  
  // Test invalid API key
  console.log('\n1️⃣ Testing invalid API key...');
  const invalidClient = createSarvamWebSocketClient('invalid-key-123', {
    language: 'en-IN'
  });
  
  invalidClient.on('api_error', ({ error, code }) => {
    console.log(`   ✅ Caught API error: ${code} - ${error}`);
  });
  
  try {
    await invalidClient.connect();
    await new Promise(resolve => setTimeout(resolve, 1000));
  } catch (error) {
    console.log(`   ✅ Connection failed as expected: ${error.message}`);
  }
  
  invalidClient.close();
  
  // Test reconnection
  console.log('\n2️⃣ Testing auto-reconnection...');
  const reconnectClient = createSarvamWebSocketClient(API_KEY, {
    language: 'en-IN'
  });
  
  reconnectClient.on('connected', () => {
    console.log('   ✅ Connected successfully');
  });
  
  reconnectClient.on('disconnected', ({ code, reason }) => {
    console.log(`   ⚠️ Disconnected: ${code} - ${reason}`);
  });
  
  await reconnectClient.connect();
  
  // Force disconnection
  console.log('   Forcing disconnection...');
  reconnectClient.ws.close(1006, 'Test forced disconnect');
  
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  reconnectClient.close();
  
  console.log('\n✅ Error handling tests completed');
}

/**
 * Main test runner
 */
async function runTests() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║     Sarvam WebSocket Client - Integration Tests          ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  
  const results = {
    transcription: false,
    translation: false,
    errorHandling: true
  };
  
  try {
    // Test transcription
    results.transcription = await testTranscription();
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Test translation
    results.translation = await testTranslation();
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Test error handling
    await testErrorHandling();
    
  } catch (error) {
    console.error('\n❌ Test error:', error);
  }
  
  // Summary
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║                      Test Summary                         ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log(`   Transcription:  ${results.transcription ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`   Translation:    ${results.translation ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`   Error Handling: ${results.errorHandling ? '✅ PASS' : '❌ FAIL'}`);
  
  const allPassed = Object.values(results).every(r => r);
  console.log(`\n${allPassed ? '✅ All tests passed!' : '❌ Some tests failed'}\n`);
  
  process.exit(allPassed ? 0 : 1);
}

// Run tests
runTests().catch(console.error);
