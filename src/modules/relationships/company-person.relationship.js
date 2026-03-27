/**
 * COMPANY-PERSON RELATIONSHIP MODULE
 *
 * Manages many-to-many relationship between companies and people
 * (e.g., employees, contacts, founders)
 */

import { query, getClient } from "../../config/database.js";
import { DatabaseException } from "../../shared/exceptions/base.exception.js";
import { createLogger } from "../../shared/utils/logger.js";

const logger = createLogger("CompanyPersonRelationshipRepository");

export class CompanyPersonRelationshipRepository {
  /**
   * ✅ CREATE RELATIONSHIP
   */
  static async createRelationship(companyId, personId, roleData = {}) {
    try {
      const result = await query(
        `INSERT INTO company_person 
         (company_id, person_id, role)
         VALUES ($1, $2, $3)
         ON CONFLICT (company_id, person_id) DO UPDATE
         SET role = EXCLUDED.role,
             updated_at = CURRENT_TIMESTAMP
         RETURNING *`,
        [companyId, personId, roleData.role || "contact"],
      );

      logger.info(
        `Relationship created: Company ${companyId} <-> Person ${personId}`,
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
  static async getRelationship(companyId, personId) {
    try {
      const result = await query(
        "SELECT * FROM company_person WHERE company_id = $1 AND person_id = $2",
        [companyId, personId],
      );
      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      logger.error("Error getting relationship", error);
      throw new DatabaseException("Failed to get relationship", error);
    }
  }

  static async getPeopleForCompany(companyId, limit = 100, offset = 0) {
    try {
      const result = await query(
        `SELECT p.*, cp.role
         FROM person p
         JOIN company_person cp ON p.id = cp.person_id
         WHERE cp.company_id = $1 AND p.status = 'active'
         ORDER BY p.first_name, p.last_name
         LIMIT $2 OFFSET $3`,
        [companyId, limit, offset],
      );
      return result.rows;
    } catch (error) {
      logger.error("Error getting people for company", error);
      throw new DatabaseException("Failed to get people", error);
    }
  }

  static async getCompaniesForPerson(personId, limit = 50, offset = 0) {
    try {
      const result = await query(
        `SELECT c.*, cp.role
         FROM company c
         JOIN company_person cp ON c.id = cp.company_id
         WHERE cp.person_id = $1 AND c.status = 'active'
         ORDER BY c.name
         LIMIT $2 OFFSET $3`,
        [personId, limit, offset],
      );
      return result.rows;
    } catch (error) {
      logger.error("Error getting companies for person", error);
      throw new DatabaseException("Failed to get companies", error);
    }
  }

  static async getPeopleByRole(companyId, role) {
    try {
      const result = await query(
        `SELECT p.*, cp.role
         FROM person p
         JOIN company_person cp ON p.id = cp.person_id
         WHERE cp.company_id = $1 AND cp.role = $2 AND p.status = 'active'
         ORDER BY p.first_name, p.last_name`,
        [companyId, role],
      );
      return result.rows;
    } catch (error) {
      logger.error("Error getting people by role", error);
      throw new DatabaseException("Failed to get people", error);
    }
  }

  /**
   * ✅ UPDATE
   */
  static async updateRelationship(companyId, personId, updateData) {
    try {
      const updates = [];
      const values = [companyId, personId];
      let paramCount = 3;

      Object.entries(updateData).forEach(([key, value]) => {
        updates.push(`${key} = $${paramCount++}`);
        values.push(value);
      });

      updates.push(`updated_at = CURRENT_TIMESTAMP`);

      const result = await query(
        `UPDATE company_person SET ${updates.join(", ")} 
         WHERE company_id = $1 AND person_id = $2 RETURNING *`,
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
  static async deleteRelationship(companyId, personId) {
    try {
      const result = await query(
        "DELETE FROM company_person WHERE company_id = $1 AND person_id = $2 RETURNING *",
        [companyId, personId],
      );
      logger.info(
        `Relationship deleted: Company ${companyId} <-> Person ${personId}`,
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
          `INSERT INTO company_person 
           (company_id, person_id, role)
           VALUES ($1, $2, $3)
           ON CONFLICT (company_id, person_id) DO NOTHING
           RETURNING *`,
          [rel.company_id, rel.person_id, rel.role || "contact"],
        );
        if (result.rows.length > 0) {
          results.push(result.rows[0]);
        }
      }

      await client.query("COMMIT");
      logger.info(
        `Bulk created ${results.length} company-person relationships`,
      );
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
  static async countPeopleForCompany(companyId) {
    try {
      const result = await query(
        "SELECT COUNT(*) FROM company_person WHERE company_id = $1",
        [companyId],
      );
      return parseInt(result.rows[0].count, 10);
    } catch (error) {
      logger.error("Error counting people for company", error);
      throw new DatabaseException("Failed to count people", error);
    }
  }
}

/**
 * COMPANY-PERSON RELATIONSHIP SERVICE
 */
export class CompanyPersonRelationshipService {
  static async linkPersonToCompany(companyId, personId, roleData = {}) {
    try {
      return await CompanyPersonRelationshipRepository.createRelationship(
        companyId,
        personId,
        roleData,
      );
    } catch (error) {
      logger.error("Error linking person to company", error);
      throw error;
    }
  }

  static async getPeopleAtCompany(companyId) {
    try {
      return await CompanyPersonRelationshipRepository.getPeopleForCompany(
        companyId,
      );
    } catch (error) {
      logger.error("Error getting people at company", error);
      throw error;
    }
  }

  static async getCompaniesForPerson(personId) {
    try {
      return await CompanyPersonRelationshipRepository.getCompaniesForPerson(
        personId,
      );
    } catch (error) {
      logger.error("Error getting companies for person", error);
      throw error;
    }
  }

  static async unlinkPersonFromCompany(companyId, personId) {
    try {
      return await CompanyPersonRelationshipRepository.deleteRelationship(
        companyId,
        personId,
      );
    } catch (error) {
      logger.error("Error unlinking person from company", error);
      throw error;
    }
  }
}
