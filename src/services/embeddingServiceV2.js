// ============================================
// EMBEDDING SERVICE V2 - Vector Lifecycle
// ============================================
// Handles vector generation with version awareness:
// - Vectors tied to data versions (not just entities)
// - Vector batches track embedding runs
// - Support for multiple model versions
// - Lifecycle management (refresh, expiry)
// ============================================

import OpenAI from "openai";
import { database } from "../database.js";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Default configuration
const EMBEDDING_CONFIG = {
  model: "text-embedding-3-small",
  dimensions: 1536,
  batch_size: 100,
  timeout: 60000,
};

export class EmbeddingServiceV2 {
  // ============================================
  // EMBED: Generate Single Embedding
  // ============================================
  static async embedText(text) {
    if (!text || text.trim().length === 0) {
      throw new Error("Text cannot be empty");
    }

    try {
      const response = await openai.embeddings.create({
        model: EMBEDDING_CONFIG.model,
        input: text.substring(0, 8191), // OpenAI token limit
      });

      return response.data[0].embedding;
    } catch (error) {
      console.error("Embedding error:", error.message);
      throw new Error(`Failed to embed text: ${error.message}`);
    }
  }

  // ============================================
  // EMBED: Batch Company Embeddings
  // ============================================
  static async embedCompanyVersions(vectorBatchId, companyVersions) {
    const results = [];
    const batchSize = EMBEDDING_CONFIG.batch_size;

    for (let i = 0; i < companyVersions.length; i += batchSize) {
      const batch = companyVersions.slice(i, i + batchSize);

      for (const version of batch) {
        try {
          // Create text chunk from version data
          const textChunk = this.createCompanyTextChunk(version);

          // Generate embedding
          const embedding = await this.embedText(textChunk);

          // Store in database
          const result = await database.query(
            `INSERT INTO company_vector_version (
              company_version_id,
              vector_batch_id,
              embedding,
              text_chunk,
              chunk_index,
              metadata,
              created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
            RETURNING id`,
            [
              version.id,
              vectorBatchId,
              JSON.stringify(embedding),
              textChunk,
              0,
              JSON.stringify({
                model: EMBEDDING_CONFIG.model,
                type: "company",
                quality: 0.95,
              }),
            ],
          );

          results.push({
            versionId: version.id,
            vectorId: result.rows[0].id,
            success: true,
          });
        } catch (error) {
          results.push({
            versionId: version.id,
            success: false,
            error: error.message,
          });
        }
      }
    }

    return results;
  }

  // ============================================
  // EMBED: Batch Event Embeddings
  // ============================================
  static async embedEventVersions(vectorBatchId, eventVersions) {
    const results = [];

    for (const version of eventVersions) {
      try {
        const textChunk = this.createEventTextChunk(version);
        const embedding = await this.embedText(textChunk);

        const result = await database.query(
          `INSERT INTO event_vector_version (
            event_version_id,
            vector_batch_id,
            embedding,
            text_chunk,
            chunk_index,
            metadata,
            created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
          RETURNING id`,
          [
            version.id,
            vectorBatchId,
            JSON.stringify(embedding),
            textChunk,
            0,
            JSON.stringify({
              model: EMBEDDING_CONFIG.model,
              type: "event",
              quality: 0.95,
            }),
          ],
        );

        results.push({
          versionId: version.id,
          vectorId: result.rows[0].id,
          success: true,
        });
      } catch (error) {
        results.push({
          versionId: version.id,
          success: false,
          error: error.message,
        });
      }
    }

    return results;
  }

  // ============================================
  // EMBED: Batch Person Embeddings
  // ============================================
  static async embedPersonVersions(vectorBatchId, personVersions) {
    const results = [];

    for (const version of personVersions) {
      try {
        const textChunk = this.createPersonTextChunk(version);
        const embedding = await this.embedText(textChunk);

        const result = await database.query(
          `INSERT INTO person_vector_version (
            person_version_id,
            vector_batch_id,
            embedding,
            text_chunk,
            chunk_index,
            metadata,
            created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
          RETURNING id`,
          [
            version.id,
            vectorBatchId,
            JSON.stringify(embedding),
            textChunk,
            0,
            JSON.stringify({
              model: EMBEDDING_CONFIG.model,
              type: "person",
              quality: 0.95,
            }),
          ],
        );

        results.push({
          versionId: version.id,
          vectorId: result.rows[0].id,
          success: true,
        });
      } catch (error) {
        results.push({
          versionId: version.id,
          success: false,
          error: error.message,
        });
      }
    }

    return results;
  }

  // ============================================
  // SEARCH: Semantic Search Companies
  // ============================================
  static async searchCompanies(query, projectId, limit = 10) {
    try {
      // Generate query embedding
      const queryEmbedding = await this.embedText(query);

      // Search in vector database
      const result = await database.query(
        `SELECT 
          cvv.id as vector_id,
          c.id as company_id,
          cv.version,
          cv.name,
          cv.industry,
          cv.address,
          cv.description,
          cvv.text_chunk,
          1 - (cvv.embedding <=> $1::vector) as similarity_score,
          vb.model_name,
          vb.model_version
        FROM company_vector_version cvv
        JOIN company_version cv ON cvv.company_version_id = cv.id
        JOIN company c ON cv.company_id = c.id
        JOIN vector_batch vb ON cvv.vector_batch_id = vb.id
        WHERE c.project_id = $2
          AND c.status = 'active'
          AND c.current_version_id = cv.id
          AND vb.status = 'completed'
        ORDER BY similarity_score DESC
        LIMIT $3`,
        [JSON.stringify(queryEmbedding), projectId, limit],
      );

      // Update usage stats
      for (const row of result.rows) {
        await database.query(
          `UPDATE vector_metadata 
           SET query_count = query_count + 1, 
               last_queried_at = NOW()
           WHERE vector_batch_id = $1`,
          [row.vector_batch_id],
        );
      }

      return result.rows;
    } catch (error) {
      console.error("Search error:", error.message);
      throw error;
    }
  }

