const path = require('path');

let jobIngestionAddon = null;

// Load the C++ addon
function loadJobIngestionAddon() {
  if (jobIngestionAddon) return jobIngestionAddon;

  try {
    const addon = require('../../build/Release/jobIngestion.node');
    // Verify that the addon has the expected function, as confirmed by test.service.cjs
    if (typeof addon.ingestJobsFromUrl !== 'function') {
      throw new Error('`ingestJobsFromUrl` function not found in C++ addon.');
    }
    jobIngestionAddon = addon;
    console.log('[JobIngestion] C++ addon loaded successfully');
    return jobIngestionAddon;
  } catch (error) {
    console.error('[JobIngestion] Failed to load C++ addon:', error.message);
    console.log('[JobIngestion] Make sure to build the addon: npm run build:cpp');
    return null;
  }
}

/**
 * Direct C++ job ingestion for cron jobs
 * @param {string} feedUrl - URL of the XML feed (supports gzip)
 * @param {string} mongoUri - MongoDB connection URI (without database name)
 * @param {Array} nodeMapping - Array of {client_node, internal_node} mappings
 * @param {string} clientId - The client's ID (must be a 24-char hex string)
 * @returns {Promise<Object>} - Ingestion results with statistics
 */
const ingestJobsWithCpp = async (feedUrl, mongoUri, nodeMapping, clientId) => {
  const addon = loadJobIngestionAddon();

  if (!addon) {
    throw new Error('JobIngestion C++ addon not available');
  }

  if (!clientId || clientId.length !== 24) {
    throw new Error('A valid 24-character hex string client_id is required for C++ ingestion.');
  }

  // console.log('[JobIngestion] Starting C++ ingestion...');
  // console.log('[JobIngestion] Feed URL:', feedUrl);
  // console.log('[JobIngestion] MongoDB URI:', mongoUri.replace(/\/\/.*@/, '//***:***@'));
  // console.log('[JobIngestion] Node mapping count:', nodeMapping.length);
  // console.log('[JobIngestion] Client ID:', clientId);

  try {
    // Call the C++ function with the correct name and arguments, as confirmed by test.service.cjs
    // Signature: ingestJobsFromUrl(feedUrl, mongoUri, nodeMapping, clientId)
    const result = addon.ingestJobsFromUrl(feedUrl, mongoUri, nodeMapping, clientId);
    return result;
  } catch (error) {
    console.error('[JobIngestion] C++ ingestion error:', error.message);
    throw error;
  }
};

/**
 * Convert client feed node mapping to the format expected by C++
 * @param {Object} client - Client document with feed_node_mapping
 * @returns {Array} - Array of {client_node, internal_node} objects
 */
const prepareNodeMapping = (client) => {
  const nodeMapping = [];

  // From legacy feed_node_mapping (if exists)
  if (client.feed_node_mapping && Array.isArray(client.feed_node_mapping)) {
    client.feed_node_mapping.forEach((mapping) => {
      if (mapping.client_node && mapping.internal_field) {
        nodeMapping.push({
          client_node: mapping.client_node,
          internal_node: mapping.internal_field,
        });
      }
    });
  }

  // From feeds array (primary source)
  if (client.feeds && Array.isArray(client.feeds)) {
    client.feeds.forEach((feed) => {
      if (feed.feed_node_mapping && Array.isArray(feed.feed_node_mapping)) {
        feed.feed_node_mapping.forEach((mapping) => {
          if (mapping.client_node && mapping.internal_field) {
            // Avoid duplicates
            const exists = nodeMapping.some(
              (nm) =>
                nm.client_node === mapping.client_node &&
                nm.internal_node === mapping.internal_field
            );
            if (!exists) {
              nodeMapping.push({
                client_node: mapping.client_node,
                internal_node: mapping.internal_field,
              });
            }
          }
        });
      }
    });
  }

  // Add default job_id mapping if not present
  const hasJobIdMapping = nodeMapping.some(
    (nm) => nm.internal_node === 'job_id' || nm.client_node.toLowerCase().includes('id')
  );

  if (!hasJobIdMapping) {
    // Try common job ID field names
    nodeMapping.push({
      client_node: 'id', // Default assumption
      internal_node: 'job_id',
    });
  }

  return nodeMapping;
};

/**
 * Process a client's feed using high-performance C++ ingestion
 * @param {Object} client - Client document
 * @param {string} feedUrl - Feed URL to process
 * @param {string} mongoUri - MongoDB connection URI (without database name)
 * @returns {Promise<Object>} - Processing results
 */
const processClientFeedWithCpp = async (client, feedUrl, mongoUri) => {
  try {
    console.log(`[JobIngestion] Starting C++ ingestion for client: ${client.internal_name}`);
    console.log(`[JobIngestion] Feed URL: ${feedUrl}`);

    // Prepare node mapping for C++
    const nodeMapping = prepareNodeMapping(client);

    if (nodeMapping.length === 0) {
      throw new Error('No valid node mapping found for client');
    }

    // console.log(`[JobIngestion] Node mapping prepared: ${nodeMapping.length} mappings`);
    // nodeMapping.forEach((nm) => {
    //   console.log(`[JobIngestion] Mapping: ${nm.client_node} -> ${nm.internal_node}`);
    // });

    // Ensure mongoUri doesn't include database name (C++ code adds it)
    let cleanMongoUri = mongoUri;
    if (mongoUri.includes('/seekhidden')) {
      cleanMongoUri = mongoUri.replace('/seekhidden', '');
    }

    const clientId = client._id.toString();

    // Call C++ ingestion with all required parameters
    const result = await ingestJobsWithCpp(feedUrl, cleanMongoUri, nodeMapping, clientId);

    console.log(
      `[JobIngestion] C++ ingestion completed for client: ${client.internal_name} in ${result.duration_s}s`
    );
    // console.log(`[JobIngestion] Results:`, result);
    console.log(`[CRON] Results: ${result.inserted} inserted, ${result.failed} failed`);

    return {
      success: true,
      client_id: client._id,
      client_name: client.internal_name,
      feed_url: feedUrl,
      processing_method: 'cpp_direct_mongodb',
      ...result,
    };
  } catch (error) {
    console.error(`[JobIngestion] C++ ingestion failed for client: ${client.internal_name}`, error);
    throw error;
  }
};

module.exports = {
  ingestJobsWithCpp,
  processClientFeedWithCpp,
  prepareNodeMapping,
};
