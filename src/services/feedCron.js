// src/services/feedCron.js
import Client from "../models/client.model.js";
import axios from "axios";
import zlib from "zlib";
import xmlFlow from "xml-flow";
import Job from "../models/job.model.js";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


async function processFeed(feedUrl, clientId, client = null) {
  const start = Date.now();


  console.log(`[FeedCron] 📝 JavaScript ingestion start for client ${clientId} -> ${feedUrl}`);
  // Determine mapping for this feed: prioritize per-feed mapping, fallback to legacy client.feed_node_mapping
  let mapping = [];
  if (Array.isArray(client.feeds)) {
    const feedConfig = client.feeds.find(f => f.feed_source_url === feedUrl);
    if (feedConfig?.feed_node_mapping?.length) {
      mapping = feedConfig.feed_node_mapping;
    }
  }
  // If no per-feed mapping, use legacy top-level feed_node_mapping
  if (mapping.length === 0 && Array.isArray(client.feed_node_mapping)) {
    mapping = client.feed_node_mapping;
  }
  await processFeedFallback(feedUrl, clientId, mapping);
  console.log(`[FeedCron] ✅ JavaScript ingestion finished for client ${clientId} in ${Date.now() - start}ms`);
}

async function processFeedFallback(feedUrl, clientId, mapping = []) {
  const response = await axios({
    method: "get",
    url: feedUrl,
    responseType: "stream",
    timeout: 600000,
  });

  const gunzip = zlib.createGunzip();
  const xmlStream = xmlFlow(response.data.pipe(gunzip));
  let jobCount = 0;

  return new Promise((resolve, reject) => {
    // Prepare batch operations
    let ops = [];
    const batchSize = 1000;
    // Helper to flush batch
    async function flushOps() {
      if (ops.length === 0) return;
      try {
        await Job.bulkWrite(ops, { ordered: false });
        console.log(`[FeedCron][JS] Flushed ${ops.length} jobs for client ${clientId}`);
      } catch (e) {
        console.error(`[FeedCron][JS] Bulk write error for client ${clientId}:`, e.message);
      } finally {
        ops = [];
      }
    }
    xmlStream.on("tag:job", (jobData) => {
      (async () => {
        try {
          const sanitizedData = Object.entries(jobData)
            .filter(([key]) => !key.startsWith('$'))
            .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});
          const jobId =
             jobData.job_id || jobData.id || jobData.jobId || jobData.jobid ||
             jobData.external_id || jobData.externalId || jobData.url || jobData.apply_url;
          if (jobId) {
            const mappedFields = mapping.reduce((acc, { client_node, internal_field }) => {
              if (sanitizedData[client_node] !== undefined) {
                acc[internal_field] = sanitizedData[client_node];
              }
              return acc;
            }, { job_id: String(jobId) });
            ops.push({
              updateOne: {
                filter: { feed_id: clientId, "mapped_fields.job_id": String(jobId) },
                update: { $set: { feed_id: clientId, mapped_fields: mappedFields } },
                upsert: true,
              }
            });
            jobCount++;
            if (jobCount % batchSize === 0) {
              await flushOps();
            }
          }
        } catch (err) {
          console.error(`[FeedCron][JS] Error preparing job for client ${clientId}:`, err.message);
        } finally {
          // no pause/resume to prevent skipping
        }
      })();
    });

  xmlStream.on("end", () => {
      (async () => {
        await flushOps();
        console.log(`[FeedCron][JS] Completed. Total processed: ${jobCount} for client ${clientId}`);
        resolve();
      })();
    });

    xmlStream.on("error", (err) => reject(err));
  });
}

export async function runCronCycle() {
  console.log("[FeedCron] Starting scheduled feed processing...");
  // Use cursor to stream clients one by one
  const query = {
    $or: [
      { feed_source_url: { $exists: true, $ne: "" } },
      { "feeds.0.feed_source_url": { $exists: true, $ne: "" } },
    ],
  };
  const clientCursor = Client.find(query).cursor();
  let count = 0;
  try {
    for await (const client of clientCursor) {
      count++;
      // Process each feed for this client
      if (Array.isArray(client.feeds) && client.feeds.length) {
        for (const feed of client.feeds) {
          if (feed.feed_source_url?.trim()) {
            await processFeed(feed.feed_source_url, client._id, client);
          }
        }
      } else if (client.feed_source_url?.trim()) {
        await processFeed(client.feed_source_url, client._id, client);
      }
    }
    console.log(`[FeedCron] Completed processing ${count} clients.`);
  } catch (err) {
    console.error("[FeedCron] Error in scheduled job:", err.message);
  }
}
