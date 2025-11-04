import mongoose from 'mongoose';

const segmentSchema = new mongoose.Schema({
  text: {
    type: String,
    required: true
  },
  // Optional timing fields when available
  startTime: {
    type: Number,
    required: false
  },
  endTime: {
    type: Number,
    required: false
  },
  // For realtime transcripts we often only have a wall-clock timestamp
  timestamp: {
    type: Date,
    default: Date.now
  },
  // Persist only final segments (isPartial=false)
  isPartial: {
    type: Boolean,
    default: false
  }
}, { _id: false });

const transcriptSchema = new mongoose.Schema({
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
  segments: [segmentSchema],
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Compound index for efficient queries
transcriptSchema.index({ callId: 1, userId: 1 });

const Transcript = mongoose.model('Transcript', transcriptSchema);

export default Transcript;
