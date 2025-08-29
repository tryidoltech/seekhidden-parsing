import mongoose from 'mongoose';

const publisherSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    parent_name: {
      type: String,
    },
    currency: {
      type: String,
      required: true,
    },
    bid_type: {
      type: String,
      enum: ['CPC', 'CPA'],
      required: true,
    },
    min_bid: {
      type: Number,
    },
    site_url: {
      type: String,
    },
    country: {
      type: String,
      required: true,
    },
    industry: {
      type: String,
    },
    feed_extra_tags: {
      type: String,
    },
    contact_info: [
      {
        name: {
          type: String,
        },
        phone: {
          type: String,
        },
        email: {
          type: String,
        },
        billing: {
          type: String,
        },
      },
    ],

    ftp_info: {
      host: {
        type: String,
      },
      port: {
        type: Number,
      },
      username: {
        type: String,
      },
      password: {
        type: String,
      },
      alert_recipients: {
        type: String,
      },
    },

    facebook_credentials: {
      email_or_number: {
        type: String,
      },
      password: {
        type: String,
      },
    },

    dashboard_settings: {
      show_clients_on_dashboard: {
        type: Boolean,
        default: false,
      },
      enable_client_placements: {
        type: Boolean,
        default: false,
      },
    },

    dashboard_login: {
      full_name: {
        type: String,
      },
      email: {
        type: String,
      },
      password: {
        type: String,
      },
    },

    feed_type: {
      type: String,
      enum: ['aggregated', 'individual'],
    },
    feed_details: {
      feed_url: {
        type: String,
      },
      total_jobs: {
        type: Number,
        default: 0,
      },
      assigned_clients: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Client',
        },
      ],
    },

    stats: {
      spend: {
        type: Number,
        default: 0,
      },
      valid_clicks: {
        type: Number,
        default: 0,
      },
      invalid_clicks: {
        type: Number,
        default: 0,
      },
      applies: {
        type: Number,
        default: 0,
      },
      cpa: {
        type: Number,
        default: 0,
      },
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'paused'],
      default: 'active',
    },
  },
  { timestamps: true }
);

export default mongoose.model('Publisher', publisherSchema);
