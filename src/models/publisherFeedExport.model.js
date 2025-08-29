import mongoose from 'mongoose';

const publisherFeedExportSchema = new mongoose.Schema(
  {
    client_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
      required: true,
    },
    client_name: {
      type: String,
      required: true,
    },
    campaign_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Campaign',
      required: true,
    },
    campaign_name: {
      type: String,
      required: true,
    },
    job_group_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'JobGroup',
      required: true,
    },
    job_group_name: {
      type: String,
      required: true,
    },
    publisher_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Publisher',
      required: true,
    },
    publisher_name: {
      type: String,
      required: true,
    },
    feed_urls: [
      {
        url: {
          type: String,
          required: true,
        },
        file_name: {
          type: String,
          required: true,
        },
        file_path: {
          type: String,
          required: true,
        },
        job_count: {
          type: Number,
          default: 0,
        },
        file_size: {
          type: Number, // in bytes
          default: 0,
        },
        last_generated: {
          type: Date,
          default: Date.now,
        },
        status: {
          type: String,
          enum: ['generating', 'completed', 'failed'],
          default: 'generating',
        },
        error_message: {
          type: String,
        },
      },
    ],
    total_jobs_exported: {
      type: Number,
      default: 0,
    },
    export_status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
    },
    export_settings: {
      format: {
        type: String,
        enum: ['xml', 'json', 'csv'],
        default: 'xml',
      },
      compression: {
        type: Boolean,
        default: false,
      },
      include_expired: {
        type: Boolean,
        default: false,
      },
      max_jobs_per_file: {
        type: Number,
        default: 10000,
      },
    },
    last_export_date: {
      type: Date,
      default: Date.now,
    },
    next_scheduled_export: {
      type: Date,
    },
    export_frequency: {
      type: String,
      enum: ['hourly', 'daily', 'weekly', 'manual'],
      default: 'daily',
    },
    is_active: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Create compound indexes for efficient queries
publisherFeedExportSchema.index({ publisher_id: 1, job_group_id: 1 });
publisherFeedExportSchema.index({ campaign_id: 1, publisher_id: 1 });
publisherFeedExportSchema.index({ export_status: 1, is_active: 1 });
publisherFeedExportSchema.index({ last_export_date: 1 });

// Pre-save middleware to update total jobs exported
publisherFeedExportSchema.pre('save', function (next) {
  if (this.feed_urls && this.feed_urls.length > 0) {
    this.total_jobs_exported = this.feed_urls.reduce(
      (total, feed) => total + (feed.job_count || 0),
      0
    );
  }
  next();
});

// Instance method to get active feed URLs
publisherFeedExportSchema.methods.getActiveFeedUrls = function () {
  return this.feed_urls.filter((feed) => feed.status === 'completed');
};

// Instance method to get total file size
publisherFeedExportSchema.methods.getTotalFileSize = function () {
  return this.feed_urls.reduce((total, feed) => total + (feed.file_size || 0), 0);
};

// Static method to find exports by publisher and job group
publisherFeedExportSchema.statics.findByPublisherAndJobGroup = function (publisherId, jobGroupId) {
  return this.findOne({
    publisher_id: publisherId,
    job_group_id: jobGroupId,
    is_active: true,
  }).populate('client_id campaign_id job_group_id publisher_id');
};

// Static method to get publisher feed stats
publisherFeedExportSchema.statics.getPublisherFeedStats = function () {
  return this.aggregate([
    {
      $match: { is_active: true },
    },
    {
      $lookup: {
        from: 'publishers',
        localField: 'publisher_id',
        foreignField: '_id',
        as: 'publisher',
      },
    },
    {
      $lookup: {
        from: 'clients',
        localField: 'client_id',
        foreignField: '_id',
        as: 'client',
      },
    },
    {
      $unwind: '$publisher',
    },
    {
      $unwind: '$client',
    },
    {
      $project: {
        publisher_name: '$publisher.name',
        client_name: '$client.internal_name',
        feed_urls: 1,
        total_jobs_exported: 1,
        last_export_date: 1,
        export_status: 1,
        campaign_name: 1,
        job_group_name: 1,
      },
    },
  ]);
};

export default mongoose.model('PublisherFeedExport', publisherFeedExportSchema);
