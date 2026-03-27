/**
 * CRAWL BATCH SERVICE
 */

import { CrawlBatchRepository } from "./crawl-batch.repository.js";
import { CreateCrawlBatchDto } from "./dto/create-crawl-batch.dto.js";
import {
  BusinessException,
  NotFoundException,
} from "../../shared/exceptions/base.exception.js";
import { createLogger } from "../../shared/utils/logger.js";

const logger = createLogger("CrawlBatchService");

export class CrawlBatchService {
  /**
   * ✅ CREATE
   */
  static async createBatch(createBatchDto) {
    try {
      logger.info(
        `Creating crawl batch: ${createBatchDto.source}/${createBatchDto.entity_type}`,
      );

      const validatedDto = CreateCrawlBatchDto.from(createBatchDto);

      const batch = await CrawlBatchRepository.create(
        validatedDto.toDatabase(),
      );

      logger.info(`Crawl batch created: ${batch.id}`);
      return batch;
    } catch (error) {
      logger.error(`Error creating crawl batch: ${error.message}`);
      throw error;
    }
  }

  /**
   * ✅ READ
   */
  static async getBatch(id) {
    try {
      const batch = await CrawlBatchRepository.findById(id);

      if (!batch) {
        throw new NotFoundException("Crawl Batch", `id: ${id}`);
      }

      return batch;
    } catch (error) {
      logger.error(`Error getting crawl batch: ${error.message}`);
      throw error;
    }
  }

  static async listBatches(
    filters = {},
    pagination = { limit: 20, offset: 0 },
  ) {
    try {
      logger.info(
        `Listing crawl batches with filters: ${JSON.stringify(filters)}`,
      );

      const batches = await CrawlBatchRepository.findAll(filters, pagination);
      const total = await CrawlBatchRepository.count(filters);

      return {
        batches,
        total,
        limit: pagination.limit,
        offset: pagination.offset,
        hasMore: pagination.offset + pagination.limit < total,
      };
    } catch (error) {
      logger.error(`Error listing batches: ${error.message}`);
      throw error;
    }
  }

  static async getActiveBatches() {
    try {
      logger.info("Getting active crawl batches");

      const batches = await CrawlBatchRepository.findActive();

      return batches;
    } catch (error) {
      logger.error(`Error getting active batches: ${error.message}`);
      throw error;
    }
  }

  /**
   * ✅ UPDATE PROGRESS
   */
  static async updateBatchProgress(id, progressData) {
    try {
      logger.info(`Updating batch progress: ${id}`, progressData);

      const batch = await CrawlBatchRepository.findById(id);
      if (!batch) {
        throw new NotFoundException("Crawl Batch", `id: ${id}`);
      }

      const updated = await CrawlBatchRepository.updateProgress(
        id,
        progressData,
      );

      logger.info(`Batch progress updated: ${id}`);
      return updated;
    } catch (error) {
      logger.error(`Error updating batch progress: ${error.message}`);
      throw error;
    }
  }

  /**
   * ✅ START BATCH (Mark as running)
   */
  static async startBatch(id) {
    try {
      logger.info(`Starting batch: ${id}`);

      const batch = await CrawlBatchRepository.findById(id);
      if (!batch) {
        throw new NotFoundException("Crawl Batch", `id: ${id}`);
      }

      if (batch.status !== "pending") {
        throw new BusinessException(
          "INVALID_STATUS",
          `Batch status must be 'pending', currently '${batch.status}'`,
        );
      }

      const updated = await CrawlBatchRepository.updateProgress(id, {
        status: "running",
      });

      logger.info(`Batch started: ${id}`);
      return updated;
    } catch (error) {
      logger.error(`Error starting batch: ${error.message}`);
      throw error;
    }
  }

  /**
   * ✅ COMPLETE BATCH
   */
  static async completeBatch(id, statistics = {}) {
    try {
      logger.info(`Completing batch: ${id}`, statistics);

      const batch = await CrawlBatchRepository.findById(id);
      if (!batch) {
        throw new NotFoundException("Crawl Batch", `id: ${id}`);
      }

      const updated = await CrawlBatchRepository.updateProgress(id, {
        status: "completed",
        successful_items: statistics.successful_items || batch.successful_items,
        failed_items: statistics.failed_items || batch.failed_items,
        duplicate_items: statistics.duplicate_items || batch.duplicate_items,
        total_items: statistics.total_items || batch.total_items,
      });

      logger.info(`Batch completed: ${id}`);
      return updated;
    } catch (error) {
      logger.error(`Error completing batch: ${error.message}`);
      throw error;
    }
  }

  /**
   * ✅ FAIL BATCH
   */
  static async failBatch(id, errorMessage) {
    try {
      logger.error(`Failing batch: ${id}`, errorMessage);

      const batch = await CrawlBatchRepository.findById(id);
      if (!batch) {
        throw new NotFoundException("Crawl Batch", `id: ${id}`);
      }

      const updated = await CrawlBatchRepository.updateProgress(id, {
        status: "failed",
        error_message: errorMessage,
      });

      logger.error(`Batch failed: ${id}`);
      return updated;
    } catch (error) {
      logger.error(`Error failing batch: ${error.message}`);
      throw error;
    }
  }

  /**
   * ✅ GET STATISTICS
   */
  static async getStatistics(sourceFilter = null) {
    try {
      logger.info(
        `Getting crawl batch statistics${sourceFilter ? ` for source: ${sourceFilter}` : ""}`,
      );

      const statistics = await CrawlBatchRepository.getStatistics(sourceFilter);

      return statistics;
    } catch (error) {
      logger.error(`Error getting statistics: ${error.message}`);
      throw error;
    }
  }

  /**
   * ✅ GET BATCH ITEMS
   */
  static async getBatchItems(id) {
    try {
      const batch = await CrawlBatchRepository.findById(id);
      if (!batch) {
        throw new NotFoundException("Crawl Batch", `id: ${id}`);
      }

      const items = await CrawlBatchRepository.getCrawlItems(id);

      return items;
    } catch (error) {
      logger.error(`Error getting batch items: ${error.message}`);
      throw error;
    }
  }
}
