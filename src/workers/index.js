#!/usr/bin/env node

/**
 * WORKER PROCESS
 *
 * Chạy batch save worker riêng
 * npm run worker
 */

import "./batch-save.worker.js";

console.log("✅ Batch save worker running...");
console.log("📡 Listening for jobs on 'company-batch-save' queue");
console.log("\nTo stop: Press Ctrl+C");
