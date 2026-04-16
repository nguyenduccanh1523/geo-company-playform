#!/usr/bin/env node

/**
 * WORKER PROCESS
 *
 * Chạy batch save worker riêng
 * npm run worker
 * npm run worker:predicthq
 */

import "./batch-save.worker.js";
import "./predicthq-events.worker.js";

console.log("✅ Workers running...");
console.log("📡 Listening for jobs on 'company-batch-save' and 'predicthq-events-crawl' queues");
console.log("\nTo stop: Press Ctrl+C");

