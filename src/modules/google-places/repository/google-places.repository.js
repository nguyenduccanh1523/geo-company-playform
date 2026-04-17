/**
 * Google Places Repository
 * Handle all database operations for companies and hotels
 */

import { query } from "../../../config/database.js";
import { createLogger } from "../../../shared/utils/logger.js";

const logger = createLogger("GooglePlacesRepository");

export class GooglePlacesRepository {
  /**
   * Save single company to DB
   */
  static async saveCompany(company, sourceId = "google_places") {
    try {
      const insertQuery = `
        INSERT INTO companies 
        (name, industry, address, lat, lng, website, email, phone, 
         google_url, rating, reviews_count, business_status, place_id, 
         source_id, status, created_at, updated_at, raw_data)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), NOW(), $16)
        ON CONFLICT (place_id) DO UPDATE SET updated_at = NOW()
        RETURNING id
      `;

      const result = await query(insertQuery, [
        company.name || "Unknown",
        company.industry || "BUSINESS",
        company.address || "Address not available",
        company.lat,
        company.lng,
        company.website || null,
        company.email || null,
        company.phone || null,
        company.google_url || null,
        company.rating || null,
        company.reviews_count || 0,
        company.business_status || "OPERATIONAL",
        company.place_id || null,
        sourceId,
        "active",
        JSON.stringify(company.raw_data || {}),
      ]);

      return result.rows[0].id;
    } catch (error) {
      logger.error(`Error saving company: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check if company already exists by place_id
   */
  static async checkCompanyExists(placeId) {
    try {
      const result = await query(
        "SELECT id FROM companies WHERE place_id = $1 LIMIT 1",
        [placeId],
      );
      return result.rows.length > 0;
    } catch (error) {
      logger.error(`Error checking company: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get or create hotel for search location
   */
  static async getOrCreateHotel(lat, lng, searchRadius) {
    try {
      const hotelQuery = `
        SELECT id FROM hotels 
        WHERE ABS(lat - $1) < 0.001 AND ABS(lng - $2) < 0.001
        LIMIT 1
      `;
      let hotelResult = await query(hotelQuery, [lat, lng]);

      if (hotelResult.rows.length > 0) {
        logger.debug(`♻️  Reusing hotel: ${hotelResult.rows[0].id}`);
        return hotelResult.rows[0].id;
      }

      // Create new hotel
      const insertHotelQuery = `
        INSERT INTO hotels 
        (name, address, lat, lng, phone, email, website, status, 
         external_source, external_id, created_at, updated_at)
        VALUES ($1, $2, $3, $4, NULL, NULL, NULL, 'active', 
                'search_origin', $5, NOW(), NOW())
        RETURNING id
      `;

      hotelResult = await query(insertHotelQuery, [
        `Search Location - ${searchRadius}km`,
        `Search origin point (lat: ${lat.toFixed(4)}, lng: ${lng.toFixed(4)})`,
        lat,
        lng,
        `search_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      ]);

      logger.info(`🏨 Created search hotel: ${hotelResult.rows[0].id}`);
      return hotelResult.rows[0].id;
    } catch (error) {
      logger.error(`Error getting/creating hotel: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create hotel-company relationship
   */
  static async createHotelCompanyLink(hotelId, companyId, distance) {
    try {
      const relCheckQuery = `
        SELECT id FROM hotel_companies 
        WHERE hotel_id = $1 AND company_id = $2
      `;
      const relCheck = await query(relCheckQuery, [hotelId, companyId]);

      if (relCheck.rows.length === 0) {
        const relInsertQuery = `
          INSERT INTO hotel_companies 
          (hotel_id, company_id, source_name, distance_km, 
           relationship_type, is_active, created_at, updated_at)
          VALUES ($1, $2, 'search_result', $3, 'nearby', true, NOW(), NOW())
        `;
        await query(relInsertQuery, [hotelId, companyId, distance]);
      }

      return true;
    } catch (error) {
      logger.error(`Error creating hotel-company link: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get companies by hotel with pagination
   */
  static async getCompaniesByHotel(hotelId, limit, offset, filters = {}) {
    try {
      let whereClause = "WHERE hc.hotel_id = $1 AND c.status = 'active'";
      let params = [hotelId];
      let paramIndex = 2;

      // Add filters
      if (filters.keyword) {
        whereClause += ` AND (c.name ILIKE $${paramIndex} OR c.address ILIKE $${paramIndex})`;
        params.push(`%${filters.keyword}%`);
        paramIndex++;
      }

      if (filters.maxDistance) {
        whereClause += ` AND hc.distance_km <= $${paramIndex}`;
        params.push(filters.maxDistance);
        paramIndex++;
      }

      if (filters.industry) {
        whereClause += ` AND c.industry = $${paramIndex}`;
        params.push(filters.industry);
        paramIndex++;
      }

      // Count total
      const countResult = await query(
        `SELECT COUNT(*) as total FROM companies c
         INNER JOIN hotel_companies hc ON c.id = hc.company_id
         ${whereClause}`,
        params,
      );

      const total = parseInt(countResult.rows[0].total);
      const totalPages = Math.ceil(total / limit);

      // Get companies
      const companiesResult = await query(
        `SELECT 
          c.id, c.place_id, c.name, c.address, c.lat, c.lng, c.phone, c.website,
          c.rating, c.reviews_count, c.industry, c.business_status,
          c.google_url, c.created_at, c.updated_at,
          hc.distance_km, hc.relationship_type
         FROM companies c
         INNER JOIN hotel_companies hc ON c.id = hc.company_id
         ${whereClause}
         ORDER BY hc.distance_km ASC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...params, limit, offset],
      );

      return {
        companies: companiesResult.rows,
        total,
        totalPages,
      };
    } catch (error) {
      logger.error(`Error getting companies by hotel: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get single company by ID
   */
  static async getCompanyById(companyId) {
    try {
      const result = await query("SELECT * FROM companies WHERE id = $1", [
        companyId,
      ]);
      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      logger.error(`Error getting company: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check existing companies for hotel
   */
  static async checkExistingCompanies(hotelId) {
    try {
      const result = await query(
        `SELECT COUNT(*) as total FROM hotel_companies WHERE hotel_id = $1`,
        [hotelId],
      );
      return parseInt(result.rows[0].total);
    } catch (error) {
      logger.error(`Error checking existing companies: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get search session info
   */
  static async getSessionCompanies(hotelId, limit, offset) {
    try {
      const companiesResult = await query(
        `SELECT c.id, c.name, c.address, c.lat, c.lng, c.phone, c.website, 
                c.rating, c.reviews_count, c.business_status, c.google_url, c.created_at,
                hc.distance_km
         FROM companies c
         INNER JOIN hotel_companies hc ON c.id = hc.company_id
         WHERE hc.hotel_id = $1
         ORDER BY c.created_at DESC
         LIMIT $2 OFFSET $3`,
        [hotelId, limit, offset],
      );

      const totalResult = await query(
        `SELECT COUNT(*) as total FROM hotel_companies WHERE hotel_id = $1`,
        [hotelId],
      );

      return {
        companies: companiesResult.rows,
        total: parseInt(totalResult.rows[0].total),
      };
    } catch (error) {
      logger.error(`Error getting session companies: ${error.message}`);
      throw error;
    }
  }
}
