/**
 * CRAWL BATCH ROUTES
 */

import express from "express";
import { CrawlBatchController } from "./crawl-batch.controller.js";

const router = express.Router();

/**
 * POST /api/crawl-batches
 * Create crawl batch
 */
router.post("/", CrawlBatchController.createBatch);

/**
 * GET /api/crawl-batches
 * List crawl batches with filtering
 */
router.get("/", CrawlBatchController.listBatches);

/**
 * GET /api/crawl-batches/active
 * Get active batches - MUST BE BEFORE /:id ROUTE!
 */
router.get("/active", CrawlBatchController.getActiveBatches);

/**
 * GET /api/crawl-batches/statistics
 * Get crawl statistics
 */
router.get("/statistics", CrawlBatchController.getStatistics);

/**
 * GET /api/crawl-batches/:id
 * Get batch details
 */
router.get("/:id", CrawlBatchController.getBatch);

/**
 * GET /api/crawl-batches/:id/items
 * Get items in batch
 */
router.get("/:id/items", CrawlBatchController.getBatchItems);

/**
 * POST /api/crawl-batches/:id/start
 * Start batch processing
 */
router.post("/:id/start", CrawlBatchController.startBatch);

/**
 * POST /api/crawl-batches/:id/progress
 * Update batch progress
 */
router.post("/:id/progress", CrawlBatchController.updateProgress);

/**
 * POST /api/crawl-batches/:id/complete
 * Mark batch as completed
 */
router.post("/:id/complete", CrawlBatchController.completeBatch);

/**
 * POST /api/crawl-batches/:id/fail
 * Mark batch as failed
 */
router.post("/:id/fail", CrawlBatchController.failBatch);

export default router;
