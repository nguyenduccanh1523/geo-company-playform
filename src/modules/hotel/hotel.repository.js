/**
 * HOTEL REPOSITORY
 *
 * Tất cả database operations cho Hotel
 */

import { query, getClient } from "../../config/database.js";
import { DatabaseException } from "../../shared/exceptions/base.exception.js";
import { createLogger } from "../../shared/utils/logger.js";

const logger = createLogger("HotelRepository");

// Simple factory function for Hotel objects
function createHotel(row) {
  return {
    id: row.id,
    external_source: row.external_source,
    external_id: row.external_id,
    name: row.name,
    address: row.address,
    lat: parseFloat(row.lat),
    lng: parseFloat(row.lng),
    phone: row.phone,
    email: row.email,
    website: row.website,
    google_url: row.google_url,
    rating: row.rating ? parseFloat(row.rating) : null,
    reviews_count: row.reviews_count,
    room_count: row.room_count,
    description: row.description,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    raw_data: row.raw_data,
  };
}

export class HotelRepository {
  /**
   * ✅ CREATE
   */
  static async create(hotelData) {
    try {
      const result = await query(
        `INSERT INTO hotels 
         (external_source, external_id, name, address, lat, lng, phone, email, 
          website, google_url, rating, reviews_count, room_count, description, raw_data)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         RETURNING *`,
        [
          hotelData.external_source,
          hotelData.external_id,
          hotelData.name,
          hotelData.address,
          hotelData.lat,
          hotelData.lng,
          hotelData.phone || null,
          hotelData.email || null,
          hotelData.website || null,
          hotelData.google_url || null,
          hotelData.rating || null,
          hotelData.reviews_count || 0,
          hotelData.room_count || null,
          hotelData.description || null,
          hotelData.raw_data || null,
        ],
      );

      return createHotel(result.rows[0]);
    } catch (error) {
      logger.error("Error creating hotel", error);
      throw new DatabaseException("Failed to create hotel", error);
    }
  }

  /**
   * ✅ READ
   */
  static async findById(id) {
    try {
      const result = await query("SELECT * FROM hotels WHERE id = $1", [id]);
      return result.rows.length > 0 ? createHotel(result.rows[0]) : null;
    } catch (error) {
      logger.error("Error finding hotel by ID", error);
      throw new DatabaseException("Failed to find hotel", error);
    }
  }

  static async findAll(filters = {}, pagination = { limit: 20, offset: 0 }) {
    try {
      let sql = "SELECT * FROM hotels WHERE 1=1";
      const params = [];
      let paramCount = 1;

      if (filters.name) {
        sql += ` AND name ILIKE $${paramCount++}`;
        params.push(`%${filters.name}%`);
      }

      if (filters.status) {
        sql += ` AND status = $${paramCount++}`;
        params.push(filters.status);
      }

      if (filters.minRating) {
        sql += ` AND rating >= $${paramCount++}`;
        params.push(filters.minRating);
      }

      sql += ` ORDER BY created_at DESC LIMIT $${paramCount++} OFFSET $${paramCount++}`;
      params.push(pagination.limit, pagination.offset);

      const result = await query(sql, params);
      return result.rows.map((row) => createHotel(row));
    } catch (error) {
      logger.error("Error finding hotels", error);
      throw new DatabaseException("Failed to find hotels", error);
    }
  }

  static async findNearby(lat, lng, radiusKm, limit = 20) {
    try {
      const result = await query(
        `SELECT *,
         (6371 * acos(cos(radians($2)) * cos(radians(lat)) * 
         cos(radians(lng) - radians($3)) + 
         sin(radians($2)) * sin(radians(lat)))) AS distance_km
         FROM hotels
         WHERE status = 'active' AND (
           6371 * acos(cos(radians($2)) * cos(radians(lat)) * 
           cos(radians(lng) - radians($3)) + 
           sin(radians($2)) * sin(radians(lat)))
         ) <= $1
         ORDER BY distance_km ASC
         LIMIT $4`,
        [radiusKm, lat, lng, limit],
      );

      return result.rows.map((row) => createHotel(row));
    } catch (error) {
      logger.error("Error finding nearby hotels", error);
      throw new DatabaseException("Failed to find nearby hotels", error);
    }
  }

