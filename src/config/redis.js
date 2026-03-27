/**
 * REDIS CONFIG
 *
 * Cấu hình kết nối Redis cho Bull Queue
 * Dùng ioredis để có tính ổn định cao
 */

import Redis from "ioredis";

const redis = new Redis({
  host: process.env.REDIS_HOST || "localhost",
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  enableOfflineQueue: true,
  retryStrategy: (times) => Math.min(times * 50, 2000), // Retry logic
});

redis.on("connect", () => {
  console.log("✅ Redis connected");
});

redis.on("error", (error) => {
  console.error("❌ Redis error:", error);
});

redis.on("close", () => {
  console.log("⚠️  Redis disconnected");
});

export default redis;
