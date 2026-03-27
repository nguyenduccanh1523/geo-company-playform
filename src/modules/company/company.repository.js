/**
 * COMPANY REPOSITORY
 *
 * Tất cả database operations liên quan đến company
 */

import { query, getClient } from "../../config/database.js";
import { DatabaseException } from "../../shared/exceptions/base.exception.js";
import { logger } from "../../shared/utils/logger.js";

export class CompanyRepository {
  /**
   * ✅ CREATE - Tạo company mới
   */
  static async create(companyData) {
    try {
      const result = await query(
        `INSERT INTO companies 
         (name, industry, address, lat, lng, website, email, phone, description, source_id, external_id, place_id, google_url, rating, reviews_count, business_status, raw_data)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
         RETURNING *`,
        [
          companyData.name,
          companyData.industry || null,
          companyData.address,
          companyData.lat,
          companyData.lng,
          companyData.website || null,
          companyData.email || null,
          companyData.phone || null,
          companyData.description || null,
          companyData.source_id || null,
          companyData.external_id || null,
          companyData.place_id || null,
          companyData.google_url || null,
          companyData.rating || null,
          companyData.reviews_count || 0,
          companyData.business_status || "OPERATIONAL",
          companyData.raw_data ? JSON.stringify(companyData.raw_data) : null,
        ],
      );

      return result.rows[0];
    } catch (error) {
      logger.error("Repository: Error creating company", error);
      throw new DatabaseException("Failed to create company", error);
    }
  }

  /**
   * ✅ READ - Lấy company theo ID
   */
  static async findById(id) {
    try {
      const result = await query("SELECT * FROM companies WHERE id = $1", [id]);
      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      logger.error("Repository: Error finding company by ID", error);
      throw new DatabaseException("Failed to find company", error);
    }
  }

  /**
   * ✅ READ - Lấy company theo place_id (from Google Places)
   */
  static async findByPlaceId(placeId) {
    try {
      const result = await query(
        "SELECT * FROM companies WHERE place_id = $1 LIMIT 1",
        [placeId],
      );
      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      logger.error("Repository: Error finding company by place_id", error);
      throw new DatabaseException("Failed to find company by place_id", error);
    }
  }

  /**
   * ✅ READ - Lấy tất cả company (với filters & pagination)
   */
  static async findAll(filters = {}, pagination = { limit: 20, offset: 0 }) {
    try {
      let sql = "SELECT * FROM companies WHERE 1=1";
      const params = [];
      let paramCount = 1;

      // Filter by name
      if (filters.name) {
        sql += ` AND name ILIKE $${paramCount++}`;
        params.push(`%${filters.name}%`);
      }

      // Filter by industry
      if (filters.industry) {
        sql += ` AND industry = $${paramCount++}`;
        params.push(filters.industry);
      }

      // Filter by location (geo query)
      if (filters.lat && filters.lng && filters.radius_km) {
        sql += ` AND (
          6371 * acos(cos(radians($${paramCount + 2})) * cos(radians(lat)) * 
          cos(radians(lng) - radians($${paramCount + 1})) + 
          sin(radians($${paramCount + 2})) * sin(radians(lat)))
        ) <= $${paramCount}`;
        params.push(filters.radius_km, filters.lng, filters.lat);
        paramCount += 3;
      }

      // Order by
      if (filters.orderBy) {
        sql += ` ORDER BY ${filters.orderBy}`;
      } else {
        sql += ` ORDER BY created_at DESC`;
      }

      // Pagination
      sql += ` LIMIT $${paramCount++} OFFSET $${paramCount++}`;
      params.push(pagination.limit, pagination.offset);

      const result = await query(sql, params);
      return result.rows;
    } catch (error) {
      logger.error("Repository: Error finding companies", error);
      throw new DatabaseException("Failed to find companies", error);
    }
  }

