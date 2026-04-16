/**
 * EVENT REPOSITORY
 */

import { query, getClient } from "../../config/database.js";
import { DatabaseException } from "../../shared/exceptions/base.exception.js";
import { createLogger } from "../../shared/utils/logger.js";

const logger = createLogger("EventRepository");

export class EventRepository {
  /**
   * ✅ CREATE
   */
  static async create(eventData) {
    try {
      const result = await query(
        `INSERT INTO events 
         (name, description, event_type, organizer, location, lat, lng, 
          start_date, end_date, url, eventbrite_event_id, external_source, 
          external_id, attendees_count, raw_data)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         RETURNING *`,
        [
          eventData.name,
          eventData.description || null,
          eventData.event_type,
          eventData.organizer || null,
          eventData.location,
          eventData.lat,
          eventData.lng,
          eventData.start_date,
          eventData.end_date,
          eventData.url || null,
          eventData.eventbrite_event_id || null,
          eventData.external_source,
          eventData.external_id,
          eventData.attendees_count || 0,
          eventData.raw_data || null,
        ],
      );

      return result.rows[0];
    } catch (error) {
      logger.error("Error creating event", error);
      throw new DatabaseException("Failed to create event", error);
    }
  }

  /**
   * ✅ READ
   */
  static async findById(id) {
    try {
      const result = await query("SELECT * FROM events WHERE id = $1", [id]);
      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      logger.error("Error finding event by ID", error);
      throw new DatabaseException("Failed to find event", error);
    }
  }

  static async findAll(filters = {}, pagination = { limit: 20, offset: 0 }) {
    try {
      let sql = "SELECT * FROM events WHERE 1=1";
      const params = [];
      let paramCount = 1;

      if (filters.name) {
        sql += ` AND name ILIKE $${paramCount++}`;
        params.push(`%${filters.name}%`);
      }

      if (filters.event_type) {
        sql += ` AND event_type = $${paramCount++}`;
        params.push(filters.event_type);
      }

      if (filters.status) {
        sql += ` AND status = $${paramCount++}`;
        params.push(filters.status);
      }

      if (filters.status === "upcoming") {
        sql = sql.replace(
          "status = $" + paramCount,
          "start_date > CURRENT_TIMESTAMP AND status = 'active'",
        );
        params.pop();
        paramCount--;
      }

      if (filters.status === "past") {
        sql = sql.replace(
          "status = $" + paramCount,
          "end_date < CURRENT_TIMESTAMP AND status = 'active'",
        );
        params.pop();
        paramCount--;
      }

      sql += ` ORDER BY start_date DESC LIMIT $${paramCount++} OFFSET $${paramCount++}`;
      params.push(pagination.limit, pagination.offset);

      const result = await query(sql, params);
      return result.rows;
    } catch (error) {
      logger.error("Error finding events", error);
      throw new DatabaseException("Failed to find events", error);
    }
  }

  static async findNearby(lat, lng, radiusKm, limit = 20) {
    try {
      const result = await query(
        `SELECT *,
         (6371 * acos(cos(radians($2)) * cos(radians(lat)) * 
         cos(radians(lng) - radians($3)) + 
         sin(radians($2)) * sin(radians(lat)))) AS distance_km
         FROM events
         WHERE status = 'active' AND start_date > CURRENT_TIMESTAMP AND (
           6371 * acos(cos(radians($2)) * cos(radians(lat)) * 
           cos(radians(lng) - radians($3)) + 
           sin(radians($2)) * sin(radians(lat)))
         ) <= $1
         ORDER BY distance_km ASC
         LIMIT $4`,
        [radiusKm, lat, lng, limit],
      );

      return result.rows.map((row) => Event.fromDatabase(row));
    } catch (error) {
      logger.error("Error finding nearby events", error);
      throw new DatabaseException("Failed to find nearby events", error);
    }
  }

  static async findByEventbriteId(eventbriteId) {
    try {
      const result = await query(
        "SELECT * FROM events WHERE eventbrite_event_id = $1",
        [eventbriteId],
      );
      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      logger.error("Error finding event by Eventbrite ID", error);
      throw new DatabaseException("Failed to find event", error);
    }
  }

  static async findByExternalId(externalId, externalSource) {
    try {
      const result = await query(
        "SELECT * FROM events WHERE external_id = $1 AND external_source = $2",
        [externalId, externalSource],
      );
      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      logger.error("Error finding event by external ID", error);
      throw new DatabaseException("Failed to find event", error);
    }
  }

