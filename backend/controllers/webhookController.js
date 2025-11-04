import jwt from 'jsonwebtoken';
import Call from '../models/Call.js';
import logger from '../config/logger.js';

function verifyAuthHeader(req) {
  try {
    if (process.env.WEBHOOK_SKIP_VERIFY === 'true') return { ok: true, payload: null };
    const auth = req.headers['authorization'] || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return { ok: false, error: 'missing_authorization' };
    const payload = jwt.verify(token, process.env.LIVEKIT_API_SECRET);
    return { ok: true, payload };
  } catch (e) {
    return { ok: false, error: 'invalid_signature' };
  }
}

export const livekitWebhook = async (req, res) => {
  // Verify signature (loosely, using API secret). For local dev, set WEBHOOK_SKIP_VERIFY=true.
  const verify = verifyAuthHeader(req);
  if (!verify.ok) {
    logger.warn('LiveKit webhook verification failed:', verify.error);
    return res.status(401).json({ message: 'unauthorized' });
  }

  const body = req.body || {};
  const event = body.event || body;
  const type = event.type || body.type;

  try {
    switch (type) {
      case 'room_started': {
        const roomName = event.room?.name || event.room_name || body.room_name;
        if (!roomName) break;
        let call = await Call.findOne({ roomId: roomName });
        if (!call) {
          call = await Call.create({ roomId: roomName, status: 'active' });
        } else if (call.status !== 'active') {
          call.status = 'active';
          call.endedAt = null;
          await call.save();
        }
        break;
      }
      case 'participant_joined': {
        const roomName = event.room?.name || event.room_name;
        const identity = event.participant?.identity || event.identity;
        if (roomName && identity) {
          // We use userId as identity (see token generation). Attach participant if missing.
          const call = await Call.findOne({ roomId: roomName });
          if (call) {
            const exists = call.participants.some(p => p.userId?.toString() === identity.toString());
            if (!exists) {
              call.participants.push({ userId: identity, joinAt: new Date() });
              await call.save();
            }
          }
        }
        break;
      }
      case 'participant_left': {
        const roomName = event.room?.name || event.room_name;
        const identity = event.participant?.identity || event.identity;
        if (roomName && identity) {
          const call = await Call.findOne({ roomId: roomName });
          if (call) {
            const p = call.participants.find(p => p.userId?.toString() === identity.toString());
            if (p && !p.leaveAt) {
              p.leaveAt = new Date();
              await call.save();
            }
          }
        }
        break;
      }
      case 'room_finished':
      case 'room_ended': {
        const roomName = event.room?.name || event.room_name;
        if (roomName) {
          const call = await Call.findOne({ roomId: roomName });
          if (call) {
            call.endedAt = new Date();
            call.status = 'ended';
            await call.save();
          }
        }
        break;
      }
      default:
        // Ignore unhandled events.
        break;
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    logger.error('LiveKit webhook error:', err);
    res.status(500).json({ message: 'webhook processing failed', error: err.message });
  }
};

export default { livekitWebhook };
