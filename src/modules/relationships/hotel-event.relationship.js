/**
 * HOTEL-EVENT RELATIONSHIP MODULE
 *
 * Manages many-to-many relationship between hotels and events
 * (e.g., events held at or near hotels)
 */

import { query, getClient } from "../../config/database.js";
import { DatabaseException } from "../../shared/exceptions/base.exception.js";
import { createLogger } from "../../shared/utils/logger.js";

const logger = createLogger("HotelEventRelationshipRepository");

export class HotelEventRelationshipRepository {
  /**
   * ✅ CREATE RELATIONSHIP
   */
  static async createRelationship(hotelId, eventId, relationshipData = {}) {
    try {
      const result = await query(
        `INSERT INTO hotel_event 
         (hotel_id, event_id, relationship_type, distance_km)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (hotel_id, event_id) DO UPDATE
         SET distance_km = EXCLUDED.distance_km,
             updated_at = CURRENT_TIMESTAMP
         RETURNING *`,
        [
          hotelId,
          eventId,
          relationshipData.relationship_type || "nearby",
          relationshipData.distance_km || null,
        ],
      );

      logger.info(
        `Relationship created: Hotel ${hotelId} <-> Event ${eventId}`,
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
  static async getRelationship(hotelId, eventId) {
    try {
      const result = await query(
        "SELECT * FROM hotel_event WHERE hotel_id = $1 AND event_id = $2",
        [hotelId, eventId],
      );
      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      logger.error("Error getting relationship", error);
      throw new DatabaseException("Failed to get relationship", error);
    }
  }

  static async getEventsNearHotel(hotelId, limit = 50, offset = 0) {
    try {
      const result = await query(
        `SELECT e.*, he.relationship_type, he.distance_km
         FROM events e
         JOIN hotel_event he ON e.id = he.event_id
         WHERE he.hotel_id = $1 AND e.status = 'active' AND e.start_date > CURRENT_TIMESTAMP
         ORDER BY e.start_date ASC
         LIMIT $2 OFFSET $3`,
        [hotelId, limit, offset],
      );
      return result.rows;
    } catch (error) {
      logger.error("Error getting events near hotel", error);
      throw new DatabaseException("Failed to get events", error);
    }
  }

  static async getHotelsNearEvent(eventId, limit = 50, offset = 0) {
    try {
      const result = await query(
        `SELECT h.*, he.relationship_type, he.distance_km
         FROM hotel h
         JOIN hotel_event he ON h.id = he.hotel_id
         WHERE he.event_id = $1 AND h.status = 'active'
         ORDER BY he.distance_km ASC
         LIMIT $2 OFFSET $3`,
        [eventId, limit, offset],
      );
      return result.rows;
    } catch (error) {
      logger.error("Error getting hotels near event", error);
      throw new DatabaseException("Failed to get hotels", error);
    }
  }

  /**
   * ✅ UPDATE
   */
  static async updateRelationship(hotelId, eventId, updateData) {
    try {
      const updates = [];
      const values = [hotelId, eventId];
      let paramCount = 3;

      Object.entries(updateData).forEach(([key, value]) => {
        updates.push(`${key} = $${paramCount++}`);
        values.push(value);
      });

      updates.push(`updated_at = CURRENT_TIMESTAMP`);

      const result = await query(
        `UPDATE hotel_event SET ${updates.join(", ")} 
         WHERE hotel_id = $1 AND event_id = $2 RETURNING *`,
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
  static async deleteRelationship(hotelId, eventId) {
    try {
      const result = await query(
        "DELETE FROM hotel_event WHERE hotel_id = $1 AND event_id = $2 RETURNING *",
        [hotelId, eventId],
      );
      logger.info(
        `Relationship deleted: Hotel ${hotelId} <-> Event ${eventId}`,
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
          `INSERT INTO hotel_event 
           (hotel_id, event_id, relationship_type, distance_km)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (hotel_id, event_id) DO NOTHING
           RETURNING *`,
          [
            rel.hotel_id,
            rel.event_id,
            rel.relationship_type || "nearby",
            rel.distance_km || null,
          ],
        );
        if (result.rows.length > 0) {
          results.push(result.rows[0]);
        }
      }

      await client.query("COMMIT");
      logger.info(`Bulk created ${results.length} hotel-event relationships`);
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
   * ✅ COUNT
   */
  static async countEventsNearHotel(hotelId) {
    try {
      const result = await query(
        "SELECT COUNT(*) FROM hotel_event WHERE hotel_id = $1 AND event_id IN (SELECT id FROM events WHERE status = 'active')",
        [hotelId],
      );
      return parseInt(result.rows[0].count, 10);
    } catch (error) {
      logger.error("Error counting events near hotel", error);
      throw new DatabaseException("Failed to count events", error);
    }
  }
}

/**
 * HOTEL-EVENT RELATIONSHIP SERVICE
 */
export class HotelEventRelationshipService {
  static async linkHotelToEvent(hotelId, eventId, relationshipData = {}) {
    try {
      return await HotelEventRelationshipRepository.createRelationship(
        hotelId,
        eventId,
        relationshipData,
      );
    } catch (error) {
      logger.error("Error linking hotel to event", error);
      throw error;
    }
  }

  static async getEventsNearHotel(hotelId) {
    try {
      return await HotelEventRelationshipRepository.getEventsNearHotel(hotelId);
    } catch (error) {
      logger.error("Error getting events near hotel", error);
      throw error;
    }
  }

  static async getHotelsNearEvent(eventId) {
    try {
      return await HotelEventRelationshipRepository.getHotelsNearEvent(eventId);
    } catch (error) {
      logger.error("Error getting hotels near event", error);
      throw error;
    }
  }

  static async unlinkHotelFromEvent(hotelId, eventId) {
    try {
      return await HotelEventRelationshipRepository.deleteRelationship(
        hotelId,
        eventId,
      );
    } catch (error) {
      logger.error("Error unlinking hotel from event", error);
      throw error;
    }
  }
}
