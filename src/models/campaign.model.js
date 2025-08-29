import mongoose from 'mongoose';

const campaignSchema = new mongoose.Schema(
  {
    client_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
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
    currency: {
      type: String,
      enum: ['USD', 'EUR', 'GBP'],
      default: 'USD',
    },
    cpa_goal: {
      type: Number,
    },
    manual_cpc_goal: {
      type: Number,
    },
    manual_cpa_goal: {
      type: Number,
    },
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
    start_date: {
      type: Date,
      required: true,
    },
    end_date: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'paused', 'completed'],
      default: 'active',
    },
  },
  { timestamps: true }
);

export default mongoose.model('Campaign', campaignSchema);
