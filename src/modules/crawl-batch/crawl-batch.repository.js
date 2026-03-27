/**
 * CRAWL BATCH REPOSITORY
 */

import { query, getClient } from "../../config/database.js";
import { DatabaseException } from "../../shared/exceptions/base.exception.js";
import { createLogger } from "../../shared/utils/logger.js";

const logger = createLogger("CrawlBatchRepository");

export class CrawlBatchRepository {
  /**
   * ✅ CREATE
   */
  static async create(batchData) {
    try {
      const result = await query(
        `INSERT INTO crawl_batch 
         (source, entity_type, status, total_items, successful_items, 
          failed_items, duplicate_items, config)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          batchData.source,
          batchData.entity_type,
          batchData.status || "pending",
          batchData.total_items || 0,
          batchData.successful_items || 0,
          batchData.failed_items || 0,
          batchData.duplicate_items || 0,
          typeof batchData.config === "string"
            ? batchData.config
            : JSON.stringify(batchData.config || {}),
        ],
      );

      return CrawlBatch.fromDatabase(result.rows[0]);
    } catch (error) {
      logger.error("Error creating crawl batch", error);
      throw new DatabaseException("Failed to create crawl batch", error);
    }
  }

  /**
   * ✅ READ
   */
  static async findById(id) {
    try {
      const result = await query("SELECT * FROM crawl_batch WHERE id = $1", [
        id,
      ]);
      return result.rows.length > 0
        ? CrawlBatch.fromDatabase(result.rows[0])
        : null;
    } catch (error) {
      logger.error("Error finding crawl batch by ID", error);
      throw new DatabaseException("Failed to find crawl batch", error);
    }
  }

  static async findAll(filters = {}, pagination = { limit: 20, offset: 0 }) {
    try {
      let sql = "SELECT * FROM crawl_batch WHERE 1=1";
      const params = [];
      let paramCount = 1;

      if (filters.source) {
        sql += ` AND source = $${paramCount++}`;
        params.push(filters.source);
      }

      if (filters.entity_type) {
        sql += ` AND entity_type = $${paramCount++}`;
        params.push(filters.entity_type);
      }

      if (filters.status) {
        sql += ` AND status = $${paramCount++}`;
        params.push(filters.status);
      }

      sql += ` ORDER BY created_at DESC LIMIT $${paramCount++} OFFSET $${paramCount++}`;
      params.push(pagination.limit, pagination.offset);

      const result = await query(sql, params);
      return result.rows.map((row) => CrawlBatch.fromDatabase(row));
    } catch (error) {
      logger.error("Error finding crawl batches", error);
      throw new DatabaseException("Failed to find crawl batches", error);
    }
  }

  static async findActive() {
    try {
      const result = await query(
        `SELECT * FROM crawl_batch 
         WHERE status IN ('pending', 'running')
         ORDER BY created_at ASC`,
      );
      return result.rows.map((row) => CrawlBatch.fromDatabase(row));
    } catch (error) {
      logger.error("Error finding active crawl batches", error);
      throw new DatabaseException("Failed to find active batches", error);
    }
  }

  static async findBySource(source) {
    try {
      const result = await query(
        "SELECT * FROM crawl_batch WHERE source = $1 ORDER BY created_at DESC LIMIT 10",
        [source],
      );
      return result.rows.map((row) => CrawlBatch.fromDatabase(row));
    } catch (error) {
      logger.error("Error finding batches by source", error);
      throw new DatabaseException("Failed to find batches", error);
    }
  }

  static async count(filters = {}) {
    try {
      let sql = "SELECT COUNT(*) FROM crawl_batch WHERE 1=1";
      const params = [];
      let paramCount = 1;

      if (filters.status) {
        sql += ` AND status = $${paramCount++}`;
        params.push(filters.status);
      }

      const result = await query(sql, params);
      return parseInt(result.rows[0].count, 10);
    } catch (error) {
      logger.error("Error counting crawl batches", error);
      throw new DatabaseException("Failed to count batches", error);
    }
  }

  /**
   * ✅ UPDATE
   */
  static async update(id, updateData) {
    try {
      const updates = [];
      const values = [id];
      let paramCount = 2;

      Object.entries(updateData).forEach(([key, value]) => {
        updates.push(`${key} = $${paramCount++}`);
        values.push(value);
      });

      updates.push(`updated_at = CURRENT_TIMESTAMP`);

      const result = await query(
        `UPDATE crawl_batch SET ${updates.join(", ")} WHERE id = $1 RETURNING *`,
        values,
      );

      return result.rows.length > 0
        ? CrawlBatch.fromDatabase(result.rows[0])
        : null;
    } catch (error) {
      logger.error("Error updating crawl batch", error);
      throw new DatabaseException("Failed to update crawl batch", error);
    }
  }

  /**
   * ✅ UPDATE STATUS AND PROGRESS
   */
  static async updateProgress(id, progressData) {
    try {
      const updates = [];
      const values = [id];
      let paramCount = 2;

      Object.entries(progressData).forEach(([key, value]) => {
        updates.push(`${key} = $${paramCount++}`);
        values.push(value);
      });

      // Auto-set started_at when status changes to 'running'
      if (progressData.status === "running") {
        updates.push(`started_at = COALESCE(started_at, CURRENT_TIMESTAMP)`);
      }

      // Auto-set completed_at when status changes to 'completed' or 'failed'
      if (
        progressData.status === "completed" ||
        progressData.status === "failed"
      ) {
        updates.push(
          `completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP)`,
        );
      }

      updates.push(`updated_at = CURRENT_TIMESTAMP`);

      const result = await query(
        `UPDATE crawl_batch SET ${updates.join(", ")} WHERE id = $1 RETURNING *`,
        values,
      );

      return result.rows.length > 0
        ? CrawlBatch.fromDatabase(result.rows[0])
        : null;
    } catch (error) {
      logger.error("Error updating batch progress", error);
      throw new DatabaseException("Failed to update progress", error);
    }
  }

  /**
   * ✅ DELETE
   */
  static async delete(id) {
    try {
      const result = await query(
        "DELETE FROM crawl_batch WHERE id = $1 RETURNING id",
        [id],
      );
      return result.rows.length > 0;
    } catch (error) {
      logger.error("Error deleting crawl batch", error);
      throw new DatabaseException("Failed to delete crawl batch", error);
    }
  }

  /**
   * ✅ GET STATISTICS
   */
  static async getStatistics(sourceFilter = null) {
    try {
      let sql = `SELECT 
        source,
        entity_type,
        COUNT(*) as total_batches,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_batches,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_batches,
        SUM(total_items) as total_items_processed,
        SUM(successful_items) as total_successful,
        SUM(failed_items) as total_failed,
        SUM(duplicate_items) as total_duplicates
      FROM crawl_batch`;

      const params = [];

      if (sourceFilter) {
        sql += " WHERE source = $1";
        params.push(sourceFilter);
      }

      sql += " GROUP BY source, entity_type ORDER BY source";

      const result = await query(sql, params);
      return result.rows;
    } catch (error) {
      logger.error("Error getting statistics", error);
      throw new DatabaseException("Failed to get statistics", error);
    }
  }

  /**
   * ✅ UTILITY - Get associated crawl items
   */
  static async getCrawlItems(batchId, limit = 100, offset = 0) {
    try {
      const result = await query(
        `SELECT * FROM crawl_item
         WHERE batch_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [batchId, limit, offset],
      );
      return result.rows;
    } catch (error) {
      logger.error("Error getting crawl items", error);
      throw new DatabaseException("Failed to get crawl items", error);
    }
  }
}
