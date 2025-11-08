import Call from '../models/Call.js';
import Transcript from '../models/Transcript.js';
import Alert from '../models/Alert.js';
import { detectThreats } from '../utils/threatDetection.js';
import OpenAI from 'openai';
import { sendToUser } from '../config/socket.js';
import logger from '../config/logger.js';

// Lazy-load OpenAI client to avoid startup crash if API key is missing
let openai = null;
const getOpenAI = () => {
  if (!openai && process.env.OPENAI_API_KEY) {
    // Check if using OpenRouter (key starts with sk-or-v1)
    const isOpenRouter = process.env.OPENAI_API_KEY.startsWith('sk-or-v1');
    
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: isOpenRouter ? 'https://openrouter.ai/api/v1' : undefined,
      defaultHeaders: isOpenRouter ? {
        'HTTP-Referer': process.env.FRONTEND_URL || 'http://localhost:3000',
        'X-Title': 'LiveKit Video Call'
      } : undefined
    });
  }
  return openai;
};

// @desc    Create new call
// @route   POST /api/calls
// @access  Private
export const createCall = async (req, res) => {
  try {
    const { roomId, participants } = req.body;

    // Check if call already exists
    let call = await Call.findOne({ roomId });
    
    if (call) {
      // Add participant if not already in the call
      const existingParticipant = call.participants.find(
        p => p.userId.toString() === req.user._id.toString()
      );
      
      if (!existingParticipant) {
        call.participants.push({ userId: req.user._id });
        await call.save();
      }
      
      return res.json(call);
    }

    // Create new call
    call = await Call.create({
      roomId,
      participants: [{ userId: req.user._id }],
      status: 'active'
    });

    // Notify other participants
    if (Array.isArray(participants)) {
      participants.forEach(({ userId }) => {
        if (userId && userId.toString() !== req.user._id.toString()) {
          sendToUser(userId.toString(), 'call:invitation', {
            from: req.user,
            roomId,
            callId: call._id
          });
        }
      });
    }

    res.status(201).json(call);
  } catch (error) {
    logger.error('Create call error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    End a call
// @route   PUT /api/calls/:callId/end
// @access  Private
export const endCall = async (req, res) => {
  try {
    const call = await Call.findById(req.params.callId);

    if (!call) {
      return res.status(404).json({ message: 'Call not found' });
    }

    call.endedAt = new Date();
    call.status = 'ended';

    // Update participant leave time
    const participant = call.participants.find(
      p => p.userId.toString() === req.user._id.toString()
    );
    
    if (participant && !participant.leaveAt) {
      participant.leaveAt = new Date();
    }

    await call.save();

    res.json(call);
  } catch (error) {
    logger.error('End call error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Save transcript for a call
// @route   POST /api/calls/:callId/transcripts
// @access  Private
export const saveTranscript = async (req, res) => {
  try {
    const { segments } = req.body;
    const callId = req.params.callId;

    // Verify call exists
    const call = await Call.findById(callId);
    if (!call) {
      return res.status(404).json({ message: 'Call not found' });
    }

    // Find or create transcript
    let transcript = await Transcript.findOne({
      callId,
      userId: req.user._id
    });

    if (transcript) {
      // Append new segments
      transcript.segments.push(...segments);
      await transcript.save();
    } else {
      // Create new transcript
      transcript = await Transcript.create({
        callId,
        userId: req.user._id,
        segments
      });
    }

    // Check for threats in the new segments using AI
    for (const segment of segments) {
      const threatCheck = await detectThreats(segment.text);
      
      if (threatCheck.hasThreats) {
        // Create alert with AI analysis details
        await Alert.create({
          callId,
          userId: req.user._id,
          matchedWords: threatCheck.detectedIssues || threatCheck.matchedWords || [],
          context: segment.text,
          severity: threatCheck.severity,
          aiAnalysis: threatCheck.method === 'ai' ? {
            categories: threatCheck.categories,
            confidence: threatCheck.confidence,
            explanation: threatCheck.explanation
          } : null
        });
      }
    }

    res.status(201).json(transcript);
  } catch (error) {
    logger.error('Save transcript error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get transcripts for a call
// @route   GET /api/calls/:callId/transcripts
// @access  Private
export const getTranscripts = async (req, res) => {
  try {
    const transcripts = await Transcript.find({ 
      callId: req.params.callId 
    }).populate('userId', 'name email');

    res.json(transcripts);
  } catch (error) {
    logger.error('Get transcripts error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Summarize call using OpenAI
// @route   POST /api/calls/:callId/summarize
// @access  Private
export const summarizeCall = async (req, res) => {
  try {
    const callId = req.params.callId;

    // Get call
    const call = await Call.findById(callId);
    if (!call) {
      return res.status(404).json({ message: 'Call not found' });
    }

    // Check if summary already exists
    if (call.summary) {
      return res.json({ summary: call.summary });
    }

    // Get all transcripts
    const transcripts = await Transcript.find({ callId }).populate('userId', 'name');

    if (transcripts.length === 0) {
      return res.status(400).json({ message: 'No transcripts available for this call' });
    }

    // Check if OpenAI is configured
    const openaiClient = getOpenAI();
    if (!openaiClient) {
      return res.status(503).json({ 
        message: 'AI summary service is not configured. Please set OPENAI_API_KEY environment variable.' 
      });
    }

    // Combine all transcripts
    let fullTranscript = '';
    transcripts.forEach(transcript => {
      const userName = transcript.userId.name;
      transcript.segments.forEach(segment => {
        fullTranscript += `${userName}: ${segment.text}\n`;
      });
    });

    // Generate summary using OpenAI
    const completion = await openaiClient.chat.completions.create({
      model: process.env.OPENAI_API_KEY?.startsWith('sk-or-v1') 
        ? 'openai/gpt-3.5-turbo' 
        : 'gpt-4',
      messages: [
        {
          role: "system",
          content: "You are a professional meeting summarizer. Provide a concise, well-structured summary of the conversation including key points, decisions made, and action items."
        },
        {
          role: "user",
          content: `Please summarize the following conversation:\n\n${fullTranscript}`
        }
      ],
      temperature: 0.7,
      max_tokens: 500
    });

    const summary = completion.choices[0].message.content;

    // Save summary to call
    call.summary = summary;
    await call.save();

    res.json({ summary });
  } catch (error) {
    console.error('Summarization error:', error);
    res.status(500).json({ message: 'Failed to generate summary', error: error.message });
  }
};

// @desc    Get alerts for a call
// @route   GET /api/calls/:callId/alerts
// @access  Private
export const getAlerts = async (req, res) => {
  try {
    const alerts = await Alert.find({ 
      callId: req.params.callId 
    }).populate('userId', 'name email');

    res.json(alerts);
  } catch (error) {
    logger.error('Get alerts error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get all calls for current user
// @route   GET /api/calls
// @access  Private
export const getUserCalls = async (req, res) => {
  try {
    const calls = await Call.find({
      'participants.userId': req.user._id
    }).populate('participants.userId', 'name email').sort({ startedAt: -1 });

    res.json(calls);
  } catch (error) {
    logger.error('Get user calls error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
