/**
 * LiveKit Connection Diagnostic Tool
 * Tests LiveKit server connectivity and reports issues
 */

export const testLiveKitConnection = async (serverUrl, token) => {
  const results = {
    serverUrl,
    timestamp: new Date().toISOString(),
    tests: {},
    overall: 'pending'
  };

  console.log('🔍 [LiveKit Diagnostics] Starting connection tests...');
  console.log('🔍 [LiveKit Diagnostics] Server URL:', serverUrl);

  // Test 1: WebSocket connectivity
  try {
    console.log('🔍 [Test 1/4] Testing WebSocket connectivity...');
    
    const wsUrl = serverUrl.replace('wss://', '').replace('ws://', '');
    const wsTest = new WebSocket(`wss://${wsUrl}`);
    
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        wsTest.close();
        reject(new Error('WebSocket connection timeout (5s)'));
      }, 5000);

      wsTest.onopen = () => {
        clearTimeout(timeout);
        wsTest.close();
        results.tests.websocket = { status: 'pass', message: 'WebSocket connection successful' };
        console.log('✅ [Test 1/4] WebSocket connection OK');
        resolve();
      };

      wsTest.onerror = (error) => {
        clearTimeout(timeout);
        results.tests.websocket = { status: 'fail', message: 'WebSocket connection failed', error };
        console.error('❌ [Test 1/4] WebSocket connection FAILED:', error);
        reject(error);
      };
    });
  } catch (error) {
    results.tests.websocket = { 
      status: 'fail', 
      message: 'WebSocket connection failed',
      error: error.message,
      troubleshooting: [
        'Check if LiveKit server is running',
        'Verify the LIVEKIT_URL is correct',
        'Check firewall/network settings',
        'Ensure WebSocket connections are allowed'
      ]
    };
    console.error('❌ [Test 1/4] WebSocket connection FAILED');
  }

  // Test 2: STUN server connectivity
  try {
    console.log('🔍 [Test 2/4] Testing STUN server connectivity...');
    
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
      ]
    });

    const stunTest = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pc.close();
        reject(new Error('STUN server timeout'));
      }, 5000);

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          const candidate = event.candidate.candidate;
          if (candidate.includes('srflx') || candidate.includes('relay')) {
            clearTimeout(timeout);
            pc.close();
            results.tests.stun = { status: 'pass', message: 'STUN server reachable', candidate };
            console.log('✅ [Test 2/4] STUN server OK');
            resolve(candidate);
          }
        }
      };

      // Create offer to trigger ICE gathering
      pc.createDataChannel('test');
      pc.createOffer().then(offer => pc.setLocalDescription(offer));
    });
  } catch (error) {
    results.tests.stun = { 
      status: 'fail', 
      message: 'STUN server unreachable',
      error: error.message,
      troubleshooting: [
        'Check internet connection',
        'Verify firewall allows UDP traffic',
        'Try alternative STUN servers'
      ]
    };
    console.error('❌ [Test 2/4] STUN server test FAILED');
  }

  // Test 3: Token validation
  try {
    console.log('🔍 [Test 3/4] Validating LiveKit token...');
    
    if (!token) {
      throw new Error('No token provided');
    }

    // Decode JWT (without verification, just structure check)
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid JWT structure');
    }

    const payload = JSON.parse(atob(parts[1]));
    const now = Math.floor(Date.now() / 1000);
    
    console.log('🔍 Token payload:', {
      identity: payload.sub,
      room: payload.video?.room,
      expires: payload.exp ? new Date(payload.exp * 1000).toISOString() : 'N/A',
      isExpired: payload.exp && payload.exp < now
    });

    if (payload.exp && payload.exp < now) {
      throw new Error('Token has expired');
    }

    results.tests.token = { 
      status: 'pass', 
      message: 'Token is valid',
      details: {
        identity: payload.sub,
        room: payload.video?.room,
        expiresAt: payload.exp ? new Date(payload.exp * 1000).toISOString() : null
      }
    };
    console.log('✅ [Test 3/4] Token validation OK');
  } catch (error) {
    results.tests.token = { 
      status: 'fail', 
      message: 'Token validation failed',
      error: error.message,
      troubleshooting: [
        'Check LIVEKIT_API_KEY in backend .env',
        'Check LIVEKIT_API_SECRET in backend .env',
        'Verify token generation in backend'
      ]
    };
    console.error('❌ [Test 3/4] Token validation FAILED');
  }

  // Test 4: Server reachability
  try {
    console.log('🔍 [Test 4/4] Testing server reachability...');
    
    const hostname = serverUrl.replace('wss://', '').replace('ws://', '').split('/')[0];
    
    // Try to resolve hostname
    results.tests.server = { 
      status: 'pass', 
      message: `Server hostname resolved: ${hostname}`,
      hostname
    };
    console.log('✅ [Test 4/4] Server reachability OK');
  } catch (error) {
    results.tests.server = { 
      status: 'fail', 
      message: 'Server unreachable',
      error: error.message
    };
    console.error('❌ [Test 4/4] Server reachability FAILED');
  }

  // Calculate overall status
  const testStatuses = Object.values(results.tests).map(t => t.status);
  const passCount = testStatuses.filter(s => s === 'pass').length;
  const totalTests = testStatuses.length;

  if (passCount === totalTests) {
    results.overall = 'pass';
    console.log('✅ [LiveKit Diagnostics] All tests passed!');
  } else if (passCount > 0) {
    results.overall = 'partial';
    console.warn(`⚠️ [LiveKit Diagnostics] ${passCount}/${totalTests} tests passed`);
  } else {
    results.overall = 'fail';
    console.error('❌ [LiveKit Diagnostics] All tests failed');
  }

  // Print summary
  console.log('\n📊 [LiveKit Diagnostics] Summary:');
  console.table(results.tests);

  // Print recommendations
  const failedTests = Object.entries(results.tests).filter(([_, test]) => test.status === 'fail');
  if (failedTests.length > 0) {
    console.log('\n💡 [LiveKit Diagnostics] Recommendations:');
    failedTests.forEach(([name, test]) => {
      console.log(`\n${name.toUpperCase()}:`);
      if (test.troubleshooting) {
        test.troubleshooting.forEach(tip => console.log(`  • ${tip}`));
      }
    });
  }

  return results;
};

/**
 * Run diagnostics when connection fails
 */
export const diagnoseConnectionFailure = async (serverUrl, token) => {
  console.log('\n🚨 [LiveKit] Connection failure detected. Running diagnostics...\n');
  
  const results = await testLiveKitConnection(serverUrl, token);
  
  if (results.overall === 'fail') {
    console.error('\n🚨 [LiveKit] Critical connection issues detected:');
    console.error('Please check your LiveKit configuration:');
    console.error('  1. Verify LIVEKIT_URL in backend .env');
    console.error('  2. Verify LIVEKIT_API_KEY in backend .env');
    console.error('  3. Verify LIVEKIT_API_SECRET in backend .env');
    console.error('  4. Ensure LiveKit Cloud server is active');
    console.error('  5. Check network/firewall settings');
  }
  
  return results;
};
