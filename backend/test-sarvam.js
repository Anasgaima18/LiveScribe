/**
 * Quick test script for Sarvam AI API
 * Run: node test-sarvam.js
 */

import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const SARVAM_API_KEY = process.env.SARVAM_API_KEY;
const SARVAM_URL = 'https://api.sarvam.ai';

console.log('🔍 Testing Sarvam AI Configuration...\n');
console.log('API Key:', SARVAM_API_KEY ? `${SARVAM_API_KEY.substring(0, 10)}...` : '❌ NOT SET');
console.log('Provider:', process.env.TRANSCRIPTION_PROVIDER);
console.log('');

async function testSarvamAPI() {
  if (!SARVAM_API_KEY) {
    console.error('❌ SARVAM_API_KEY is not set in .env file');
    return;
  }

  try {
    console.log('Testing Sarvam API connectivity...');
    
    // Test with a simple health/info endpoint
    const response = await fetch(`${SARVAM_URL}/`, {
      method: 'GET',
      headers: {
        'api-subscription-key': SARVAM_API_KEY,
      },
    });

    console.log('Response Status:', response.status, response.statusText);
    
    if (response.ok) {
      console.log('✅ Sarvam API is accessible!');
      const data = await response.text();
      console.log('Response:', data.substring(0, 200));
    } else {
      const error = await response.text();
      console.log('⚠️ API Response:', error.substring(0, 500));
      
      if (response.status === 401) {
        console.log('\n❌ Authentication failed - API key might be invalid');
      } else if (response.status === 403) {
        console.log('\n❌ Access forbidden - Check API key permissions');
      }
    }
  } catch (error) {
    console.error('❌ Connection error:', error.message);
  }
}

testSarvamAPI();
