import mongoose from 'mongoose';

const clickSchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now },
  ip_address: { type: String },
  user_agent: { type: String },
  is_bot: { type: Boolean, default: false },
  is_unique: { type: Boolean, default: true }, // First time this IP clicked this URL
  is_latent: { type: Boolean, default: false }, // Click after 24 hours
  referrer: { type: String },
  session_id: { type: String },
});

const urlSchema = new mongoose.Schema({
  original_url: { type: String, required: true },
  short_id: { type: String, required: true, unique: true },

  // Context information for preventing duplicates
  publisher_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Publisher' },
  job_group_id: { type: mongoose.Schema.Types.ObjectId, ref: 'JobGroup' },
  campaign_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign' },

  // Analytics
  total_clicks: { type: Number, default: 0 },
  unique_clicks: { type: Number, default: 0 },
  bot_clicks: { type: Number, default: 0 },
  latent_clicks: { type: Number, default: 0 },

  // Detailed click tracking
  clicks: [clickSchema],

  // First and last click times
  first_click: { type: Date },
  last_click: { type: Date },

  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
});

// Compound index to prevent duplicates
urlSchema.index(
  {
    original_url: 1,
    publisher_id: 1,
    job_group_id: 1,
    campaign_id: 1,
  },
  { unique: true }
);

// Index for performance
urlSchema.index({ short_id: 1 });
urlSchema.index({ publisher_id: 1 });
urlSchema.index({ job_group_id: 1 });
urlSchema.index({ campaign_id: 1 });

export default mongoose.model('ShortUrl', urlSchema);
