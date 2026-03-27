/**
 * API Integration for Google Places Search
 *
 * Middleware/Routes để sử dụng trong Express.js hoặc MCP Server
 */

import GooglePlacesService from "../services/googlePlacesService.js";
import CompanyImportService from "../services/companyImportService.js";
import { pool } from "../config/database.js";
import { v4 as uuidv4 } from "uuid";

export class HotelSearchAPI {
  constructor(googleApiKey) {
    this.googlePlaces = new GooglePlacesService(googleApiKey);
    this.companyImport = new CompanyImportService(this.googlePlaces);
  }

  /**
   * Express.js Route Handler
   * POST /api/hotels/:hotelId/find-nearby-companies
   *
   * Request Body:
   * {
   *   "radius": 100,  // km (optional, default 100)
   *   "limit": 50     // max results (optional, default 100)
   * }
   *
   * Example:
   * curl -X POST http://localhost:3000/api/hotels/hotel-123/find-nearby-companies \
   *   -H "Content-Type: application/json" \
   *   -d '{"radius": 50, "limit": 100}'
   */
  async handleFindNearbyCompanies(req, res) {
    try {
      const { hotelId } = req.params;
      const { radius = 100, limit = 50 } = req.body;

      // 1. Lấy hotel info
      const hotelRes = await pool.query(
        `SELECT hv.id, hv.name, hv.lat, hv.lng
         FROM hotel_version hv
         WHERE hv.id = $1`,
        [hotelId],
      );

      if (hotelRes.rows.length === 0) {
        return res.status(404).json({ error: "Hotel not found" });
      }

      const hotel = hotelRes.rows[0];

      // 2. Tìm kiếm công ty
      const batchId = uuidv4();
      const result = await this.companyImport.importCompaniesAroundHotel(
        hotelId,
        {
          name: hotel.name,
          lat: hotel.lat,
          lng: hotel.lng,
        },
        radius,
        batchId,
      );

      // 3. Lấy kết quả
      const companies = await this.companyImport.getCompaniesNearHotel(
        hotelId,
        radius,
        limit,
      );

      res.json({
        success: true,
        hotel: {
          id: hotelId,
          name: hotel.name,
          lat: hotel.lat,
          lng: hotel.lng,
        },
        search: {
          radius_km: radius,
          total_found: result.total_found,
          imported: result.imported,
          linked: result.linked,
        },
        companies: companies,
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Express.js Route Handler
   * GET /api/hotels/:hotelId/nearby-companies
   *
   * Query params:
   * - radius: 100 (km)
   * - limit: 50
   * - sort: distance|name|industry
   * - industry: filter by industry
   *
   * Example:
   * GET http://localhost:3000/api/hotels/hotel-123/nearby-companies?radius=50&limit=100&sort=distance
   */
  async handleGetNearbyCompanies(req, res) {
    try {
      const { hotelId } = req.params;
      const {
        radius = 100,
        limit = 50,
        sort = "distance",
        industry,
      } = req.query;

      let query = `
        SELECT hcp.distance_km, hcp.bearing,
               c.id as company_id, c.google_place_id,
               cv.version, cv.name, cv.industry, cv.address,
               cv.lat, cv.lng, cv.phone, cv.website, cv.rating
        FROM hotel_company_proximity hcp
        JOIN company_version cv ON hcp.company_version_id = cv.id
        JOIN company c ON cv.company_id = c.id
        WHERE hcp.hotel_version_id = $1
        AND hcp.distance_km <= $2
      `;

      const params = [hotelId, radius];

      if (industry) {
        query += ` AND cv.industry = $${params.length + 1}`;
        params.push(industry);
      }

      // Sort options
      if (sort === "distance") {
        query += ` ORDER BY hcp.distance_km ASC`;
      } else if (sort === "name") {
        query += ` ORDER BY cv.name ASC`;
      } else if (sort === "industry") {
        query += ` ORDER BY cv.industry ASC, hcp.distance_km ASC`;
      }

      query += ` LIMIT $${params.length + 1}`;
      params.push(limit);

      const result = await pool.query(query, params);

      res.json({
        success: true,
        count: result.rows.length,
        companies: result.rows,
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Express.js Route Handler
   * GET /api/hotels/:hotelId/company-statistics
   *
   * Example:
   * GET http://localhost:3000/api/hotels/hotel-123/company-statistics
   */
  async handleGetStatistics(req, res) {
    try {
      const { hotelId } = req.params;
      const stats = await this.companyImport.getStatistics(hotelId);

      res.json({
        success: true,
        statistics: stats,
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Express.js Route Handler
   * GET /api/hotels/:hotelId/companies-by-industry
   *
   * Example:
   * GET http://localhost:3000/api/hotels/hotel-123/companies-by-industry
   */
  async handleGetCompaniesByIndustry(req, res) {
    try {
      const { hotelId } = req.params;
      const { radius = 100 } = req.query;

      const result = await pool.query(
        `SELECT cv.industry, COUNT(DISTINCT c.id) as count,
                ROUND(AVG(hcp.distance_km)::NUMERIC, 2) as avg_distance
         FROM hotel_company_proximity hcp
         JOIN company_version cv ON hcp.company_version_id = cv.id
         JOIN company c ON cv.company_id = c.id
         WHERE hcp.hotel_version_id = $1
         AND hcp.distance_km <= $2
         GROUP BY cv.industry
         ORDER BY count DESC`,
        [hotelId, radius],
      );

      res.json({
        success: true,
        by_industry: result.rows,
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Express.js Integration Example
   *
   * Usage in Express app:
   *
   * import express from 'express';
   * import { HotelSearchAPI } from './api/hotelSearchAPI.js';
   *
   * const app = express();
   * app.use(express.json());
   *
   * const hotelAPI = new HotelSearchAPI(process.env.GOOGLE_PLACES_API_KEY);
   *
   * // Routes
   * app.post('/api/hotels/:hotelId/find-nearby-companies',
   *   (req, res) => hotelAPI.handleFindNearbyCompanies(req, res)
   * );
   *
   * app.get('/api/hotels/:hotelId/nearby-companies',
   *   (req, res) => hotelAPI.handleGetNearbyCompanies(req, res)
   * );
   *
   * app.get('/api/hotels/:hotelId/company-statistics',
   *   (req, res) => hotelAPI.handleGetStatistics(req, res)
   * );
   *
   * app.get('/api/hotels/:hotelId/companies-by-industry',
   *   (req, res) => hotelAPI.handleGetCompaniesByIndustry(req, res)
   * );
   *
   * app.listen(3000, () => console.log('Server running on port 3000'));
   */
}

export default HotelSearchAPI;
