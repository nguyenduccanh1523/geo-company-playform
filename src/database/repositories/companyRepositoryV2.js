// ============================================
// COMPANY REPOSITORY - VERSION 2
// ============================================
// Handles versioned company data with batch awareness
// Key changes from v1:
// - createCompany() now creates company + company_version
// - updateCompany() creates new version instead of UPDATE
// - All operations are batch-aware
// ============================================

import { database } from "../database.js";

export class CompanyRepositoryV2 {
  // ============================================
  // CREATE: New Company (with first version)
  // ============================================
  static async createCompany(data) {
    const {
      name,
      industry,
      address,
      lat,
      lng,
      website,
      email,
      phone,
      description,
      projectId,
      sourceId,
      externalId,
      source,
      batchId,
      rawData,
      tags,
    } = data;

    const client = await database.getClient();
    try {
      await client.query("BEGIN");

      // 1. Create company record
      const companyRes = await client.query(
        `INSERT INTO company (
          project_id,
          source_id,
          external_id,
          source,
          status
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING id`,
        [projectId, sourceId, externalId, source, "active"],
      );

      const companyId = companyRes.rows[0].id;

      // 2. Create first version
      const versionRes = await client.query(
        `INSERT INTO company_version (
          company_id,
          version,
          batch_id,
          name,
          industry,
          address,
          lat,
          lng,
          website,
          email,
          phone,
          description,
          data_quality_score,
          raw_data,
          tags
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        RETURNING id`,
        [
          companyId,
          1,
          batchId,
          name,
          industry,
          address,
          lat,
          lng,
          website,
          email,
          phone,
          description,
          1.0, // confidence score
          rawData ? JSON.stringify(rawData) : null,
          tags || [],
        ],
      );

      const versionId = versionRes.rows[0].id;

      // 3. Update company current_version_id
      await client.query(
        `UPDATE company SET current_version_id = $1 WHERE id = $2`,
        [versionId, companyId],
      );

      // 4. Log change
      await client.query(
        `INSERT INTO change_log (
          entity_type,
          entity_id,
          batch_id,
          change_type,
          new_values,
          reason
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          "company",
          companyId,
          batchId,
          "create",
          JSON.stringify({
            name,
            industry,
            address,
          }),
          "Initial company creation",
        ],
      );

      await client.query("COMMIT");

      return {
        id: companyId,
        versionId,
        version: 1,
        name,
        status: "active",
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  // ============================================
  // UPDATE: Create New Version
  // ============================================
  static async updateCompany(companyId, batchId, newData) {
    const {
      name,
      industry,
      address,
      lat,
      lng,
      website,
      email,
      phone,
      description,
      rawData,
      tags,
    } = newData;

    const client = await database.getClient();
    try {
      await client.query("BEGIN");

      // 1. Get current version info
      const currentRes = await client.query(
        `SELECT cv.* FROM company_version cv
         WHERE cv.company_id = $1
         ORDER BY cv.version DESC
         LIMIT 1`,
        [companyId],
      );

      if (currentRes.rows.length === 0) {
        throw new Error(`Company ${companyId} not found`);
      }

      const currentVersion = currentRes.rows[0];
      const newVersion = currentVersion.version + 1;

      // 2. Detect changes
      const changedFields = {};
      const oldValues = {};
      const newValues = {};

      const fieldsToCompare = [
        "name",
        "industry",
        "address",
        "lat",
        "lng",
        "website",
        "email",
        "phone",
        "description",
      ];

      fieldsToCompare.forEach((field) => {
        const oldVal = currentVersion[field];
        const newVal = newData[field];

        if (oldVal !== newVal) {
          changedFields[field] = {
            old: oldVal,
            new: newVal,
          };
          oldValues[field] = oldVal;
          newValues[field] = newVal;
        }
      });

      // If no changes, return current version
      if (Object.keys(changedFields).length === 0) {
        await client.query("COMMIT");
        return {
          id: companyId,
          versionId: currentVersion.id,
          version: currentVersion.version,
          isNew: false,
          message: "No changes detected",
        };
      }

      // 3. Create new version
      const newVersionRes = await client.query(
        `INSERT INTO company_version (
          company_id,
          version,
          batch_id,
          name,
          industry,
          address,
          lat,
          lng,
          website,
          email,
          phone,
          description,
          data_quality_score,
          raw_data,
          tags
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        RETURNING id`,
        [
          companyId,
          newVersion,
          batchId,
          name,
          industry,
          address,
          lat,
          lng,
          website,
          email,
          phone,
          description,
          1.0,
          rawData ? JSON.stringify(rawData) : null,
          tags || [],
        ],
      );

      const newVersionId = newVersionRes.rows[0].id;

      // 4. Update company current_version_id
      await client.query(
        `UPDATE company SET current_version_id = $1, updated_at = NOW() WHERE id = $2`,
        [newVersionId, companyId],
      );

      // 5. Create change record
      await client.query(
        `INSERT INTO company_change (
          company_id,
          from_version_id,
          to_version_id,
          batch_id,
          change_type,
          changed_fields,
          change_summary,
          confidence_score
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          companyId,
          currentVersion.id,
          newVersionId,
          batchId,
          "update",
          JSON.stringify(changedFields),
          `Updated ${Object.keys(changedFields).join(", ")}`,
          1.0,
        ],
      );

      // 6. Log change
      await client.query(
        `INSERT INTO change_log (
          entity_type,
          entity_id,
          batch_id,
          change_type,
          old_values,
          new_values,
          changed_fields,
          reason
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          "company",
          companyId,
          batchId,
          "update",
          JSON.stringify(oldValues),
          JSON.stringify(newValues),
          Object.keys(changedFields),
          `Updated from version ${currentVersion.version} to ${newVersion}`,
        ],
      );

      await client.query("COMMIT");

      return {
        id: companyId,
        versionId: newVersionId,
        version: newVersion,
        isNew: true,
        changedFields: Object.keys(changedFields),
        changeCount: Object.keys(changedFields).length,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  // ============================================
  // READ: Get Company by ID (current version)
  // ============================================
  static async getCompanyById(companyId) {
    const result = await database.query(
      `SELECT 
        c.id,
        c.project_id,
        c.status,
        c.is_duplicate,
        cv.version,
        cv.id as version_id,
        cv.name,
        cv.industry,
        cv.address,
        cv.lat,
        cv.lng,
        cv.website,
        cv.email,
        cv.phone,
        cv.description,
        cv.data_quality_score,
        cv.is_verified,
        cv.created_at as version_created_at,
        c.created_at as company_created_at
      FROM company c
      LEFT JOIN company_version cv ON c.current_version_id = cv.id
      WHERE c.id = $1`,
      [companyId],
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  }

  // ============================================
  // READ: Get Company Version History
  // ============================================
  static async getCompanyVersionHistory(companyId, limit = 10) {
    const result = await database.query(
      `SELECT 
        cv.version,
        cv.id,
        cv.name,
        cv.industry,
        cv.address,
        cv.created_at,
        cv.batch_id
      FROM company_version cv
      WHERE cv.company_id = $1
      ORDER BY cv.version DESC
      LIMIT $2`,
      [companyId, limit],
    );

    return result.rows;
  }

  // ============================================
  // READ: Get Company Changes
  // ============================================
  static async getCompanyChanges(companyId, limit = 20) {
    const result = await database.query(
      `SELECT 
        cc.id,
        cc.change_type,
        cc.changed_fields,
        cc.change_summary,
        cc.confidence_score,
        cc.batch_id,
        cc.from_version_id,
        cc.to_version_id,
        cc.created_at
      FROM company_change cc
      WHERE cc.company_id = $1
      ORDER BY cc.created_at DESC
      LIMIT $2`,
      [companyId, limit],
    );

    return result.rows;
  }

  // ============================================
  // READ: Get Specific Version
  // ============================================
  static async getCompanyVersion(companyId, version) {
    const result = await database.query(
      `SELECT * FROM company_version
       WHERE company_id = $1 AND version = $2`,
      [companyId, version],
    );

    return result.rows[0] || null;
  }

  // ============================================
  // DELETE: Archive Company (soft delete)
  // ============================================
  static async archiveCompany(companyId, batchId, reason) {
    const client = await database.getClient();
    try {
      await client.query("BEGIN");

      // Update status
      await client.query(
        `UPDATE company SET status = $1, updated_at = NOW() WHERE id = $2`,
        ["archived", companyId],
      );

      // Log change
      await client.query(
        `INSERT INTO change_log (
          entity_type,
          entity_id,
          batch_id,
          change_type,
          reason
        ) VALUES ($1, $2, $3, $4, $5)`,
        ["company", companyId, batchId, "archive", reason],
      );

      await client.query("COMMIT");
      return { success: true, companyId };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  // ============================================
  // SEARCH: Find Companies by Name (versioned)
  // ============================================
  static async searchCompaniesByName(projectId, searchTerm, limit = 10) {
    const result = await database.query(
      `SELECT DISTINCT
        c.id,
        c.project_id,
        c.status,
        cv.version,
        cv.name,
        cv.industry,
        cv.address,
        cv.created_at
      FROM company c
      LEFT JOIN company_version cv ON c.current_version_id = cv.id
      WHERE c.project_id = $1
        AND c.status = 'active'
        AND cv.name ILIKE $2
      ORDER BY cv.name
      LIMIT $3`,
      [projectId, `%${searchTerm}%`, limit],
    );

    return result.rows;
  }

  // ============================================
  // BATCH OPERATIONS: Create Multiple Versions
  // ============================================
  static async batchCreateCompanies(companiesData, batchId) {
    const client = await database.getClient();
    const results = [];

    try {
      await client.query("BEGIN");

      for (const companyData of companiesData) {
        const result = await this.createCompany({
          ...companyData,
          batchId,
        });
        results.push(result);
      }

      await client.query("COMMIT");
      return results;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  // ============================================
  // RELATIONSHIP: Add Person to Company
  // ============================================
  static async addPersonToCompanyVersion(
    companyVersionId,
    personVersionId,
    role,
    batchId,
  ) {
    const result = await database.query(
      `INSERT INTO company_person_version (
        company_version_id,
        person_version_id,
        role,
        batch_id
      ) VALUES ($1, $2, $3, $4)
      RETURNING id`,
      [companyVersionId, personVersionId, role, batchId],
    );

    return result.rows[0];
  }

  // ============================================
  // RELATIONSHIP: Get People at Company (version-aware)
  // ============================================
  static async getPeopleAtCompany(companyId) {
    const result = await database.query(
      `SELECT 
        pv.id as person_version_id,
        pv.person_id,
        pv.full_name,
        pv.title,
        pv.email,
        cpv.role,
        cpv.batch_id
      FROM company c
      JOIN company_person_version cpv ON c.current_version_id = cpv.company_version_id
      JOIN person_version pv ON cpv.person_version_id = pv.id
      WHERE c.id = $1`,
      [companyId],
    );

    return result.rows;
  }

  // ============================================
  // DEDUPLICATION: Merge Companies
  // ============================================
  static async mergeCompanies(primaryId, duplicateIds, batchId, reason) {
    const client = await database.getClient();
    try {
      await client.query("BEGIN");

      // Mark duplicates as merged
      await client.query(
        `UPDATE company 
         SET status = $1, merged_into_id = $2, updated_at = NOW()
         WHERE id = ANY($3)`,
        ["archived", primaryId, duplicateIds],
      );

      // Log in dedup_log
      await client.query(
        `INSERT INTO dedup_log (
          batch_id,
          entity_type,
          primary_id,
          merged_ids,
          match_reason
        ) VALUES ($1, $2, $3, $4, $5)`,
        [
          batchId,
          "company",
          primaryId,
          duplicateIds,
          JSON.stringify({ reason }),
        ],
      );

      await client.query("COMMIT");
      return { success: true, primaryId, mergedCount: duplicateIds.length };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  // ============================================
  // STATISTICS: Get Company Stats
  // ============================================
  static async getCompanyStats(projectId) {
    const result = await database.query(
      `SELECT 
        COUNT(DISTINCT c.id) as total_companies,
        COUNT(DISTINCT CASE WHEN c.status = 'active' THEN c.id END) as active_companies,
        COUNT(DISTINCT CASE WHEN c.is_duplicate THEN c.id END) as duplicate_companies,
        AVG(cv.data_quality_score) as avg_quality_score,
        COUNT(DISTINCT cv.batch_id) as batches_involved
      FROM company c
      LEFT JOIN company_version cv ON c.current_version_id = cv.id
      WHERE c.project_id = $1`,
      [projectId],
    );

    return result.rows[0];
  }
}

export default CompanyRepositoryV2;
