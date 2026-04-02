/**
 * Google Places Stream Controller
 * Handle HTTP requests for streaming search with SSE + Bull Queue
 */

import {
  SearchSession,
  GooglePlacesStreamService,
} from "../service/google-places-stream.service.js";
import GooglePlacesService from "../../../services/googlePlacesService.js";
import { query } from "../../../config/database.js";
import { createLogger } from "../../../shared/utils/logger.js";
import {
  sendSuccess,
  sendError,
  sendValidationError,
  sendNotFound,
  sendPaginatedSuccess,
} from "../../../shared/utils/response.js";
import redis from "../../../config/redis.js";
import { randomBytes } from "crypto";

const logger = createLogger("GooglePlacesStreamController");

export class GooglePlacesStreamController {
  /**
   * POST /search-companies-stream
   * Progressive search + SSE stream + Bull Queue
   *
   * Body Parameters:
   * - lat, lng: Required coordinates
   * - radius_km: Search radius (optional, default 5)
   * - grid_radius_km: Grid size for multi-point search (optional, auto-calculated)
   * - keyword: Search keyword (optional, default "company")
   * - name: Hotel/location name (optional)
   * - address: Hotel/location address (optional, auto-generated if not provided)
   * - maxResults: Max results (optional, default 100)
   * - forceRefresh: Skip cache (optional, default false)
   */
  static async searchCompaniesStream(req, res) {
    try {
      const {
        lat,
        lng,
        radius = null,
        radius_km = null,
        grid_radius_km = null,
        keyword = "company",
        maxResults = 100,
        forceRefresh = false,
        name = null,
        address = null,
      } = req.body;

      if (!lat || !lng) {
        return res.status(400).json({ error: "lat and lng required" });
      }

      // ✅ FIX: Accept both "radius" and "radius_km" parameters
      const radiusInput = radius_km ?? radius ?? 5;
      const searchRadius = parseInt(radiusInput) || 5;

      // ✅ FIX: Calculate grid_radius_km based on search radius
      let gridRadiusKm;
      if (grid_radius_km !== undefined && grid_radius_km !== null) {
        gridRadiusKm = Math.min(Math.max(1, parseInt(grid_radius_km)), 50);
      } else {
        if (searchRadius > 80) {
          gridRadiusKm = 50;
        } else if (searchRadius >= 40) {
          gridRadiusKm = 25;
        } else {
          gridRadiusKm = 10;
        }
      }
      const gridRadiusMeters = gridRadiusKm * 1000; // Convert to meters for API

      logger.info(
        `✅ Input received: radius=${radius}, radius_km=${radius_km}, grid_radius_km=${grid_radius_km}`,
      );

      // Calculate how many grids will be created
      const searchRadiusKm = searchRadius;
      const gridsNeeded =
        searchRadiusKm > gridRadiusKm
          ? Math.ceil(
              (searchRadiusKm / gridRadiusKm) * (searchRadiusKm / gridRadiusKm),
            )
          : 1;

      // Create session
      const sessionId = randomBytes(16).toString("hex");
      const session = new SearchSession(sessionId, {
        lat,
        lng,
        radius: searchRadius,
        gridRadius: gridRadiusKm,
        gridsNeeded,
        keyword,
        name,
        address,
      });
      await session.save(redis);

      // ✅ Create hotel immediately
      let hotelId;
      let existingCompaniesCount = 0;
      try {
        const hotelQuery = `
          SELECT id FROM hotels 
          WHERE ABS(lat - $1) < 0.001 AND ABS(lng - $2) < 0.001
          LIMIT 1
        `;
        const hotelResult = await query(hotelQuery, [lat, lng]);

        if (hotelResult.rows.length > 0) {
          hotelId = hotelResult.rows[0].id;
          logger.info(`♻️  Reusing hotel: ${hotelId}`);

          const companiesCheckQuery = `
            SELECT COUNT(*) as total FROM hotel_companies 
            WHERE hotel_id = $1
          `;
          const companiesCheck = await query(companiesCheckQuery, [hotelId]);
          existingCompaniesCount = parseInt(companiesCheck.rows[0].total);

          if (existingCompaniesCount > 0) {
            logger.info(
              `💾 CACHE HIT: Hotel ${hotelId} has ${existingCompaniesCount} companies in DB`,
            );
          }
        } else {
          // Create new hotel
          const hotelName = name || `Search Location - ${searchRadius}km`;
          const hotelAddress =
            address ||
            `Search origin point (lat: ${lat.toFixed(4)}, lng: ${lng.toFixed(4)})`;
          const insertHotelQuery = `
            INSERT INTO hotels 
            (name, address, lat, lng, phone, email, website, status, 
             external_source, external_id, created_at, updated_at)
            VALUES ($1, $2, $3, $4, NULL, NULL, NULL, 'active', 
                    'search_origin', $5, NOW(), NOW())
            RETURNING id
          `;

          const newHotelResult = await query(insertHotelQuery, [
            hotelName,
            hotelAddress,
            lat,
            lng,
            `search_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
          ]);

          hotelId = newHotelResult.rows[0].id;
          logger.info(`🏨 Created search hotel: ${hotelId}`);
        }

        // Set hotelId in session immediately
        session.hotelId = hotelId;
        await session.save(redis);
        logger.info(`🏨 Session linked to hotel: ${hotelId}`);
      } catch (error) {
        logger.error(`⚠️  Failed to create/find hotel: ${error.message}`);
      }

      logger.info(`
╔══════════════════════════════════════════════════════════════╗
║                  🔍 SEARCH SESSION STARTED                   ║
╚══════════════════════════════════════════════════════════════╝
  📍 Location: (${lat}, ${lng})
  🎯 Search Radius: ${searchRadius}km
  📊 Grid Configuration:
     ├─ Grid Size: ${gridRadiusKm}km
     ├─ Grids Needed: ${gridsNeeded}
  🔑 Keyword: "${keyword}"
  🆔 Session ID: ${sessionId}
  🏨 Hotel ID: ${hotelId}
  💾 Existing Data: ${existingCompaniesCount} companies
╔══════════════════════════════════════════════════════════════╝
      `);

      // ✅ IF DATA ALREADY EXISTS IN DB -> RETURN CACHED DATA
      if (existingCompaniesCount > 0 && !forceRefresh) {
        logger.warn(`
╔══════════════════════════════════════════════════════════════╗
║           💾 RETURNING CACHED DATA (FROM DATABASE)           ║
║                   No API call needed! 💰                      ║
╚══════════════════════════════════════════════════════════════╝
  📍 Location: (${lat}, ${lng}) - Previously searched
  🏢 Companies: ${existingCompaniesCount} in DB
  ♻️  Source: Database cache (saved cost)
  🔑 Keyword searched: "${keyword}"
  💡 Tip: Use "forceRefresh": true to search again
        `);

        session.status = "COMPLETED_FROM_CACHE";
        session.totalCompanies = existingCompaniesCount;
        session.totalSaved = existingCompaniesCount;
        session.endTime = Date.now();
        await session.save(redis);

        return sendSuccess(
          res,
          {
            sessionId,
            hotelId,
            source: "CACHE",
            companies_available: existingCompaniesCount,
            cached_data: true,
            force_refresh_hint:
              'Use "forceRefresh": true in request body to search again',
            retrieval_method:
              "Use GET /api/search-session/:sessionId to fetch companies",
          },
          `Data loaded from cache - ${existingCompaniesCount} companies found in previous search`,
          200,
        );
      }

      // ✅ If forceRefresh = true, log it
      if (forceRefresh && existingCompaniesCount > 0) {
        logger.warn(`
╔══════════════════════════════════════════════════════════════╗
║        🔄 FORCE REFRESH ENABLED - SKIPPING CACHE             ║
║  Will search Google Places API again (${existingCompaniesCount} companies exist)  ║
╚══════════════════════════════════════════════════════════════╝
        `);
      }

      // ✅ RETURN SESSION ID IMMEDIATELY (not waiting for search)
      sendSuccess(
        res,
        {
          sessionId,
          hotelId,
          source: "NEW_SEARCH",
          cache_status:
            existingCompaniesCount > 0
              ? `${existingCompaniesCount} companies already exist but forcing refresh`
              : "No cached data",
          retrieval_method:
            "Use GET /api/search-session/:sessionId to fetch companies",
        },
        "Search started in background. Poll /api/search-session/:sessionId for progress.",
        200,
      );

      // 🔄 RUN SEARCH IN BACKGROUND (non-blocking)
      (async () => {
        try {
          const googlePlaces = new GooglePlacesService(
            process.env.GOOGLE_PLACES_API_KEY,
          );

          let totalProcessed = 0;
          let totalSavedToDb = 0;
          let gridPointsProcessed = 0;

          const onGridComplete = async (gridIndex, gridResults, totalGrids) => {
            gridPointsProcessed++;
            logger.info(
              `✅ Grid [${gridPointsProcessed}/${totalGrids}] complete: ${gridResults.length} companies found`,
            );

            // Process and save each company from this grid point immediately
            for (const company of gridResults) {
              try {
                const details = await googlePlaces.getPlaceDetails(
                  company.place_id,
                );
                const detailLat = details?.geometry?.location?.lat;
                const detailLng = details?.geometry?.location?.lng;
                let finalLat =
                  detailLat || company.lat || company.geometry?.location?.lat;
                let finalLng =
                  detailLng || company.lng || company.geometry?.location?.lng;

                if (finalLat === undefined || finalLng === undefined) {
                  logger.warn(`⚠️  Skip ${company.name}: no coordinates`);
                  continue;
                }

                const enrichedCompany = {
                  name: company.name,
                  place_id: company.place_id,
                  lat: finalLat,
                  lng: finalLng,
                  address:
                    details?.formatted_address || company.vicinity || "Unknown",
                  phone: details?.formatted_phone_number || null,
                  website: details?.website || null,
                  rating: details?.rating,
                  reviews_count: details?.user_ratings_total || 0,
                  business_status: details?.business_status || "OPERATIONAL",
                  google_url: details?.url,
                  industry: company.types?.[0]?.toUpperCase() || "BUSINESS",
                };

                // Save to DB immediately
                const saveResult =
                  await GooglePlacesStreamService.saveSingleCompanyToDB(
                    enrichedCompany,
                    lat,
                    lng,
                    searchRadius,
                  );

                if (saveResult?.success) {
                  totalSavedToDb++;
                }
              } catch (err) {
                logger.warn(
                  `⚠️  Failed to process ${company.name}: ${err.message}`,
                );
              }

              totalProcessed++;
            }

            // Send grid progress via session
            session.totalCompanies = totalProcessed;
            session.totalSaved = totalSavedToDb;
            await session.save(redis);

            logger.debug(
              `📊 Grid progress - Processed: ${totalProcessed}, Saved: ${totalSavedToDb}`,
            );
          };

          // Step 1: Search with callback
          logger.info(`🔎 Searching Google Places with real-time streaming...`);
          await googlePlaces.searchNearbyBusinessesWithCallback(
            keyword || "company",
            lat,
            lng,
            ["company", "establishment", "point_of_interest"],
            searchRadius * 1000,
            gridRadiusMeters,
            onGridComplete,
          );

          // All grids processed
          session.complete();
          await session.save(redis);

          logger.info(`
╔══════════════════════════════════════════════════════════════╗
║                  ✅ SEARCH COMPLETED                         ║
╚══════════════════════════════════════════════════════════════╝
  🏢 Total Found: ${totalProcessed} companies
  ✅ Saved to DB: ${totalSavedToDb}
  🔄 Processed Grids: ${gridPointsProcessed}
  ⏱️  Duration: ${(session.getDuration() / 1000).toFixed(1)}s
  🆔 Session: ${sessionId}
╔══════════════════════════════════════════════════════════════╝
          `);
        } catch (error) {
          logger.error("❌ Background search error:", error);
          session.fail(error.message);
          await session.save(redis);
        }
      })();
    } catch (error) {
      logger.error("❌ POST error:", error);
      return sendError(res, error.message);
    }
  }

  /**
   * GET /search-session/:sessionId
   * Query companies saved from this session
   */
  static async getSearchSession(req, res) {
    try {
      const { sessionId } = req.params;
      const { limit = 20, page = 1 } = req.query;

      logger.info(`
╔════════════════════════════════════════════════════════════╗
║  🔹 GET /search-session/:sessionId REQUEST                ║
╚════════════════════════════════════════════════════════════╝
  📌 Session ID: ${sessionId}
  📊 Query Params:
     ├─ page: ${page}
     ├─ limit: ${limit}
      `);

      // Get session from Redis
      const sessionData = await redis.get(`search:${sessionId}`);
      if (!sessionData) {
        logger.warn(`❌ Session not found: ${sessionId}`);
        return sendNotFound(res, "Session not found or expired (TTL: 1 hour)");
      }

      const session = JSON.parse(sessionData);
      logger.info(`✅ Session found - Status: ${session.status}`);

      const limit_num = Math.min(Math.max(1, parseInt(limit) || 20), 500);
      const page_num = Math.max(1, parseInt(page) || 1);
      const offset_num = (page_num - 1) * limit_num;

      const hotelId = session.hotelId;

      if (!hotelId) {
        return sendValidationError(
          res,
          "Session has no hotel_id. Search may not have completed successfully.",
        );
      }

      // Query only companies for this hotel
      const companiesResult = await query(
        `SELECT c.id, c.name, c.address, c.lat, c.lng, c.phone, c.website, 
                c.rating, c.reviews_count, c.business_status, c.google_url, c.created_at,
                hc.distance_km
         FROM companies c
         INNER JOIN hotel_companies hc ON c.id = hc.company_id
         WHERE hc.hotel_id = $1
         ORDER BY c.created_at DESC
         LIMIT $2 OFFSET $3`,
        [hotelId, limit_num, offset_num],
      );

      const totalResult = await query(
        `SELECT COUNT(*) as total FROM hotel_companies WHERE hotel_id = $1`,
        [hotelId],
      );

      const companies = companiesResult.rows;
      const total = parseInt(totalResult.rows[0].total);
      const totalPages = Math.ceil(total / limit_num);

      logger.info(
        `✅ Found ${total} total | Returning ${companies.length} | Page: ${page_num}/${totalPages}`,
      );

      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return sendPaginatedSuccess(
        res,
        companies,
        {
          page: page_num,
          pageSize: limit_num,
          total,
          totalPages,
        },
        "Companies retrieved successfully",
      );
    } catch (error) {
      logger.error(`❌ GET /search-session ERROR: ${error.message}`);
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return sendError(res, error.message);
    }
  }

  /**
   * GET /search-session/:sessionId/status
   * Lightweight status only
   */
  static async getSearchStatus(req, res) {
    try {
      const { sessionId } = req.params;

      logger.debug(`🔹 GET /search-session/:sessionId/status - ${sessionId}`);

      const sessionData = await redis.get(`search:${sessionId}`);
      if (!sessionData) {
        logger.warn(`❌ Status request - Session not found: ${sessionId}`);
        return sendNotFound(res, "Session not found");
      }

      const session = JSON.parse(sessionData);

      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return sendSuccess(
        res,
        {
          sessionId,
          hotelId: session.hotelId,
          status: session.status,
          startTime: session.startTime,
          endTime: session.endTime,
          duration: session.getDuration?.() || Date.now() - session.startTime,
          totalCompanies: session.totalCompanies,
          totalQueued: session.totalQueued,
          totalSaved: session.totalSaved,
          totalFailed: session.totalFailed,
        },
        "Session status retrieved successfully",
      );
    } catch (error) {
      logger.error(`❌ GET /status error: ${error.message}`);
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return sendError(res, error.message);
    }
  }

  /**
   * GET /companies-by-hotel/:hotel_id
   * Query companies by hotel (independent of session)
   */
  static async getCompaniesByHotel(req, res) {
    try {
      const { hotel_id } = req.params;
      const {
        keyword = "",
        sort = "distance",
        order = "ASC",
        limit = 20,
        page = 1,
        maxDistance = null,
      } = req.query;

      // Validate parameters
      const pageLimit = Math.min(Math.max(1, parseInt(limit) || 20), 500);
      const pageNum = Math.max(1, parseInt(page) || 1);
      const pageOffset = (pageNum - 1) * pageLimit;
      const maxDistanceVal =
        maxDistance !== null ? parseFloat(maxDistance) : null;

      logger.debug(`
📊 GET /companies-by-hotel
├─ Hotel ID: ${hotel_id}
├─ Filters:
│  ├─ maxDistance: ${maxDistance || "none"}
│  ├─ keyword: ${keyword || "none"}
│  ├─ sort: ${sort}
│  ├─ order: ${order}
├─ Pagination:
│  ├─ page: ${pageNum}
│  ├─ limit: ${pageLimit}
      `);

      // Build WHERE clause
      let whereClause = "WHERE hc.hotel_id = $1 AND c.status = 'active'";
      let params = [hotel_id];
      let paramIndex = 2;

      if (maxDistanceVal !== null && maxDistanceVal > 0) {
        whereClause += ` AND hc.distance_km <= $${paramIndex}`;
        params.push(maxDistanceVal);
        paramIndex++;
      }

      if (keyword.trim()) {
        whereClause += ` AND (c.name ILIKE $${paramIndex} OR c.address ILIKE $${paramIndex})`;
        params.push(`%${keyword}%`);
        paramIndex++;
      }

      // Build ORDER BY
      let orderClause = "ORDER BY hc.distance_km ASC";
      if (sort === "rating") {
        orderClause = `ORDER BY c.rating ${order === "DESC" ? "DESC" : "ASC"} NULLS LAST, c.name ASC`;
      } else if (sort === "name") {
        orderClause = `ORDER BY c.name ${order === "DESC" ? "DESC" : "ASC"}`;
      } else if (sort === "created_at") {
        orderClause = `ORDER BY c.created_at ${order === "DESC" ? "DESC" : "ASC"}`;
      }

      // Count total
      const countResult = await query(
        `SELECT COUNT(*) as total FROM companies c
         INNER JOIN hotel_companies hc ON c.id = hc.company_id
         ${whereClause}`,
        params,
      );
      const total = parseInt(countResult.rows[0].total);
      const totalPages = Math.ceil(total / pageLimit);

      if (pageNum > totalPages && totalPages > 0) {
        return sendNotFound(
          res,
          `Page ${pageNum} not found. Total pages: ${totalPages}`,
        );
      }

      // Query companies
      const companiesResult = await query(
        `SELECT 
          c.id, c.place_id, c.name, c.address, c.lat, c.lng, c.phone, c.website,
          c.rating, c.reviews_count, c.industry, c.business_status,
          c.google_url, c.created_at, c.updated_at,
          hc.distance_km, hc.relationship_type
         FROM companies c
         INNER JOIN hotel_companies hc ON c.id = hc.company_id
         ${whereClause}
         ${orderClause}
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...params, pageLimit, pageOffset],
      );

      logger.info(
        `📋 Results: Found ${total} total | Returning ${companiesResult.rows.length} | Page: ${pageNum}/${totalPages}`,
      );

      return sendPaginatedSuccess(
        res,
        companiesResult.rows,
        {
          page: pageNum,
          pageSize: pageLimit,
          total,
          totalPages,
        },
        "Companies retrieved successfully",
      );
    } catch (error) {
      logger.error("GET /companies-by-hotel error:", error);
      return sendError(res, error.message);
    }
  }
}
