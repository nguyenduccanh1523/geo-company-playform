/**
 * PERSON REPOSITORY
 */

import { query, getClient } from "../../config/database.js";
import { DatabaseException } from "../../shared/exceptions/base.exception.js";
import { createLogger } from "../../shared/utils/logger.js";

const logger = createLogger("PersonRepository");

export class PersonRepository {
  /**
   * ✅ CREATE
   */
  static async create(personData) {
    try {
      const result = await query(
        `INSERT INTO person 
         (first_name, last_name, email, phone, title, linkedin_url, 
          external_source, external_id, raw_data)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          personData.first_name,
          personData.last_name,
          personData.email || null,
          personData.phone || null,
          personData.title || null,
          personData.linkedin_url || null,
          personData.external_source,
          personData.external_id,
          personData.raw_data || null,
        ],
      );

      return Person.fromDatabase(result.rows[0]);
    } catch (error) {
      logger.error("Error creating person", error);
      throw new DatabaseException("Failed to create person", error);
    }
  }

  /**
   * ✅ READ
   */
  static async findById(id) {
    try {
      const result = await query("SELECT * FROM person WHERE id = $1", [id]);
      return result.rows.length > 0
        ? Person.fromDatabase(result.rows[0])
        : null;
    } catch (error) {
      logger.error("Error finding person by ID", error);
      throw new DatabaseException("Failed to find person", error);
    }
  }

  static async findAll(filters = {}, pagination = { limit: 20, offset: 0 }) {
    try {
      let sql = "SELECT * FROM person WHERE 1=1";
      const params = [];
      let paramCount = 1;

      if (filters.name) {
        sql += ` AND (first_name ILIKE $${paramCount} OR last_name ILIKE $${paramCount})`;
        params.push(`%${filters.name}%`);
        paramCount++;
      }

      if (filters.email) {
        sql += ` AND email = $${paramCount++}`;
        params.push(filters.email);
      }

      if (filters.title) {
        sql += ` AND title ILIKE $${paramCount++}`;
        params.push(`%${filters.title}%`);
      }

      if (filters.status) {
        sql += ` AND status = $${paramCount++}`;
        params.push(filters.status);
      }

      sql += ` ORDER BY first_name, last_name LIMIT $${paramCount++} OFFSET $${paramCount++}`;
      params.push(pagination.limit, pagination.offset);

      const result = await query(sql, params);
      return result.rows.map((row) => Person.fromDatabase(row));
    } catch (error) {
      logger.error("Error finding people", error);
      throw new DatabaseException("Failed to find people", error);
    }
  }

  static async findByEmail(email) {
    try {
      const result = await query("SELECT * FROM person WHERE email = $1", [
        email,
      ]);
      return result.rows.length > 0
        ? Person.fromDatabase(result.rows[0])
        : null;
    } catch (error) {
      logger.error("Error finding person by email", error);
      throw new DatabaseException("Failed to find person", error);
    }
  }

  static async findByExternalId(externalId, externalSource) {
    try {
      const result = await query(
        "SELECT * FROM person WHERE external_id = $1 AND external_source = $2",
        [externalId, externalSource],
      );
      return result.rows.length > 0
        ? Person.fromDatabase(result.rows[0])
        : null;
    } catch (error) {
      logger.error("Error finding person by external ID", error);
      throw new DatabaseException("Failed to find person", error);
    }
  }

  static async findByCompanyId(
    companyId,
    pagination = { limit: 20, offset: 0 },
  ) {
    try {
      const result = await query(
        `SELECT p.*, cp.role FROM person p
         JOIN company_person cp ON p.id = cp.person_id
         WHERE cp.company_id = $1 AND p.status = 'active'
         ORDER BY p.first_name, p.last_name
         LIMIT $2 OFFSET $3`,
        [companyId, pagination.limit, pagination.offset],
      );
      return result.rows.map((row) => Person.fromDatabase(row));
    } catch (error) {
      logger.error("Error finding people by company", error);
      throw new DatabaseException("Failed to find people", error);
    }
  }

  static async count(filters = {}) {
    try {
      let sql = "SELECT COUNT(*) FROM person WHERE 1=1";
      const params = [];
      let paramCount = 1;

      if (filters.status) {
        sql += ` AND status = $${paramCount++}`;
        params.push(filters.status);
      }

      const result = await query(sql, params);
      return parseInt(result.rows[0].count, 10);
    } catch (error) {
      logger.error("Error counting people", error);
      throw new DatabaseException("Failed to count people", error);
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
        `UPDATE person SET ${updates.join(", ")} WHERE id = $1 RETURNING *`,
        values,
      );

      return result.rows.length > 0
        ? Person.fromDatabase(result.rows[0])
        : null;
    } catch (error) {
      logger.error("Error updating person", error);
      throw new DatabaseException("Failed to update person", error);
    }
  }

  /**
   * ✅ DELETE
   */
  static async delete(id) {
    try {
      const result = await query(
        "DELETE FROM person WHERE id = $1 RETURNING id",
        [id],
      );
      return result.rows.length > 0;
    } catch (error) {
      logger.error("Error deleting person", error);
      throw new DatabaseException("Failed to delete person", error);
    }
  }

  /**
   * ✅ BULK OPERATIONS
   */
  static async bulkCreate(people) {
    const client = await getClient();
    try {
      await client.query("BEGIN");

      const results = [];
      for (const personData of people) {
        const result = await client.query(
          `INSERT INTO person 
           (first_name, last_name, email, phone, title, linkedin_url, 
            external_source, external_id, raw_data)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING *`,
          [
            personData.first_name,
            personData.last_name,
            personData.email || null,
            personData.phone || null,
            personData.title || null,
            personData.linkedin_url || null,
            personData.external_source,
            personData.external_id,
            personData.raw_data || null,
          ],
        );
        results.push(Person.fromDatabase(result.rows[0]));
      }

      await client.query("COMMIT");
      logger.info(`Bulk created ${results.length} people`);
      return results;
    } catch (error) {
      await client.query("ROLLBACK");
      logger.error("Error bulk creating people", error);
      throw new DatabaseException("Failed to bulk create people", error);
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
      logger.error("Error archiving person", error);
      throw error;
    }
  }

  /**
   * ✅ UTILITY - Get companies for person
   */
  static async getCompanies(personId) {
    try {
      const result = await query(
        `SELECT c.*, cp.role FROM company c
         JOIN company_person cp ON c.id = cp.company_id
         WHERE cp.person_id = $1 AND c.status = 'active'
         ORDER BY c.name`,
        [personId],
      );
      return result.rows;
    } catch (error) {
      logger.error("Error getting companies for person", error);
      throw new DatabaseException("Failed to get companies", error);
    }
  }
}
