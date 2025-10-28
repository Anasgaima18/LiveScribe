import mongoose from 'mongoose';

const participantSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  joinAt: {
    type: Date,
    default: Date.now
  },
  leaveAt: {
    type: Date
  }
}, { _id: false });

const callSchema = new mongoose.Schema({
  roomId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  startedAt: {
    type: Date,
    default: Date.now
  },
  endedAt: {
    type: Date
  },
  participants: [participantSchema],
  recordingUrl: {
    type: String,
    default: null
  },
  summary: {
    type: String,
    default: null
  },
  status: {
    type: String,
    enum: ['active', 'ended'],
    default: 'active'
  }
}, {
  timestamps: true
});

const Call = mongoose.model('Call', callSchema);

export default Call;
