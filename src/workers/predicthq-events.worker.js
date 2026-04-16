/**
 * PREDICTHQ EVENTS WORKER
 *
 * Xử lý background jobs từ predictHqEventsQueue
 * Mỗi job = 1 vị trí cần crawl events
 */

import { predictHqEventsQueue } from "../config/queue.js";
import { PredictHqEventsService } from "../services/predictHqEventsService.js";
import { createLogger } from "../shared/utils/logger.js";
import redis from "../config/redis.js";

const logger = createLogger("PredictHqEventsWorker");

// Initialize PredictHQ service with token from env
const predictHqToken = process.env.PREDICTHQ_ACCESS_TOKEN;

if (!predictHqToken) {
  logger.error("❌ PREDICTHQ_ACCESS_TOKEN not set in environment");
  process.exit(1);
}

const predictHqService = new PredictHqEventsService(predictHqToken);

/**
 * Handle job từ queue
 * Job data:
 * {
 *   lat: number,
 *   lng: number,
 *   radius_km: number,
 *   hotelId: string (optional),
 *   eventsSessionId: string (optional) - to update session with results
 *   location_name: string (optional)
 * }
 */
predictHqEventsQueue.process(async (job) => {
  const { lat, lng, radius_km, hotelId, eventsSessionId, location_name } =
    job.data;

  logger.info(`\n${"=".repeat(70)}`);
  logger.info(`📍 Processing PredictHQ crawl job`);
  logger.info(`   Job ID: ${job.id}`);
  logger.info(`   Location: ${lat}, ${lng}`);
  logger.info(`   Radius: ${radius_km}km`);
  logger.info(`   Hotel: ${hotelId || "N/A"}`);
  logger.info(`   Events Session: ${eventsSessionId || "N/A"}`);
  logger.info(`${"=".repeat(70)}`);

  try {
    // Run the crawl
    const result = await predictHqService.crawlLocationAndSaveEvents(
      lat,
      lng,
      radius_km,
      {
        hotelId,
        location_name,
      },
    );

    logger.info(`✅ Job completed successfully`);
    logger.info(`   Status: ${result.status}`);
    logger.info(`   Message: ${result.message}`);
    logger.info(`   Events saved: ${result.events_saved?.length || 0}`);

    // ✅ Update EventSearchSession if provided
    if (eventsSessionId) {
      try {
        const sessionData = await redis.get(`events:${eventsSessionId}`);
        if (sessionData) {
          const eventSession = JSON.parse(sessionData);

          // Update session with results
          if (result.status === "skipped") {
            eventSession.totalSkipped += 1;
          } else {
            eventSession.totalEvents = result.events_returned || 0;
            eventSession.totalSaved = result.events_saved?.length || 0;
            eventSession.totalFailed = result.errors?.length || 0;
          }

          eventSession.status = "COMPLETED";
          eventSession.endTime = Date.now();
          await redis.setex(
            `events:${eventsSessionId}`,
            36000,
            JSON.stringify(eventSession),
          );

          logger.info(`✅ Updated EventSearchSession: ${eventsSessionId}`);
        }
      } catch (sessionError) {
        logger.warn(
          `⚠️  Failed to update event session: ${sessionError.message}`,
        );
      }
    }

    // Return result for job completion tracking
    return result;
  } catch (error) {
    logger.error(`❌ Job failed: ${error.message}`);

    // ✅ Update EventSearchSession with error
    if (eventsSessionId) {
      try {
        const sessionData = await redis.get(`events:${eventsSessionId}`);
        if (sessionData) {
          const eventSession = JSON.parse(sessionData);
          eventSession.status = "FAILED";
          eventSession.error = error.message;
          eventSession.endTime = Date.now();
          await redis.setex(
            `events:${eventsSessionId}`,
            36000,
            JSON.stringify(eventSession),
          );
        }
      } catch (sessionError) {
        logger.warn(
          `⚠️  Failed to update failed event session: ${sessionError.message}`,
        );
      }
    }

    throw error;
  }
});

// Job events
predictHqEventsQueue.on("completed", (job, result) => {
  logger.info(`✅ Job ${job.id} completed`);
  if (result.status === "skipped") {
    logger.info(`   (Location already crawled recently)`);
  }
});

predictHqEventsQueue.on("failed", (job, error) => {
  logger.error(
    `❌ Job ${job.id} failed after ${job.attemptsMade} attempts: ${error.message}`,
  );
});

predictHqEventsQueue.on("error", (error) => {
  logger.error(`❌ Queue error: ${error.message}`);
});

logger.info("✅ PredictHQ Events Worker started and waiting for jobs...");

// Graceful shutdown
process.on("SIGINT", async () => {
  logger.info("\n🛑 Shutting down PredictHQ Events Worker...");
  await predictHqEventsQueue.close();
  process.exit(0);
});

export default predictHqEventsQueue;