  /**
   * ✅ READ - Tìm company gần một vị trí
   */
  static async findNearby(lat, lng, radiusKm, limit = 20) {
    try {
      const result = await query(
        `SELECT *,
         (6371 * acos(cos(radians($2)) * cos(radians(lat)) * 
         cos(radians(lng) - radians($3)) + 
         sin(radians($2)) * sin(radians(lat)))) AS distance_km
         FROM companies
         WHERE (
           6371 * acos(cos(radians($2)) * cos(radians(lat)) * 
           cos(radians(lng) - radians($3)) + 
           sin(radians($2)) * sin(radians(lat)))
         ) <= $1
         ORDER BY distance_km ASC
         LIMIT $4`,
        [radiusKm, lat, lng, limit],
      );

      return result.rows;
    } catch (error) {
      logger.error("Repository: Error finding nearby companies", error);
      throw new DatabaseException("Failed to find nearby companies", error);
    }
  }

  /**
   * ✅ READ - Đếm companies
   */
  static async count(filters = {}) {
    try {
      let sql = "SELECT COUNT(*) FROM companies WHERE 1=1";
      const params = [];
      let paramCount = 1;

      if (filters.industry) {
        sql += ` AND industry = $${paramCount++}`;
        params.push(filters.industry);
      }

      const result = await query(sql, params);
      return parseInt(result.rows[0].count, 10);
    } catch (error) {
      logger.error("Repository: Error counting companies", error);
      throw new DatabaseException("Failed to count companies", error);
    }
  }

  /**
   * ✅ UPDATE - Cập nhật company
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
        `UPDATE companies SET ${updates.join(", ")} WHERE id = $1 RETURNING *`,
        values,
      );

      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      logger.error("Repository: Error updating company", error);
      throw new DatabaseException("Failed to update company", error);
    }
  }

  /**
   * ✅ DELETE - Xóa company
   */
  static async delete(id) {
    try {
      const result = await query(
        "DELETE FROM companies WHERE id = $1 RETURNING id",
        [id],
      );
      return result.rows.length > 0;
    } catch (error) {
      logger.error("Repository: Error deleting company", error);
      throw new DatabaseException("Failed to delete company", error);
    }
  }

  /**
   * ✅ BULK CREATE - Tạo nhiều companies trong transaction
   */
  static async bulkCreate(companies) {
    const client = await getClient();
    try {
      await client.query("BEGIN");

      const results = [];
      for (const companyData of companies) {
        const result = await client.query(
          `INSERT INTO companies 
           (name, industry, address, lat, lng, website, email, phone, description, source_id, external_id, place_id, google_url, rating, reviews_count, business_status, raw_data)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
           RETURNING *`,
          [
            companyData.name,
            companyData.industry || null,
            companyData.address,
            companyData.lat,
            companyData.lng,
            companyData.website || null,
            companyData.email || null,
            companyData.phone || null,
            companyData.description || null,
            companyData.source_id || null,
            companyData.external_id || null,
            companyData.place_id || null,
            companyData.google_url || null,
            companyData.rating || null,
            companyData.reviews_count || 0,
            companyData.business_status || "OPERATIONAL",
            companyData.raw_data ? JSON.stringify(companyData.raw_data) : null,
          ],
        );
        results.push(result.rows[0]);
      }

      await client.query("COMMIT");
      logger.info(`Bulk created ${results.length} companies`);
      return results;
    } catch (error) {
      await client.query("ROLLBACK");
      logger.error("Repository: Error bulk creating companies", error);
      throw new DatabaseException("Failed to bulk create companies", error);
    } finally {
      client.release();
    }
  }

  /**
   * ✅ UTILITY - Count by industry
   */
  static async countByIndustry() {
    try {
      const result = await query(
        "SELECT industry, COUNT(*) as count FROM companies GROUP BY industry ORDER BY count DESC",
      );
      return result.rows;
    } catch (error) {
      logger.error("Repository: Error counting by industry", error);
      throw new DatabaseException("Failed to count by industry", error);
    }
  }

  /**
   * ✅ UTILITY - Check if company exists (by name + location)
   */
  static async existsByNameAndLocation(name, lat, lng, radiusKm = 5) {
    try {
      const result = await query(
        `SELECT id FROM companies 
         WHERE name ILIKE $1 AND
         (6371 * acos(cos(radians($2)) * cos(radians(lat)) * 
         cos(radians(lng) - radians($3)) + 
         sin(radians($2)) * sin(radians(lat)))) <= $4
         LIMIT 1`,
        [name, lat, lng, radiusKm],
      );
      return result.rows.length > 0;
    } catch (error) {
      logger.error("Repository: Error checking company existence", error);
      throw new DatabaseException("Failed to check company existence", error);
    }
  }
}
