/**
 * HOTEL-COMPANY RELATIONSHIP MODULE
 *
 * Manages many-to-many relationship between hotels and companies
 * (e.g., companies located near hotels, companies headquartered at hotel location)
 */

import { query, getClient } from "../../config/database.js";
import {
  DatabaseException,
  NotFoundException,
} from "../../shared/exceptions/base.exception.js";
import { createLogger } from "../../shared/utils/logger.js";

const logger = createLogger("HotelCompanyRelationshipRepository");

export class HotelCompanyRelationshipRepository {
  /**
   * ✅ CREATE RELATIONSHIP
   */
  static async createRelationship(hotelId, companyId, relationshipData = {}) {
    try {
      const result = await query(
        `INSERT INTO hotel_company 
         (hotel_id, company_id, relationship_type, distance_km, bearing)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (hotel_id, company_id) DO UPDATE
         SET distance_km = EXCLUDED.distance_km, 
             bearing = EXCLUDED.bearing,
             updated_at = CURRENT_TIMESTAMP
         RETURNING *`,
        [
          hotelId,
          companyId,
          relationshipData.relationship_type || "nearby",
          relationshipData.distance_km || null,
          relationshipData.bearing || null,
        ],
      );

      logger.info(
        `Relationship created: Hotel ${hotelId} <-> Company ${companyId}`,
      );
      return result.rows[0];
    } catch (error) {
      logger.error("Error creating relationship", error);
      throw new DatabaseException("Failed to create relationship", error);
    }
  }

  /**
   * ✅ READ
   */
  static async getRelationship(hotelId, companyId) {
    try {
      const result = await query(
        "SELECT * FROM hotel_company WHERE hotel_id = $1 AND company_id = $2",
        [hotelId, companyId],
      );
      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      logger.error("Error getting relationship", error);
      throw new DatabaseException("Failed to get relationship", error);
    }
  }

  static async getCompaniesForHotel(hotelId, limit = 50, offset = 0) {
    try {
      const result = await query(
        `SELECT c.*, hc.relationship_type, hc.distance_km, hc.bearing
         FROM company c
         JOIN hotel_company hc ON c.id = hc.company_id
         WHERE hc.hotel_id = $1 AND c.status = 'active'
         ORDER BY hc.distance_km ASC
         LIMIT $2 OFFSET $3`,
        [hotelId, limit, offset],
      );
      return result.rows;
    } catch (error) {
      logger.error("Error getting companies for hotel", error);
      throw new DatabaseException("Failed to get companies", error);
    }
  }

  static async getHotelsForCompany(companyId, limit = 50, offset = 0) {
    try {
      const result = await query(
        `SELECT h.*, hc.relationship_type, hc.distance_km, hc.bearing
         FROM hotel h
         JOIN hotel_company hc ON h.id = hc.hotel_id
         WHERE hc.company_id = $1 AND h.status = 'active'
         ORDER BY hc.distance_km ASC
         LIMIT $2 OFFSET $3`,
        [companyId, limit, offset],
      );
      return result.rows;
    } catch (error) {
      logger.error("Error getting hotels for company", error);
      throw new DatabaseException("Failed to get hotels", error);
    }
  }

  /**
   * ✅ UPDATE
   */
  static async updateRelationship(hotelId, companyId, updateData) {
    try {
      const updates = [];
      const values = [hotelId, companyId];
      let paramCount = 3;

      Object.entries(updateData).forEach(([key, value]) => {
        updates.push(`${key} = $${paramCount++}`);
        values.push(value);
      });

      updates.push(`updated_at = CURRENT_TIMESTAMP`);

      const result = await query(
        `UPDATE hotel_company SET ${updates.join(", ")} 
         WHERE hotel_id = $1 AND company_id = $2 RETURNING *`,
        values,
      );

      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      logger.error("Error updating relationship", error);
      throw new DatabaseException("Failed to update relationship", error);
    }
  }

  /**
   * ✅ DELETE
   */
  static async deleteRelationship(hotelId, companyId) {
    try {
      const result = await query(
        "DELETE FROM hotel_company WHERE hotel_id = $1 AND company_id = $2 RETURNING *",
        [hotelId, companyId],
      );
      logger.info(
        `Relationship deleted: Hotel ${hotelId} <-> Company ${companyId}`,
      );
      return result.rows.length > 0;
    } catch (error) {
      logger.error("Error deleting relationship", error);
      throw new DatabaseException("Failed to delete relationship", error);
    }
  }

  /**
   * ✅ BULK OPERATIONS
   */
  static async bulkCreateRelationships(relationships) {
    const client = await getClient();
    try {
      await client.query("BEGIN");

      const results = [];
      for (const rel of relationships) {
        const result = await client.query(
          `INSERT INTO hotel_company 
           (hotel_id, company_id, relationship_type, distance_km, bearing)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (hotel_id, company_id) DO NOTHING
           RETURNING *`,
          [
            rel.hotel_id,
            rel.company_id,
            rel.relationship_type || "nearby",
            rel.distance_km || null,
            rel.bearing || null,
          ],
        );
        if (result.rows.length > 0) {
          results.push(result.rows[0]);
        }
      }

      await client.query("COMMIT");
      logger.info(`Bulk created ${results.length} hotel-company relationships`);
      return results;
    } catch (error) {
      await client.query("ROLLBACK");
      logger.error("Error bulk creating relationships", error);
      throw new DatabaseException("Failed to bulk create relationships", error);
    } finally {
      client.release();
    }
  }

  /**
   * ✅ COUNT RELATIONSHIPS
   */
  static async countCompaniesForHotel(hotelId) {
    try {
      const result = await query(
        "SELECT COUNT(*) FROM hotel_company WHERE hotel_id = $1 AND company_id IN (SELECT id FROM company WHERE status = 'active')",
        [hotelId],
      );
      return parseInt(result.rows[0].count, 10);
    } catch (error) {
      logger.error("Error counting companies for hotel", error);
      throw new DatabaseException("Failed to count companies", error);
    }
  }
}

/**
 * HOTEL-COMPANY RELATIONSHIP SERVICE
 */
export class HotelCompanyRelationshipService {
  static async linkHotelCompany(hotelId, companyId, relationshipData = {}) {
    try {
      return await HotelCompanyRelationshipRepository.createRelationship(
        hotelId,
        companyId,
        relationshipData,
      );
    } catch (error) {
      logger.error("Error linking hotel and company", error);
      throw error;
    }
  }

  static async getCompaniesNearHotel(hotelId) {
    try {
      return await HotelCompanyRelationshipRepository.getCompaniesForHotel(
        hotelId,
      );
    } catch (error) {
      logger.error("Error getting companies near hotel", error);
      throw error;
    }
  }

  static async getHotelsNearCompany(companyId) {
    try {
      return await HotelCompanyRelationshipRepository.getHotelsForCompany(
        companyId,
      );
    } catch (error) {
      logger.error("Error getting hotels near company", error);
      throw error;
    }
  }

  static async unlinkHotelCompany(hotelId, companyId) {
    try {
      return await HotelCompanyRelationshipRepository.deleteRelationship(
        hotelId,
        companyId,
      );
    } catch (error) {
      logger.error("Error unlinking hotel and company", error);
      throw error;
    }
  }
}
