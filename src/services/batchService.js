// ============================================
// BATCH SERVICE - Crawl Session Management
// ============================================
// Manages complete crawl lifecycle including:
// - Batch creation and tracking
// - Item-level status updates
// - Data quality reporting
// - Deduplication
// ============================================

import { database } from "../database.js";
import { v4 as uuidv4 } from "uuid";

export class BatchService {
  // ============================================
  // CREATE: Start New Crawl Batch
  // ============================================
  static async createCrawlBatch(data) {
    const {
      projectId,
      sourceId,
      sourceName,
      totalItems,
      configSnapshot,
      priority,
      tags,
    } = data;

    const client = await database.getClient();
    try {
      await client.query("BEGIN");

      // Get next batch number for this project
      const batchNumRes = await client.query(
        `SELECT COUNT(*) as count FROM crawl_batch WHERE project_id = $1`,
        [projectId],
      );
      const nextBatchNumber = (batchNumRes.rows[0].count || 0) + 1;

      // Create batch
      const batchRes = await client.query(
        `INSERT INTO crawl_batch (
          id,
          project_id,
          source_id,
          batch_number,
          name,
          status,
          total_items,
          config_snapshot
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, batch_number, created_at`,
        [
          uuidv4(),
          projectId,
          sourceId,
          nextBatchNumber,
          `Batch ${nextBatchNumber} - ${sourceName}`,
          "pending",
          totalItems,
          configSnapshot ? JSON.stringify(configSnapshot) : null,
        ],
      );

      const batch = batchRes.rows[0];

      await client.query("COMMIT");

      return {
        id: batch.id,
        batchNumber: batch.batch_number,
        status: "pending",
        totalItems,
        createdAt: batch.created_at,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  // ============================================
  // UPDATE: Start Batch Processing
  // ============================================
  static async startBatch(batchId) {
    const result = await database.query(
      `UPDATE crawl_batch 
       SET status = $1, started_at = NOW()
       WHERE id = $2
       RETURNING id, status, started_at`,
      ["running", batchId],
    );

    return result.rows[0] || null;
  }

  // ============================================
  // UPDATE: Complete Batch
  // ============================================
  static async completeBatch(batchId, stats) {
    const {
      successCount,
      failureCount,
      skippedCount,
      hasErrors,
      errorSummary,
    } = stats;

    const client = await database.getClient();
    try {
      await client.query("BEGIN");

      // Calculate duration
      const durationRes = await client.query(
        `SELECT EXTRACT(EPOCH FROM (NOW() - started_at))::INT as duration_seconds
         FROM crawl_batch WHERE id = $1`,
        [batchId],
      );

      const duration = durationRes.rows[0]?.duration_seconds || 0;

      // Update batch
      const result = await client.query(
        `UPDATE crawl_batch 
         SET status = $1, 
             ended_at = NOW(),
             duration_seconds = $2,
             successful_items = $3,
             failed_items = $4,
             skipped_items = $5,
             has_errors = $6,
             error_summary = $7
         WHERE id = $8
         RETURNING id, batch_number`,
        [
          "completed",
          duration,
          successCount,
          failureCount,
          skippedCount,
          hasErrors,
          errorSummary,
          batchId,
        ],
      );

      await client.query("COMMIT");
      return result.rows[0];
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  // ============================================
  // CREATE: Track Crawl Item
  // ============================================
  static async createCrawlItem(batchId, itemData) {
    const {
      entityType,
      externalId,
      entityId,
      newVersionId,
      previousVersionId,
      isNew,
      isUpdated,
      changeSummary,
    } = itemData;

    const result = await database.query(
      `INSERT INTO crawl_item (
        batch_id,
        entity_type,
        external_id,
        entity_id,
        new_version_id,
        previous_version_id,
        status,
        is_new,
        is_updated,
        change_summary,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      RETURNING id`,
      [
        batchId,
        entityType,
        externalId,
        entityId,
        newVersionId,
        previousVersionId,
        "success",
        isNew,
        isUpdated,
        changeSummary ? JSON.stringify(changeSummary) : null,
      ],
    );

    return result.rows[0];
  }

  // ============================================
  // UPDATE: Mark Item as Failed
  // ============================================
  static async markItemFailed(crawlItemId, errorCode, errorMessage) {
    const result = await database.query(
      `UPDATE crawl_item 
       SET status = $1, error_code = $2, error_message = $3
       WHERE id = $4
       RETURNING id, status`,
      ["failed", errorCode, errorMessage, crawlItemId],
    );

    return result.rows[0];
  }

  // ============================================
  // UPDATE: Mark Item as Duplicate
  // ============================================
  static async markItemDuplicate(crawlItemId, primaryId) {
    const result = await database.query(
      `UPDATE crawl_item 
       SET status = $1, entity_id = $2
       WHERE id = $3
       RETURNING id, status`,
      ["duplicate", primaryId, crawlItemId],
    );

    return result.rows[0];
  }

  // ============================================
  // READ: Get Batch Info
  // ============================================
  static async getBatchInfo(batchId) {
    const result = await database.query(
      `SELECT 
        id,
        batch_number,
        project_id,
        source_id,
        name,
        status,
        started_at,
        ended_at,
        duration_seconds,
        total_items,
        successful_items,
        failed_items,
        skipped_items,
        has_errors,
        error_summary,
        created_at
      FROM crawl_batch
      WHERE id = $1`,
      [batchId],
    );

    return result.rows[0] || null;
  }

  // ============================================
  // READ: Get Batch Items
  // ============================================
  static async getBatchItems(batchId, status = null, limit = 100) {
    let query = `SELECT * FROM crawl_item WHERE batch_id = $1`;
    const params = [batchId];

    if (status) {
      query += ` AND status = $2`;
      params.push(status);
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await database.query(query, params);
    return result.rows;
  }

  // ============================================
  // READ: Get Batch Statistics
  // ============================================
  static async getBatchStatistics(batchId) {
    const result = await database.query(
      `SELECT 
        COUNT(*) as total_items,
        COUNT(CASE WHEN status = 'success' THEN 1 END) as successful_items,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_items,
        COUNT(CASE WHEN status = 'duplicate' THEN 1 END) as duplicate_items,
        COUNT(CASE WHEN status = 'skipped' THEN 1 END) as skipped_items,
        COUNT(CASE WHEN is_new THEN 1 END) as new_items,
        COUNT(CASE WHEN is_updated THEN 1 END) as updated_items,
        AVG(processing_time_ms) as avg_processing_time
      FROM crawl_item
      WHERE batch_id = $1`,
      [batchId],
    );

    return result.rows[0];
  }

  // ============================================
  // VECTOR BATCH: Create for Embeddings
  // ============================================
  static async createVectorBatch(batchId, modelInfo) {
    const { modelName, modelVersion, embeddingConfig } = modelInfo;

    const result = await database.query(
      `INSERT INTO vector_batch (
        crawl_batch_id,
        model_name,
        model_version,
        embedding_config,
        status
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING id, status, created_at`,
      [
        batchId,
        modelName,
        modelVersion,
        embeddingConfig ? JSON.stringify(embeddingConfig) : null,
        "pending",
      ],
    );

    return result.rows[0];
  }

  // ============================================
  // VECTOR BATCH: Mark as Complete
  // ============================================
  static async completeVectorBatch(vectorBatchId, stats) {
    const { successCount, failureCount } = stats;

    const result = await database.query(
      `UPDATE vector_batch 
       SET status = $1, 
           successful_vectors = $2,
           failed_vectors = $3,
           completed_at = NOW()
       WHERE id = $4
       RETURNING id, status`,
      ["completed", successCount, failureCount, vectorBatchId],
    );

    return result.rows[0];
  }

  // ============================================
  // DATA QUALITY: Generate Report
  // ============================================
  static async generateQualityReport(batchId, projectId, reportData) {
    const { metrics, issues, overallScore, status } = reportData;

    const result = await database.query(
      `INSERT INTO data_quality_report (
        batch_id,
        project_id,
        metrics,
        issues,
        overall_score,
        status,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
      RETURNING id, status, overall_score`,
      [
        batchId,
        projectId,
        JSON.stringify(metrics),
        JSON.stringify(issues),
        overallScore,
        status,
      ],
    );

    return result.rows[0];
  }

  // ============================================
  // DATA QUALITY: Get Quality Report
  // ============================================
  static async getQualityReport(batchId) {
    const result = await database.query(
      `SELECT 
        id,
        batch_id,
        project_id,
        metrics,
        issues,
        overall_score,
        status,
        created_at
      FROM data_quality_report
      WHERE batch_id = $1
      ORDER BY created_at DESC
      LIMIT 1`,
      [batchId],
    );

    return result.rows[0] || null;
  }

  // ============================================
  // RETRY: Get Failed Items for Retry
  // ============================================
  static async getFailedItemsForRetry(batchId, maxRetries = 3) {
    const result = await database.query(
      `SELECT 
        id,
        batch_id,
        entity_type,
        external_id,
        error_message,
        error_code,
        retry_count
      FROM crawl_item
      WHERE batch_id = $1 
        AND status = 'failed'
        AND retry_count < $2
      ORDER BY created_at DESC`,
      [batchId, maxRetries],
    );

    return result.rows;
  }

  // ============================================
  // RETRY: Update Retry Count
  // ============================================
  static async incrementRetryCount(crawlItemId) {
    const result = await database.query(
      `UPDATE crawl_item 
       SET retry_count = retry_count + 1
       WHERE id = $1
       RETURNING retry_count`,
      [crawlItemId],
    );

    return result.rows[0];
  }

  // ============================================
  // REPORT: Get Batch Summary
  // ============================================
  static async getBatchSummary(batchId) {
    const [batchInfo, itemStats, qualityReport] = await Promise.all([
      this.getBatchInfo(batchId),
      this.getBatchStatistics(batchId),
      this.getQualityReport(batchId),
    ]);

    return {
      batch: batchInfo,
      statistics: itemStats,
      quality: qualityReport,
    };
  }

  // ============================================
  // REPORT: Get Project Batches
  // ============================================
  static async getProjectBatches(projectId, limit = 20) {
    const result = await database.query(
      `SELECT 
        id,
        batch_number,
        name,
        status,
        started_at,
        ended_at,
        total_items,
        successful_items,
        failed_items,
        created_at
      FROM crawl_batch
      WHERE project_id = $1
      ORDER BY batch_number DESC
      LIMIT $2`,
      [projectId, limit],
    );

    return result.rows;
  }

  // ============================================
  // CLEANUP: Archive Old Batches
  // ============================================
  static async archiveOldBatches(projectId, daysToKeep = 30) {
    const client = await database.getClient();
    try {
      await client.query("BEGIN");

      // Get batches to archive
      const result = await client.query(
        `UPDATE crawl_batch 
         SET status = 'archived'
         WHERE project_id = $1 
           AND status = 'completed'
           AND created_at < NOW() - INTERVAL '1 day' * $2
         RETURNING id`,
        [projectId, daysToKeep],
      );

      const archivedCount = result.rows.length;

      await client.query("COMMIT");
      return { archivedCount };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

export default BatchService;
