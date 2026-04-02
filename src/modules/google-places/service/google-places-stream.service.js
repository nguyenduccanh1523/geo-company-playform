/**
 * Google Places Stream Service
 * Business logic for streaming search with Real-time DB save
 */

import { GooglePlacesRepository } from "../repository/google-places.repository.js";
import GooglePlacesService from "../../../services/googlePlacesService.js";
import { query } from "../../../config/database.js";
import { createLogger } from "../../../shared/utils/logger.js";

const logger = createLogger("GooglePlacesStreamService");

// ============================================
// SESSION STORE (Redis)
// ============================================
export class SearchSession {
  constructor(sessionId, params) {
    this.sessionId = sessionId;
    this.params = params;
    this.status = "RUNNING"; // RUNNING, COMPLETED, FAILED
    this.startTime = Date.now();
    this.endTime = null;
    this.totalCompanies = 0;
    this.totalQueued = 0;
    this.totalSaved = 0;
    this.totalFailed = 0;
    this.error = null;
    this.searchName = params.name; // Store the search location name
    this.searchAddress = params.address; // Store the search location address
  }

  async save(redis) {
    // Save to Redis
    const key = `search:${this.sessionId}`;
    await redis.setex(key, 36000, JSON.stringify(this));
  }

  complete() {
    this.status = "COMPLETED";
    this.endTime = Date.now();
  }

  fail(error) {
    this.status = "FAILED";
    this.endTime = Date.now();
    this.error = error;
  }

  getDuration() {
    const end = this.endTime || Date.now();
    return end - this.startTime;
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

export class GooglePlacesStreamService {
  static async generateSessionId() {
    const crypto = await import("crypto");
    return crypto.randomBytes(16).toString("hex");
  }

  static calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c * 100) / 100; // Round to 2 decimals
  }

  /**
   * Save single company to DB
   */
  static async saveSingleCompanyToDB(company, lat, lng, searchRadius) {
    try {
      // Validate required fields
      if (
        !company.name ||
        !company.address ||
        company.lat === undefined ||
        company.lng === undefined
      ) {
        logger.warn(`⚠️  Skip ${company.name}: missing lat/lng/address`);
        return { success: false };
      }

      // ✅ Filter by search radius
      const distance = this.calculateDistance(
        lat,
        lng,
        company.lat,
        company.lng,
      );
      if (distance > searchRadius) {
        logger.warn(
          `❌ FILTERED OUT: "${company.name}" | Distance: ${distance.toFixed(2)}km > ${searchRadius}km | Coords: (${company.lat}, ${company.lng})`,
        );
        return { success: false, error: "OUT_OF_RADIUS" };
      }
      logger.debug(
        `✅ WITHIN RADIUS: "${company.name}" | Distance: ${distance.toFixed(2)}km ≤ ${searchRadius}km`,
      );

      // Check if company already exists by place_id
      if (company.place_id) {
        const existing = await query(
          `SELECT id FROM companies WHERE place_id = $1 LIMIT 1`,
          [company.place_id],
        );

        if (existing.rows.length > 0) {
          return { success: true }; // Already exists, skip
        }
      }

      // Insert company
      const insertQuery = `
        INSERT INTO companies 
        (name, industry, address, lat, lng, website, email, phone, 
         google_url, rating, reviews_count, business_status, place_id, 
         source_id, status, created_at, updated_at, raw_data)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), NOW(), $16)
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
        "google_places",
        "active",
        JSON.stringify(company.raw_data || {}),
      ]);

      const companyId = result.rows[0].id;
      logger.info(`✅ Saved: ${company.name} (ID: ${companyId})`);

      // Create hotel relationship
      const relResult = await this.createHotelRelationship(
        companyId,
        company,
        lat,
        lng,
        searchRadius,
      );

      return { success: true, companyId, hotelId: relResult?.hotelId };
    } catch (error) {
      logger.error(`❌ Failed to save ${company.name}: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Create or update hotel and hotel_company relationship
   */
  static async createHotelRelationship(
    companyId,
    company,
    lat,
    lng,
    searchRadius,
  ) {
    try {
      // Find existing hotel at search location
      const hotelQuery = `
        SELECT id FROM hotels 
        WHERE ABS(lat - $1) < 0.001 AND ABS(lng - $2) < 0.001
        LIMIT 1
      `;
      let hotelResult = await query(hotelQuery, [lat, lng]);

      let hotelId;
      if (hotelResult.rows.length > 0) {
        hotelId = hotelResult.rows[0].id;
        logger.info(`♻️  Reusing hotel: ${hotelId}`);
      } else {
        // Create new hotel for this search location
        const insertHotelQuery = `
          INSERT INTO hotels 
          (name, address, lat, lng, phone, email, website, status, 
           external_source, external_id, created_at, updated_at)
          VALUES ($1, $2, $3, $4, NULL, NULL, NULL, 'active', 
                  'search_origin', $5, NOW(), NOW())
          RETURNING id
        `;

        hotelResult = await query(insertHotelQuery, [
          `Search Location - ${searchRadius}km `,
          `Search origin point (lat: ${lat.toFixed(4)}, lng: ${lng.toFixed(4)})`,
          lat,
          lng,
          `search_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
        ]);

        hotelId = hotelResult.rows[0].id;
        logger.info(`🏨 Created search hotel: ${hotelId}`);
      }

      // Calculate distance
      const distance = this.calculateDistance(
        lat,
        lng,
        company.lat,
        company.lng,
      );

      // Check if relationship exists
      const relCheckQuery = `
        SELECT id FROM hotel_companies 
        WHERE hotel_id = $1 AND company_id = $2
      `;
      const relCheck = await query(relCheckQuery, [hotelId, companyId]);

      if (relCheck.rows.length === 0) {
        // Create hotel_company relationship
        const relInsertQuery = `
          INSERT INTO hotel_companies 
          (hotel_id, company_id, source_name, distance_km, 
           relationship_type, is_active, created_at, updated_at)
          VALUES ($1, $2, 'search_result', $3, 'nearby', true, NOW(), NOW())
        `;

        await query(relInsertQuery, [hotelId, companyId, distance]);
        logger.info(`🔗 Linked company to search hotel (${distance}km)`);
      }

      return { success: true, hotelId };
    } catch (error) {
      logger.error(`⚠️  Hotel relationship failed:`, error.message);
      return { success: false, error: error.message, hotelId: null };
    }
  }
}
