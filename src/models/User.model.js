import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
  },
  password: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    enum: ['admin', 'client_user', 'publisher_user'],
    required: true,
  },
  client_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    default: null,
  },
  publisher_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Publisher',
    default: null,
  },
  access_controls: {
    campaigns: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Campaign' }],
    job_groups: [{ type: mongoose.Schema.Types.ObjectId, ref: 'JobGroup' }],
    publishers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Publisher' }],
    custom_metrics: [String],
  },
  refreshToken: {
    type: String,
  },
  is_active: {
    type: Boolean,
    default: true,
  },
  last_login: {
    type: Date,
    default: null,
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
  updated_at: {
    type: Date,
    default: Date.now,
  },
});

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Compare password function
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

export default mongoose.model('User', userSchema);
