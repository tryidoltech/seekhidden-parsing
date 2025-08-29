import mongoose from 'mongoose';

const clientSchema = new mongoose.Schema(
  {
    internal_name: {
      type: String,
      required: true,
    },
    external_name: {
      type: String,
      required: true,
    },
    advertiser_name: {
      type: String,
      required: true,
    },
    currency: {
      type: String,
      required: true,
    },
    currency_exchange: {
      type: Number,
    },
    budget: {
      threshold: {
        type: Number,
        default: 0,
      },
      pacing: {
        type: String,
        enum: [
          'daily',
          'weekly',
          'monthly',
          'even',
          'aggressive',
          'conservative',
          'frontloaded',
          'backloaded',
        ],
        default: 'daily',
      },
      target: {
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
    timezone: {
      type: String,
      required: true,
    },
    feed_refresh_frequency: {
      type: Number,
      min: 1,
      max: 24,
      required: true,
    },
    click_apply_filters: {
      restrict_invalid_clicks: {
        type: Boolean,
        default: false,
      },
      restrict_invalid_job_urls: {
        type: Boolean,
        default: false,
      },
      redirect_invalid_to_active: {
        type: Boolean,
        default: false,
      },
      invalid_application_restriction: [
        {
          type: String,
          enum: ['BOT', 'Foreign', 'Expired'],
        },
      ],
    },
    bid_margin: {
      markup: {
        type: {
          type: String,
          enum: ['%', '$'],
          default: '%',
        },
        value: {
          type: Number,
          required: true,
        },
      },
      markdown: {
        type: {
          type: String,
          enum: ['%', '$'],
          default: '%',
        },
        value: {
          type: Number,
          required: true,
        },
      },
    },
    feed_type: {
      type: String,
      enum: ['XML', 'API', 'Excel', 'CSV'],
    },
    feed_source_url: {
      type: String,
    },
    feed_node_mapping: [
      {
        client_node: {
          type: String,
        },
        internal_field: {
          type: String,
        },
      },
    ],
    // Multiple feeds support - new structure (XML only)
    feeds: [
      {
        feed_source_url: {
          type: String,
          required: true,
        },
        feed_node_mapping: [
          {
            client_node: {
              type: String,
            },
            internal_field: {
              type: String,
            },
          },
        ],
        // Optional fields for feed metadata
        feed_name: {
          type: String,
        },
        feed_description: {
          type: String,
        },
        is_active: {
          type: Boolean,
          default: true,
        },
        last_parsed: {
          type: Date,
        },
        parsing_status: {
          type: String,
          enum: ['pending', 'parsing', 'complete', 'error'],
          default: 'pending',
        },
      },
    ],
    industry: {
      type: String,
      required: true,
    },
    country: {
      type: String,
      required: true,
    },
    feed_bid_type: {
      type: String,
      enum: ['CPC', 'CPA'],
      required: true,
    },
    master_client_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
    },
    show_dashboard: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'paused'],
      default: 'active',
    },
  },
  { timestamps: true }
);

export default mongoose.model('Client', clientSchema);
