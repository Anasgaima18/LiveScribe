import { AccessToken } from 'livekit-server-sdk';

// @desc    Generate LiveKit access token
// @route   GET /api/livekit/token
// @access  Private
export const getToken = async (req, res) => {
  try {
    const { roomName, participantName } = req.query;

    if (!roomName || !participantName) {
      return res.status(400).json({ 
        message: 'Room name and participant name are required' 
      });
    }

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;

    if (!apiKey || !apiSecret) {
      return res.status(500).json({ 
        message: 'LiveKit credentials not configured' 
      });
    }

    // Create access token
    const at = new AccessToken(apiKey, apiSecret, {
      identity: req.user._id.toString(),
      name: participantName,
    });

    // Grant permissions
    at.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const token = await at.toJwt();

    res.json({
      token,
      url: process.env.LIVEKIT_URL,
      roomName,
      participantName
    });
  } catch (error) {
    console.error('LiveKit token generation error:', error);
    res.status(500).json({ message: 'Failed to generate token', error: error.message });
  }
};
