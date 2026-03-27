/**
 * CRAWL BATCH CONTROLLER
 */

import { CrawlBatchService } from "./crawl-batch.service.js";
import { CrawlBatchResponseDto } from "./dto/crawl-batch-response.dto.js";
import { createLogger } from "../../shared/utils/logger.js";

const logger = createLogger("CrawlBatchController");

export class CrawlBatchController {
  /**
   * POST /api/crawl-batches
   */
  static async createBatch(req, res, next) {
    try {
      const batch = await CrawlBatchService.createBatch(req.body);
      const response = new CrawlBatchResponseDto(batch);

      res.status(201).json({
        success: true,
        data: response,
        message: "Crawl batch created successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/crawl-batches/:id
   */
  static async getBatch(req, res, next) {
    try {
      const { id } = req.params;

      const batch = await CrawlBatchService.getBatch(id);
      const response = new CrawlBatchResponseDto(batch);

      res.json({
        success: true,
        data: response,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/crawl-batches/:id/items
   */
  static async getBatchItems(req, res, next) {
    try {
      const { id } = req.params;

      const items = await CrawlBatchService.getBatchItems(id);

      res.json({
        success: true,
        itemsCount: items.length,
        items,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/crawl-batches
   */
  static async listBatches(req, res, next) {
    try {
      const { source, entity_type, status, limit = 20, offset = 0 } = req.query;

      const result = await CrawlBatchService.listBatches(
        { source, entity_type, status },
        { limit: Math.min(parseInt(limit), 100), offset: parseInt(offset) },
      );

      const responses = result.batches.map((b) => new CrawlBatchResponseDto(b));

      res.json({
        success: true,
        data: responses,
        pagination: {
          limit: result.limit,
          offset: result.offset,
          total: result.total,
          hasMore: result.hasMore,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/crawl-batches/active
   */
  static async getActiveBatches(req, res, next) {
    try {
      const batches = await CrawlBatchService.getActiveBatches();
      const responses = batches.map((b) => new CrawlBatchResponseDto(b));

      res.json({
        success: true,
        data: responses,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/crawl-batches/:id/start
   */
  static async startBatch(req, res, next) {
    try {
      const { id } = req.params;

      const batch = await CrawlBatchService.startBatch(id);
      const response = new CrawlBatchResponseDto(batch);

      res.json({
        success: true,
        data: response,
        message: "Batch started",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/crawl-batches/:id/complete
   */
  static async completeBatch(req, res, next) {
    try {
      const { id } = req.params;
      const statistics = req.body;

      const batch = await CrawlBatchService.completeBatch(id, statistics);
      const response = new CrawlBatchResponseDto(batch);

      res.json({
        success: true,
        data: response,
        message: "Batch completed",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/crawl-batches/:id/fail
   */
  static async failBatch(req, res, next) {
    try {
      const { id } = req.params;
      const { error_message } = req.body;

      const batch = await CrawlBatchService.failBatch(id, error_message);
      const response = new CrawlBatchResponseDto(batch);

      res.json({
        success: true,
        data: response,
        message: "Batch marked as failed",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/crawl-batches/:id/progress
   */
  static async updateProgress(req, res, next) {
    try {
      const { id } = req.params;
      const progressData = req.body;

      const batch = await CrawlBatchService.updateBatchProgress(
        id,
        progressData,
      );
      const response = new CrawlBatchResponseDto(batch);

      res.json({
        success: true,
        data: response,
        message: "Batch progress updated",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/crawl-batches/statistics
   */
  static async getStatistics(req, res, next) {
    try {
      const { source } = req.query;

      const statistics = await CrawlBatchService.getStatistics(source);

      res.json({
        success: true,
        data: statistics,
      });
    } catch (error) {
      next(error);
    }
  }
}
