import Client from "../models/client.model.js";
// The C++ addon is the key to non-blocking, high-performance ingestion.
import { createRequire } from 'module';

// Native addons (.node files) can't be loaded with 'import'. We need to use
// createRequire to get a CommonJS-style require function that can handle them.
const require = createRequire(import.meta.url);
const { ingestJobsFromUrl } = require('../../build/Release/jobIngestion.node');

/**
 * This function orchestrates the entire feed ingestion process.
 * It finds active clients, iterates through their feeds (both new and legacy formats),
 * and calls the C++ addon to download, parse, and ingest the jobs for each feed in parallel.
 * This non-blocking approach prevents the "missed execution" warning from node-cron.
 */
export async function runCronCycle() {
  console.log("[Cron] Starting feed ingestion cycle...");
  try {
    // 1. Find all active clients that have at least one feed defined (new or legacy).
    const clients = await Client.find({
      status: "active",
      $or: [
        { "feeds.0": { $exists: true } },
        { feed_source_url: { $exists: true, $ne: null, $ne: "" } },
      ],
    }).lean();

    if (clients.length === 0) {
      console.log("[Cron] No active clients with feeds to process.");
      return;
    }

    console.log(`[Cron] Found ${clients.length} active client(s) to process.`);

    const ingestionPromises = [];

    const queueIngestion = (client, feedUrl, nodeMapping) => {
      if (!feedUrl || !nodeMapping || nodeMapping.length === 0) {
        return;
      }
      console.log(
        `[Cron] Queueing C++ ingestion for client: ${client.internal_name}, feed: ${feedUrl}`
      );

      // Call the C++ addon. It's asynchronous and runs in its own threads,
      // so it will not block the Node.js event loop.
      const promise = ingestJobsFromUrl(
        feedUrl,
        process.env.MONGO_URI,
        nodeMapping,
        client._id.toString()
      )
        .then((result) => {
          console.log(`[Cron] C++ Ingestion result for ${feedUrl}:`, result);
          // TODO: Update feed status in DB
        })
        .catch((err) => {
          console.error(`[Cron] C++ Ingestion failed for ${feedUrl}:`, err);
          // TODO: Update feed status in DB
        });

      ingestionPromises.push(promise);
    };

    // 2. Iterate over each client and their feeds.
    for (const client of clients) {
      // Prefer the new `feeds` array structure
      if (Array.isArray(client.feeds) && client.feeds.length > 0) {
        for (const feed of client.feeds) {
          if (feed.is_active) {
            queueIngestion(client, feed.feed_source_url, feed.feed_node_mapping);
          }
        }
      }
      // Fallback to the legacy top-level feed fields
      else {
        queueIngestion(client, client.feed_source_url, client.feed_node_mapping);
      }
    }

    // 3. Wait for all parallel ingestion tasks to complete.
    if (ingestionPromises.length > 0) {
      console.log(`[Cron] Waiting for ${ingestionPromises.length} ingestion tasks to complete...`);
      await Promise.all(ingestionPromises);
    }

    console.log("[Cron] Feed ingestion cycle completed.");
  } catch (error) {
    console.error("[Cron] A critical error occurred during the cron cycle:", error);
  }
}
