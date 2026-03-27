/**
 * COMPANY-EVENT RELATIONSHIP MODULE
 *
 * Manages many-to-many relationship between companies and events
 * (e.g., companies participating/exhibiting at events)
 */

import { query, getClient } from "../../config/database.js";
import { DatabaseException } from "../../shared/exceptions/base.exception.js";
import { createLogger } from "../../shared/utils/logger.js";

const logger = createLogger("CompanyEventRelationshipRepository");

export class CompanyEventRelationshipRepository {
  /**
   * ✅ CREATE RELATIONSHIP
   */
  static async createRelationship(companyId, eventId, roleData = {}) {
    try {
      const result = await query(
        `INSERT INTO company_event 
         (company_id, event_id, role)
         VALUES ($1, $2, $3)
         ON CONFLICT (company_id, event_id) DO UPDATE
         SET role = EXCLUDED.role,
             updated_at = CURRENT_TIMESTAMP
         RETURNING *`,
        [companyId, eventId, roleData.role || "participant"],
      );

      logger.info(
        `Relationship created: Company ${companyId} <-> Event ${eventId}`,
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
  static async getRelationship(companyId, eventId) {
    try {
      const result = await query(
        "SELECT * FROM company_event WHERE company_id = $1 AND event_id = $2",
        [companyId, eventId],
      );
      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      logger.error("Error getting relationship", error);
      throw new DatabaseException("Failed to get relationship", error);
    }
  }

  static async getEventsForCompany(companyId, limit = 50, offset = 0) {
    try {
      const result = await query(
        `SELECT e.*, ce.role
         FROM event e
         JOIN company_event ce ON e.id = ce.event_id
         WHERE ce.company_id = $1 AND e.status = 'active'
         ORDER BY e.start_date DESC
         LIMIT $2 OFFSET $3`,
        [companyId, limit, offset],
      );
      return result.rows;
    } catch (error) {
      logger.error("Error getting events for company", error);
      throw new DatabaseException("Failed to get events", error);
    }
  }

  static async getCompaniesAtEvent(eventId, limit = 100, offset = 0) {
    try {
      const result = await query(
        `SELECT c.*, ce.role
         FROM company c
         JOIN company_event ce ON c.id = ce.company_id
         WHERE ce.event_id = $1 AND c.status = 'active'
         ORDER BY c.name
         LIMIT $2 OFFSET $3`,
        [eventId, limit, offset],
      );
      return result.rows;
    } catch (error) {
      logger.error("Error getting companies at event", error);
      throw new DatabaseException("Failed to get companies", error);
    }
  }

  static async getCompaniesByRole(eventId, role) {
    try {
      const result = await query(
        `SELECT c.*, ce.role
         FROM company c
         JOIN company_event ce ON c.id = ce.company_id
         WHERE ce.event_id = $1 AND ce.role = $2 AND c.status = 'active'
         ORDER BY c.name`,
        [eventId, role],
      );
      return result.rows;
    } catch (error) {
      logger.error("Error getting companies by role", error);
      throw new DatabaseException("Failed to get companies", error);
    }
  }

  /**
   * ✅ UPDATE
   */
  static async updateRelationship(companyId, eventId, updateData) {
    try {
      const updates = [];
      const values = [companyId, eventId];
      let paramCount = 3;

      Object.entries(updateData).forEach(([key, value]) => {
        updates.push(`${key} = $${paramCount++}`);
        values.push(value);
      });

      updates.push(`updated_at = CURRENT_TIMESTAMP`);

      const result = await query(
        `UPDATE company_event SET ${updates.join(", ")} 
         WHERE company_id = $1 AND event_id = $2 RETURNING *`,
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
  static async deleteRelationship(companyId, eventId) {
    try {
      const result = await query(
        "DELETE FROM company_event WHERE company_id = $1 AND event_id = $2 RETURNING *",
        [companyId, eventId],
      );
      logger.info(
        `Relationship deleted: Company ${companyId} <-> Event ${eventId}`,
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
          `INSERT INTO company_event 
           (company_id, event_id, role)
           VALUES ($1, $2, $3)
           ON CONFLICT (company_id, event_id) DO NOTHING
           RETURNING *`,
          [rel.company_id, rel.event_id, rel.role || "participant"],
        );
        if (result.rows.length > 0) {
          results.push(result.rows[0]);
        }
      }

      await client.query("COMMIT");
      logger.info(`Bulk created ${results.length} company-event relationships`);
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
  static async countCompaniesAtEvent(eventId) {
    try {
      const result = await query(
        "SELECT COUNT(*) FROM company_event WHERE event_id = $1",
        [eventId],
      );
      return parseInt(result.rows[0].count, 10);
    } catch (error) {
      logger.error("Error counting companies at event", error);
      throw new DatabaseException("Failed to count companies", error);
    }
  }
}

/**
 * COMPANY-EVENT RELATIONSHIP SERVICE
 */
export class CompanyEventRelationshipService {
  static async linkCompanyToEvent(companyId, eventId, roleData = {}) {
    try {
      return await CompanyEventRelationshipRepository.createRelationship(
        companyId,
        eventId,
        roleData,
      );
    } catch (error) {
      logger.error("Error linking company to event", error);
      throw error;
    }
  }

  static async getEventsForCompany(companyId) {
    try {
      return await CompanyEventRelationshipRepository.getEventsForCompany(
        companyId,
      );
    } catch (error) {
      logger.error("Error getting events for company", error);
      throw error;
    }
  }

  static async getCompaniesAtEvent(eventId) {
    try {
      return await CompanyEventRelationshipRepository.getCompaniesAtEvent(
        eventId,
      );
    } catch (error) {
      logger.error("Error getting companies at event", error);
      throw error;
    }
  }

  static async unlinkCompanyFromEvent(companyId, eventId) {
    try {
      return await CompanyEventRelationshipRepository.deleteRelationship(
        companyId,
        eventId,
      );
    } catch (error) {
      logger.error("Error unlinking company from event", error);
      throw error;
    }
  }
}
