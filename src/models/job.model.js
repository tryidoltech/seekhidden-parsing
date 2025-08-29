import mongoose from 'mongoose';

const jobSchema = new mongoose.Schema(
  {
    feed_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
      required: true,
    },

    mapped_fields: {
      type: mongoose.Schema.Types.Mixed, // not sure about data
      required: true, // may be false here
    },

    expanded_variations: [
      {
        city: { type: String },
        state: { type: String },
        variation_id: { type: String },
      },
    ],

    markup: {
      type: {
        type: String,
        enum: ['%', 'fixed'],
        // required: true,
      },
      value: {
        type: Number,
        // required: true,
      },
    },

    markdown: {
      type: {
        type: String,
        enum: ['%', 'fixed'],
        // required: true,
      },
      value: {
        type: Number,
        // required: true,
      },
    },

    bid_conversion: {
      from: {
        type: String,
        enum: ['CPC', 'CPA'],
        // required: true
      },
      to: {
        type: String,
        enum: ['CPC', 'CPA'],
        //  required: true
      },
      rate: {
        type: Number,
        // required:true
      },
    },

    currency: {
      type: String,
      // required: true,
    },

    click_caps: {
      type: Number,
      default: 0,
    },

    apply_caps: {
      type: Number,
      default: 0,
    },

    redirect_url_on_expiry: {
      type: String, // assumed this must be date
    },

    automation_rules: {
      type: [mongoose.Schema.Types.Mixed], // not sure about data
      default: [],
    },

    easy_apply: {
      type: Boolean,
      default: false,
    },

    multi_apply: {
      type: Boolean,
      default: false,
    },

    job_scraped_from: {
      type: String,
    },
  },
  { timestamps: true }
);

// Ensure uniqueness of jobs per feed by mapped job_id
jobSchema.index({ feed_id: 1, 'mapped_fields.job_id': 1 }, { unique: true });

export default mongoose.model('Job', jobSchema);