  // ============================================
  // SEARCH: Semantic Search Events
  // ============================================
  static async searchEvents(query, projectId, limit = 10) {
    try {
      const queryEmbedding = await this.embedText(query);

      const result = await database.query(
        `SELECT 
          evv.id as vector_id,
          e.id as event_id,
          ev.version,
          ev.name,
          ev.description,
          ev.start_date,
          ev.location,
          evv.text_chunk,
          1 - (evv.embedding <=> $1::vector) as similarity_score,
          vb.model_version
        FROM event_vector_version evv
        JOIN event_version ev ON evv.event_version_id = ev.id
        JOIN event e ON ev.event_id = e.id
        JOIN vector_batch vb ON evv.vector_batch_id = vb.id
        WHERE e.project_id = $2
          AND e.status = 'active'
          AND e.current_version_id = ev.id
          AND vb.status = 'completed'
        ORDER BY similarity_score DESC
        LIMIT $3`,
        [JSON.stringify(queryEmbedding), projectId, limit],
      );

      return result.rows;
    } catch (error) {
      console.error("Search error:", error.message);
      throw error;
    }
  }

  // ============================================
  // REFRESH: Re-embed with New Model
  // ============================================
  static async refreshEmbeddingsWithNewModel(
    projectId,
    modelName,
    modelVersion,
  ) {
    const client = await database.getClient();
    try {
      await client.query("BEGIN");

      // Create new vector batch for this refresh
      const vectorBatchRes = await client.query(
        `INSERT INTO vector_batch (
          model_name,
          model_version,
          status
        ) VALUES ($1, $2, $3)
        RETURNING id`,
        [modelName, modelVersion, "pending"],
      );

      const vectorBatchId = vectorBatchRes.rows[0].id;

      // Get all current company versions
      const companyVersions = await client.query(
        `SELECT DISTINCT cv.id, cv.name, cv.industry, cv.description
         FROM company_version cv
         JOIN company c ON cv.company_id = c.id
         WHERE c.project_id = $1
           AND c.current_version_id = cv.id`,
        [projectId],
      );

      // Re-embed all
      const embedResults = await this.embedCompanyVersions(
        vectorBatchId,
        companyVersions.rows,
      );

      // Mark vector batch as complete
      const successCount = embedResults.filter((r) => r.success).length;
      await client.query(
        `UPDATE vector_batch 
         SET status = $1, successful_vectors = $2, completed_at = NOW()
         WHERE id = $3`,
        ["completed", successCount, vectorBatchId],
      );

      await client.query("COMMIT");

      return {
        vectorBatchId,
        refreshedCount: successCount,
        modelVersion,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  // ============================================
  // HEALTH: Check Vector Freshness
  // ============================================
  static async checkVectorFreshness(projectId) {
    const result = await database.query(
      `SELECT 
        vb.id,
        vb.model_version,
        COUNT(cvv.id) as vector_count,
        MAX(vb.created_at) as latest_created,
        CASE 
          WHEN MAX(vb.created_at) < NOW() - INTERVAL '30 days' THEN 'stale'
          WHEN MAX(vb.created_at) < NOW() - INTERVAL '7 days' THEN 'aging'
          ELSE 'fresh'
        END as freshness_status
      FROM vector_batch vb
      LEFT JOIN company_vector_version cvv ON vb.id = cvv.vector_batch_id
      WHERE vb.status = 'completed'
      GROUP BY vb.id, vb.model_version
      ORDER BY latest_created DESC`,
      [projectId],
    );

    return result.rows;
  }

  // ============================================
  // UTILITY: Create Company Text Chunk
  // ============================================
  static createCompanyTextChunk(version) {
    const parts = [
      version.name,
      version.industry,
      version.address,
      version.description,
    ].filter(Boolean);

    return parts.join(" | ");
  }

  // ============================================
  // UTILITY: Create Event Text Chunk
  // ============================================
  static createEventTextChunk(version) {
    const parts = [version.name, version.description, version.location].filter(
      Boolean,
    );

    return parts.join(" | ");
  }

  // ============================================
  // UTILITY: Create Person Text Chunk
  // ============================================
  static createPersonTextChunk(version) {
    const parts = [version.full_name, version.title, version.bio].filter(
      Boolean,
    );

    return parts.join(" | ");
  }

  // ============================================
  // STATS: Get Embedding Statistics
  // ============================================
  static async getEmbeddingStatistics(projectId) {
    const result = await database.query(
      `SELECT 
        COUNT(DISTINCT vb.id) as total_batches,
        COUNT(DISTINCT vb.model_version) as model_versions,
        SUM(vb.successful_vectors) as total_vectors,
        AVG(vm.quality_score) as avg_quality,
        COUNT(CASE WHEN vm.expires_at < NOW() THEN 1 END) as expired_count
      FROM vector_batch vb
      LEFT JOIN vector_metadata vm ON vb.id = vm.vector_batch_id
      WHERE vb.status = 'completed'`,
    );

    return result.rows[0];
  }

  // ============================================
  // UTILITY: Batch Size Config
  // ============================================
  static setBatchSize(size) {
    EMBEDDING_CONFIG.batch_size = size;
  }

  // ============================================
  // UTILITY: Get Current Config
  // ============================================
  static getConfig() {
    return { ...EMBEDDING_CONFIG };
  }
}

export default EmbeddingServiceV2;
