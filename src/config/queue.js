/**
 * BULL QUEUE CONFIG
 *
 * Khởi tạo Bull Queue cho xử lý batch save
 * Mỗi job = 1 batch (10 companies) được save vào DB
 */

import Queue from "bull";
import redis from "./redis.js";
import { createLogger } from "../shared/utils/logger.js";

const logger = createLogger("BullQueueConfig");

// Queue for saving company batches
export const companyBatchQueue = new Queue("company-batch-save", {
  redis: {
    host: process.env.REDIS_HOST || "localhost",
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
  },
  settings: {
    maxStalledCount: 2,
    lockDuration: 30000, // 30 seconds
    lockRenewTime: 15000, // 15 seconds
    maxRetriesPerRequest: null,
  },
});

// Queue for enriching companies (optional)
export const companyEnrichQueue = new Queue("company-enrich", {
  redis: {
    host: process.env.REDIS_HOST || "localhost",
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
  },
});

// Listen to queue events
companyBatchQueue.on("ready", () => {
  logger.info("✅ Company batch queue ready");
});

companyBatchQueue.on("error", (error) => {
  logger.error("❌ Queue error:", error);
});

companyBatchQueue.on("drained", () => {
  logger.debug("🎉 Queue drained - all jobs processed");
});

export default { companyBatchQueue, companyEnrichQueue };