  /**
   * Find events by hotel ID (via hotel_events relationship)
   * With distance and other metadata from hotel_events table
   */
  static async findByHotel(hotelId, pagination = { limit: 20, offset: 0 }) {
    try {
      const result = await query(
        `SELECT 
           e.*,
           he.distance_km,
           he.relationship_type,
           he.confidence_score,
           he.created_at as linked_at
         FROM events e
         INNER JOIN hotel_events he ON e.id = he.event_id
         WHERE he.hotel_id = $1
         ORDER BY e.start_date DESC
         LIMIT $2 OFFSET $3`,
        [hotelId, pagination.limit, pagination.offset],
      );

      return result.rows.map((row) => ({
        ...row,
        distance_km: row.distance_km,
        relationship_type: row.relationship_type,
        confidence_score: row.confidence_score,
        linked_at: row.linked_at,
      }));
    } catch (error) {
      logger.error("Error finding events by hotel", error);
      throw new DatabaseException("Failed to find events by hotel", error);
    }
  }

  /**
   * Count events linked to hotel
   */
  static async countByHotel(hotelId) {
    try {
      const result = await query(
        `SELECT COUNT(*) FROM events e
         INNER JOIN hotel_events he ON e.id = he.event_id
         WHERE he.hotel_id = $1`,
        [hotelId],
      );
      return parseInt(result.rows[0].count, 10);
    } catch (error) {
      logger.error("Error counting events by hotel", error);
      throw new DatabaseException("Failed to count events by hotel", error);
    }
  }

  static async count(filters = {}) {
    try {
      let sql = "SELECT COUNT(*) FROM events WHERE 1=1";
      const params = [];
      let paramCount = 1;

      if (filters.status) {
        sql += ` AND status = $${paramCount++}`;
        params.push(filters.status);
      }

      const result = await query(sql, params);
      return parseInt(result.rows[0].count, 10);
    } catch (error) {
      logger.error("Error counting events", error);
      throw new DatabaseException("Failed to count events", error);
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
        `UPDATE events SET ${updates.join(", ")} WHERE id = $1 RETURNING *`,
        values,
      );

      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      logger.error("Error updating event", error);
      throw new DatabaseException("Failed to update event", error);
    }
  }

  /**
   * ✅ DELETE
   */
  static async delete(id) {
    try {
      const result = await query(
        "DELETE FROM events WHERE id = $1 RETURNING id",
        [id],
      );
      return result.rows.length > 0;
    } catch (error) {
      logger.error("Error deleting event", error);
      throw new DatabaseException("Failed to delete event", error);
    }
  }

  /**
   * ✅ BULK OPERATIONS
   */
  static async bulkCreate(events) {
    const client = await getClient();
    try {
      await client.query("BEGIN");

      const results = [];
      for (const eventData of events) {
        const result = await client.query(
          `INSERT INTO events 
           (name, description, event_type, organizer, location, lat, lng, 
            start_date, end_date, url, eventbrite_event_id, external_source, 
            external_id, attendees_count, raw_data)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
           RETURNING *`,
          [
            eventData.name,
            eventData.description || null,
            eventData.event_type,
            eventData.organizer || null,
            eventData.location,
            eventData.lat,
            eventData.lng,
            eventData.start_date,
            eventData.end_date,
            eventData.url || null,
            eventData.eventbrite_event_id || null,
            eventData.external_source,
            eventData.external_id,
            eventData.attendees_count || 0,
            eventData.raw_data || null,
          ],
        );
        results.push(result.rows[0]);
      }

      await client.query("COMMIT");
      logger.info(`Bulk created ${results.length} events`);
      return results;
    } catch (error) {
      await client.query("ROLLBACK");
      logger.error("Error bulk creating events", error);
      throw new DatabaseException("Failed to bulk create events", error);
    } finally {
      client.release();
    }
  }

  /**
   * ✅ ARCHIVE
   */
  static async archive(id) {
    try {
      return await this.update(id, { status: "archived" });
    } catch (error) {
      logger.error("Error archiving event", error);
      throw error;
    }
  }

  /**
   * ✅ UTILITY - Get companies at event
   */
  static async getCompanies(eventId) {
    try {
      const result = await query(
        `SELECT c.*, ce.role FROM company c
         JOIN company_event ce ON c.id = ce.company_id
         WHERE ce.event_id = $1 AND c.status = 'active'
         ORDER BY c.name`,
        [eventId],
      );
      return result.rows;
    } catch (error) {
      logger.error("Error getting companies for event", error);
      throw new DatabaseException("Failed to get companies", error);
    }
  }
}
