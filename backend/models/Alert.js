import mongoose from 'mongoose';

const alertSchema = new mongoose.Schema({
  callId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Call',
    required: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  matchedWords: [{
    type: String,
    required: true
  }],
  context: {
    type: String,
    required: true
  },
  severity: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  aiAnalysis: {
    categories: [{
      type: String,
      enum: ['violence', 'harassment', 'hate_speech', 'threats', 'sexual_content', 'self_harm']
    }],
    confidence: {
      type: Number,
      min: 0,
      max: 100
    },
    explanation: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Compound index for efficient queries
alertSchema.index({ callId: 1, createdAt: -1 });

const Alert = mongoose.model('Alert', alertSchema);

export default Alert;
