import mongoose from 'mongoose';

const adminSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['super_admin', 'admin', 'moderator'],
    default: 'admin'
  },
  permissions: [{
    type: String,
    enum: [
      'view_users',
      'manage_users',
      'view_calls',
      'manage_calls',
      'view_alerts',
      'manage_alerts',
      'view_analytics',
      'manage_settings'
    ]
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: Date,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Default super admin permissions
adminSchema.pre('save', function(next) {
  if (this.role === 'super_admin') {
    this.permissions = [
      'view_users', 'manage_users',
      'view_calls', 'manage_calls',
      'view_alerts', 'manage_alerts',
      'view_analytics', 'manage_settings'
    ];
  } else if (this.role === 'admin' && this.permissions.length === 0) {
    this.permissions = [
      'view_users', 'view_calls', 'view_alerts', 'view_analytics'
    ];
  }
  next();
});

const Admin = mongoose.model('Admin', adminSchema);

export default Admin;
