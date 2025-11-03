import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import logger from '../config/logger.js';

/**
 * Test LiveKit server connectivity and credentials
 */
export const testLiveKitConnection = async () => {
  const results = {
    timestamp: new Date().toISOString(),
    tests: {},
    overall: 'pending'
  };

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const livekitUrl = process.env.LIVEKIT_URL;

  // Test 1: Environment variables
  logger.info('Testing LiveKit configuration...');
  
  if (!apiKey || !apiSecret || !livekitUrl) {
    results.tests.config = {
      status: 'fail',
      message: 'Missing LiveKit environment variables',
      details: {
        hasApiKey: !!apiKey,
        hasApiSecret: !!apiSecret,
        hasUrl: !!livekitUrl
      }
    };
    results.overall = 'fail';
    return results;
  }

  results.tests.config = {
    status: 'pass',
    message: 'All environment variables present',
    livekitUrl: livekitUrl
  };

  // Test 2: Token generation
  try {
    logger.info('Testing token generation...');
    
    const testToken = new AccessToken(apiKey, apiSecret, {
      identity: 'test-user',
      name: 'Test User',
    });

    testToken.addGrant({
      room: 'test-room',
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
    });

    const token = await testToken.toJwt();
    
    results.tests.tokenGeneration = {
      status: 'pass',
      message: 'Token generation successful',
      tokenLength: token.length
    };
  } catch (error) {
    logger.error('Token generation failed:', error);
    results.tests.tokenGeneration = {
      status: 'fail',
      message: 'Token generation failed',
      error: error.message
    };
    results.overall = 'fail';
    return results;
  }

  // Test 3: Server connectivity
  try {
    logger.info('Testing LiveKit server connectivity...');
    
    const roomClient = new RoomServiceClient(livekitUrl, apiKey, apiSecret);
    
    // Try to list rooms (this will fail if credentials are invalid)
    const rooms = await roomClient.listRooms();
    
    results.tests.serverConnectivity = {
      status: 'pass',
      message: 'Successfully connected to LiveKit server',
      activeRooms: rooms.length
    };
    
    results.overall = 'pass';
  } catch (error) {
    logger.error('LiveKit server connection failed:', error);
    results.tests.serverConnectivity = {
      status: 'fail',
      message: 'Failed to connect to LiveKit server',
      error: error.message,
      troubleshooting: [
        'Verify LIVEKIT_URL is correct (should be wss://...)',
        'Check if LiveKit server is running and accessible',
        'Verify API credentials are correct and not expired',
        'Check network/firewall settings'
      ]
    };
    results.overall = 'fail';
  }

  return results;
};

/**
 * Get LiveKit server status
 */
export const getLiveKitStatus = async () => {
  try {
    const roomClient = new RoomServiceClient(
      process.env.LIVEKIT_URL,
      process.env.LIVEKIT_API_KEY,
      process.env.LIVEKIT_API_SECRET
    );

    const rooms = await roomClient.listRooms();
    
    return {
      status: 'online',
      activeRooms: rooms.length,
      rooms: rooms.map(room => ({
        name: room.name,
        sid: room.sid,
        numParticipants: room.numParticipants,
        creationTime: room.creationTime
      }))
    };
  } catch (error) {
    logger.error('Failed to get LiveKit status:', error);
    return {
      status: 'offline',
      error: error.message
    };
  }
};