  static async findByExternalId(externalId, externalSource) {
    try {
      const result = await query(
        "SELECT * FROM hotels WHERE external_id = $1 AND external_source = $2",
        [externalId, externalSource],
      );
      return result.rows.length > 0 ? createHotel(result.rows[0]) : null;
    } catch (error) {
      logger.error("Error finding hotel by external ID", error);
      throw new DatabaseException("Failed to find hotel", error);
    }
  }

  static async count(filters = {}) {
    try {
      let sql = "SELECT COUNT(*) FROM hotels WHERE 1=1";
      const params = [];
      let paramCount = 1;

      if (filters.status) {
        sql += ` AND status = $${paramCount++}`;
        params.push(filters.status);
      }

      const result = await query(sql, params);
      return parseInt(result.rows[0].count, 10);
    } catch (error) {
      logger.error("Error counting hotels", error);
      throw new DatabaseException("Failed to count hotels", error);
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
        `UPDATE hotels SET ${updates.join(", ")} WHERE id = $1 RETURNING *`,
        values,
      );

      return result.rows.length > 0 ? createHotel(result.rows[0]) : null;
    } catch (error) {
      logger.error("Error updating hotel", error);
      throw new DatabaseException("Failed to update hotel", error);
    }
  }

  /**
   * ✅ DELETE
   */
  static async delete(id) {
    try {
      const result = await query(
        "DELETE FROM hotels WHERE id = $1 RETURNING id",
        [id],
      );
      return result.rows.length > 0;
    } catch (error) {
      logger.error("Error deleting hotel", error);
      throw new DatabaseException("Failed to delete hotel", error);
    }
  }

  /**
   * ✅ BULK OPERATIONS
   */
  static async bulkCreate(hotels) {
    const client = await getClient();
    try {
      await client.query("BEGIN");

      const results = [];
      for (const hotelData of hotels) {
        const result = await client.query(
          `INSERT INTO hotels 
           (external_source, external_id, name, address, lat, lng, phone, email, 
            website, google_url, rating, reviews_count, room_count, description, raw_data)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
           RETURNING *`,
          [
            hotelData.external_source,
            hotelData.external_id,
            hotelData.name,
            hotelData.address,
            hotelData.lat,
            hotelData.lng,
            hotelData.phone || null,
            hotelData.email || null,
            hotelData.website || null,
            hotelData.google_url || null,
            hotelData.rating || null,
            hotelData.reviews_count || 0,
            hotelData.room_count || null,
            hotelData.description || null,
            hotelData.raw_data || null,
          ],
        );
        results.push(createHotel(result.rows[0]));
      }

      await client.query("COMMIT");
      logger.info(`Bulk created ${results.length} hotels`);
      return results;
    } catch (error) {
      await client.query("ROLLBACK");
      logger.error("Error bulk creating hotels", error);
      throw new DatabaseException("Failed to bulk create hotels", error);
    } finally {
      client.release();
    }
  }

  /**
   * ✅ ARCHIVE (Soft delete)
   */
  static async archive(id) {
    try {
      return await this.update(id, { status: "archived" });
    } catch (error) {
      logger.error("Error archiving hotel", error);
      throw error;
    }
  }

  /**
   * ✅ UTILITY - Get nearby companies for hotel
   */
  static async getNearbyCompanies(hotelId, radiusKm = 5, limit = 50) {
    try {
      const result = await query(
        `SELECT c.*, hc.distance_km, hc.relationship_type
         FROM company c
         JOIN hotel_company hc ON c.id = hc.company_id
         WHERE hc.hotel_id = $1 AND c.status = 'active'
         ORDER BY hc.distance_km ASC
         LIMIT $2`,
        [hotelId, limit],
      );
      return result.rows;
    } catch (error) {
      logger.error("Error getting nearby companies", error);
      throw new DatabaseException("Failed to get nearby companies", error);
    }
  }

  /**
   * ✅ UTILITY - Get nearby events
   */
  static async getNearbyEvents(hotelId, limit = 50) {
    try {
      const result = await query(
        `SELECT e.*, he.distance_km, he.relationship_type
         FROM event e
         JOIN hotel_event he ON e.id = he.event_id
         WHERE he.hotel_id = $1 AND e.status = 'active'
         ORDER BY e.start_date ASC
         LIMIT $2`,
        [hotelId, limit],
      );
      return result.rows;
    } catch (error) {
      logger.error("Error getting nearby events", error);
      throw new DatabaseException("Failed to get nearby events", error);
    }
  }
}
