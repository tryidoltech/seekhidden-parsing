import mongoose from 'mongoose';

const jobGroupSchema = new mongoose.Schema(
  {
    campaign_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Campaign',
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    job_group_type: {
      type: String,
      // enum: ['standard', 'dynamic', 'priority'],
    },
    publishers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Publisher',
      },
    ],
    filters: [
      {
        condition: {
          type: String,
          enum: ['AND', 'OR'],
        },
        node_name: {
          type: String,
        },
        operator: {
          type: String,
          enum: [
            'equal',
            'notEqual',
            'moreThan',
            'lessThan',
            'between',
            'contains',
            'notContains',
            'beginsWith',
            'notBeginsWith',
            'moreThanOrEqual',
            'lessThanOrEqual',
          ],
          default: 'Equal',
        },
        node_value: {
          type: String,
        },
      },
    ],
    budget: {
      pacing: {
        type: String,
        enum: ['Daily', 'Weekly', 'Monthly'],
        default: 'Daily',
      },
      threshold: {
        type: Number,
        default: 0,
      },
    },

    start_date: {
      type: Date,
      required: true,
    },
    end_date: {
      type: Date,
      required: true,
    },

    cpc_bid: {
      type: Number,
    },
    cpa_bid: {
      type: Number,
    },
    cpc_goal: {
      type: Number,
    },
    cpa_goal: {
      type: {
        type: String,
        enum: ['static', 'dynamic'],
      },
      value: {
        type: Number,
      },
    },
    cpa_multiplier: {
      type: Number,
    },
    manual_cpc_cpa: {
      type: Number,
    },

    markup: {
      type: {
        type: String,
        enum: ['%', '$'],
      },
      value: {
        type: Number,
      },
    },

    markdown: {
      type: {
        type: String,
        enum: ['%', '$'],
      },
      value: {
        type: Number,
      },
    },

    bid_conversion: {
      from: { type: String },
      to: { type: String },
      rate: { type: Number },
    },

    currency_exchange: {
      type: Number,
    },

    job_expansion_enabled: {
      type: Boolean,
      default: false,
    },

    job_limit_per_publisher: {
      type: Boolean,
      default: false,
    },
    schedule_days: [
      {
        type: String,
      },
    ],

    job_caps: {
      budget: {
        frequency: String,
        target: Number,
        threshold: Number,
      },
      clicks: {
        frequency: String,
        target: Number,
        threshold: Number,
      },
      applies: {
        frequency: String,
        target: Number,
        threshold: Number,
      },
    },

    redirect_url_on_expiry: {
      type: String,
    },

    automation_rules: {
      type: [mongoose.Schema.Types.Mixed], // unsure about data
      default: [],
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'paused', 'completed'],
      default: 'active',
    },
  },
  { timestamps: true }
);

export default mongoose.model('JobGroup', jobGroupSchema);
