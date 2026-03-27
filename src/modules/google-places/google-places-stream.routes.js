/**
 * GOOGLE PLACES STREAMING ROUTES (SSE + Bull Queue)
 *
 * Progressive search with background batch processing:
 * - POST /api/search-companies-stream → SSE stream kết quả
 * - GET /api/search-session/:sessionId → Query companies from DB
 * - GET /api/search-session/:sessionId/status → Progress status
 *
 * Flow:
 * 1. Search Google Places API (15s)
 * 2. For each batch: Enrich → Queue to Bull → Stream progress
 * 3. Bull workers: Process queue in parallel → Real-time DB save
 * 4. User polls GET to see results (starting at 20s)
 * 5. Background: Bull workers save remaining batches
 */

import express from "express";
import GooglePlacesService from "../../services/googlePlacesService.js";
import { query } from "../../config/database.js";
import { createLogger } from "../../shared/utils/logger.js";
import crypto from "crypto";
import redis from "../../config/redis.js";

const router = express.Router();
const logger = createLogger("GooglePlacesStream");

// ============================================
// SESSION STORE (Redis)
// ============================================

class SearchSession {
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
  }

  async save() {
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

function generateSessionId() {
  return crypto.randomBytes(16).toString("hex");
}

// ============================================
// SAVE SINGLE COMPANY (Optimized)
// Save immediately after enrichment, no batch wait
// ============================================

async function saveSingleCompanyToDB(company, lat, lng, searchRadius) {
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

    // ✅ NEW: Filter by search radius (Fix: companies beyond 5km were being saved)
    const distance = calculateDistance(lat, lng, company.lat, company.lng);
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

    // Create hotel relationship and get hotel_id
    const relResult = await createHotelRelationship(
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

async function saveBatchToDB(
  batch,
  sessionId,
  batchNumber,
  lat,
  lng,
  searchRadius,
) {
  let saved = 0;
  let failed = 0;
  const errors = [];

  try {
    logger.info(
      `📀 Saving batch ${batchNumber} with ${batch.length} companies...`,
    );

    // Log first company for debugging
    if (batch.length > 0) {
      const first = batch[0];
      logger.debug(
        `First company: ${first.name} (lat=${first.lat}, lng=${first.lng}, address=${first.address})`,
      );
    } else {
      logger.warn(`⚠️  Batch ${batchNumber} is empty (all companies skipped?)`);
      return { saved: 0, failed: 0, errors: [] };
    }

    // Step 1: Save companies to DB
    for (const company of batch) {
      try {
        // Validate required fields
        if (
          !company.name ||
          !company.address ||
          company.lat === undefined ||
          company.lng === undefined
        ) {
          const errMsg = `Missing required fields: name=${company.name}, address=${company.address}, lat=${company.lat}, lng=${company.lng}`;
          logger.error(`❌ Failed to save ${company.name}: "${errMsg}"`);
          errors.push({ name: company.name, error: errMsg });
          failed++;
          continue;
        }

        // ✅ NEW: Filter by search radius (Fix: companies beyond searchRadius were being saved)
        const distance = calculateDistance(lat, lng, company.lat, company.lng);
        if (distance > searchRadius) {
          logger.warn(
            `❌ FILTERED OUT: "${company.name}" | Distance: ${distance.toFixed(2)}km > ${searchRadius}km`,
          );
          failed++;
          continue;
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
            logger.info(
              `⏭️  Duplicate: ${company.name} (place_id: ${company.place_id})`,
            );
            saved++;
            continue;
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
        saved++;

        // Create hotel relationship after company save
        const relResult = await createHotelRelationship(
          companyId,
          company,
          lat,
          lng,
          searchRadius,
        );

        // ✅ NEW: Return hotelId with batch result
        if (relResult?.hotelId) {
          return { companyId, hotelId: relResult.hotelId };
        }
      } catch (error) {
        logger.error(`❌ Failed to save ${company.name}:`, error.message);
        failed++;
        errors.push({
          name: company.name,
          place_id: company.place_id,
          error: error.message,
        });
      }
    }

    logger.info(
      `✅ Batch ${batchNumber} complete - Saved: ${saved}, Failed: ${failed}`,
    );
    return { saved, failed, errors };
  } catch (error) {
    logger.error(`❌ Fatal batch error:`, error.message);
    return { saved: 0, failed: batch.length, errors };
  }
}

// Create or update hotel and hotel_company relationship
async function createHotelRelationship(
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
    const distance = calculateDistance(lat, lng, company.lat, company.lng);

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

    // ✅ NEW: Return hotelId so session can track it
    return { success: true, hotelId };
  } catch (error) {
    logger.error(`⚠️  Hotel relationship failed:`, error.message);
    // Continue - don't block company save
    return { success: false, error: error.message, hotelId: null };
  }
}

// Helper function to calculate distance between two coordinates (km)
function calculateDistance(lat1, lon1, lat2, lon2) {
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

// ============================================
// POST /search-companies-stream
// Progressive search + SSE stream + Bull Queue
// ============================================

router.post("/search-companies-stream", async (req, res) => {
  try {
    const {
      lat,
      lng,
      radius = null,
      radius_km = null,
      grid_radius_km = null,
      keyword = "company",
      maxResults = 100,
      forceRefresh = false, // ✅ NEW: Force search even if cache exists
    } = req.body;

    if (!lat || !lng) {
      return res.status(400).json({ error: "lat and lng required" });
    }

    // ✅ FIX: Accept both "radius" and "radius_km" parameters
    const radiusInput = radius_km ?? radius ?? 5; // Nullish coalescing - distinguish 0 from null
    const searchRadius = parseInt(radiusInput) || 5;

    // ✅ FIX: Calculate grid_radius_km based on search radius
    // If grid_radius_km is explicitly provided, use that value
    // Otherwise, calculate automatically:
    // - radius > 80km → grid = 50
    // - 40km ≤ radius ≤ 80km → grid = 25
    // - radius < 40km → grid = 10
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
    const sessionId = generateSessionId();
    const session = new SearchSession(sessionId, {
      lat,
      lng,
      radius: searchRadius,
      gridRadius: gridRadiusKm,
      gridsNeeded,
      keyword,
    });
    await session.save();

    // ✅ NEW: Create hotel **immediately** (not waiting for companies to save)
    // This ensures hotelId is available for GET /search-session calls during search
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

        // ✅ NEW: Check if this location already has companies in DB
        const companiesCheckQuery = `
          SELECT COUNT(*) as total FROM hotel_companies 
          WHERE hotel_id = $1
        `;
        const companiesCheck = await query(companiesCheckQuery, [hotelId]);
        existingCompaniesCount = parseInt(companiesCheck.rows[0].total);

        if (existingCompaniesCount > 0) {
          logger.info(
            `💾 CACHE HIT: Hotel ${hotelId} has ${existingCompaniesCount} companies in DB - returning cached data`,
          );
        }
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

        const newHotelResult = await query(insertHotelQuery, [
          `Search Location - ${searchRadius}km `,
          `Search origin point (lat: ${lat.toFixed(4)}, lng: ${lng.toFixed(4)})`,
          lat,
          lng,
          `search_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
        ]);

        hotelId = newHotelResult.rows[0].id;
        logger.info(`🏨 Created search hotel: ${hotelId}`);
      }

      // ✅ Set hotelId in session immediately
      session.hotelId = hotelId;
      await session.save();
      logger.info(`🏨 Session linked to hotel: ${hotelId}`);
    } catch (error) {
      logger.error(`⚠️  Failed to create/find hotel: ${error.message}`);
      // Continue anyway with hotelId = null
    }

    // ✅ LOG: Show input parameters with grid info
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

    // ✅ NEW: IF DATA ALREADY EXISTS IN DB -> RETURN CACHED DATA
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

      // Mark session as completed immediately
      session.status = "COMPLETED_FROM_CACHE";
      session.totalCompanies = existingCompaniesCount;
      session.totalSaved = existingCompaniesCount;
      session.endTime = Date.now();
      await session.save();

      // ✅ RETURN CACHED DATA IMMEDIATELY
      return res.json({
        success: true,
        sessionId,
        hotelId,
        source: "CACHE",
        message: `Data loaded from cache - ${existingCompaniesCount} companies found in previous search`,
        companies_available: existingCompaniesCount,
        cached_data: true,
        force_refresh_hint:
          'Use "forceRefresh": true in request body to search again',
        retrieval_method:
          "Use GET /api/search-session/:sessionId to fetch companies",
      });
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
    res.json({
      success: true,
      sessionId,
      hotelId,
      source: "NEW_SEARCH",
      message:
        "Search started in background. Poll /api/search-session/:sessionId for progress.",
      cache_status:
        existingCompaniesCount > 0
          ? `${existingCompaniesCount} companies already exist but forcing refresh`
          : "No cached data",
    });

    // 🔄 RUN SEARCH IN BACKGROUND (non-blocking)
    // Don't await this - let it run independently
    (async () => {
      try {
        const googlePlaces = new GooglePlacesService(
          process.env.GOOGLE_PLACES_API_KEY,
        );

        // ✅ CALLBACK: Process each grid point as it completes
        // This saves data to DB immediately instead of waiting for all grids
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
              // ✅ Check if place_id already exists in DB to avoid duplicate
              if (company.place_id) {
                const existingCheck = await query(
                  `SELECT id FROM companies WHERE place_id = $1 LIMIT 1`,
                  [company.place_id],
                );

                if (existingCheck.rows.length > 0) {
                  logger.debug(
                    `⏭️  Duplicate: ${company.name} (place_id: ${company.place_id})`,
                  );
                  continue; // Skip duplicate
                }
              }

              // Enrich with contact details
              const details = await googlePlaces.getPlaceDetails(
                company.place_id,
              );

              const detailLat = details?.lat;
              const detailLng = details?.lng;
              let finalLat =
                detailLat || company.lat || company.geometry?.location?.lat;
              let finalLng =
                detailLng || company.lng || company.geometry?.location?.lng;

              if (finalLat === undefined || finalLng === undefined) {
                logger.debug(`⚠️  Skipping: ${company.name} - no coordinates`);
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
              const saveResult = await saveSingleCompanyToDB(
                enrichedCompany,
                lat,
                lng,
                searchRadius,
              );

              if (saveResult?.success) {
                totalSavedToDb++;
                logger.info(
                  `✅ Saved: ${enrichedCompany.name} (Grid ${gridPointsProcessed}/${totalGrids})`,
                );
              }
            } catch (err) {
              logger.warn(
                `⚠️  Failed to process ${company.name}: ${err.message}`,
              );
            }

            totalProcessed++;
          }

          // Send grid progress via SSE
          session.totalCompanies = totalProcessed;
          session.totalSaved = totalSavedToDb;
          await session.save();

          // 📤 Log progress (no res.write needed since response already sent)
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
          searchRadius * 1000, // radiusMeters
          gridRadiusMeters, // gridRadiusMeters
          onGridComplete, // Callback to process each grid
        );

        // All grids processed
        session.complete();
        await session.save();

        // ✅ LOG: Search completion
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
        await session.save();
      }
    })();
  } catch (error) {
    logger.error("❌ POST error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// GET /search-session/:sessionId
// Query companies saved from this session
// ============================================

router.get("/search-session/:sessionId", async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    logger.info(`
╔════════════════════════════════════════════════════════════╗
║  🔹 GET /search-session/:sessionId REQUEST                ║
╚════════════════════════════════════════════════════════════╝
  📌 Session ID: ${sessionId}
  📊 Query Params:
     ├─ limit: ${limit}
     ├─ offset: ${offset}
  🌐 Headers:
     ├─ Origin: ${req.get("origin")}
     ├─ User-Agent: ${req.get("user-agent")}
    `);

    // Get session from Redis
    const sessionData = await redis.get(`search:${sessionId}`);
    if (!sessionData) {
      logger.warn(`❌ Session not found: ${sessionId}`);
      return res.status(404).json({
        success: false,
        error: "Session not found",
        sessionId,
        tip: "Session may have expired (TTL: 1 hour)",
      });
    }

    const session = JSON.parse(sessionData);
    logger.info(`✅ Session found - Status: ${session.status}`);

    // Query companies from DB (those saved in this search session)
    // ✅ FIXED: Query companies linked to this search session's hotel
    const limit_num = Math.min(parseInt(limit) || 50, 500);
    const offset_num = parseInt(offset) || 0;

    // Get hotel_id from session
    const hotelId = session.hotelId;

    if (!hotelId) {
      return res.status(400).json({
        error:
          "Session has no hotel_id. Search may not have completed successfully.",
        sessionId,
        session,
      });
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

    logger.info(`
╔════════════════════════════════════════════════════════════╗
║  ✅ GET /search-session SUCCESS                           ║
╚════════════════════════════════════════════════════════════╝
  📦 Results:
     ├─ Total companies in DB: ${total}
     ├─ Returned in page: ${companies.length}
  📄 Pagination:
     ├─ limit: ${limit_num}
     ├─ offset: ${offset_num}
  🏨 Hotel ID: ${hotelId}
    `);

    // ✅ EXPLICIT JSON RESPONSE
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.json({
      success: true,
      sessionId,
      hotelId,
      session: {
        status: session.status,
        startTime: session.startTime,
        endTime: session.endTime,
        duration: session.getDuration?.() || Date.now() - session.startTime,
        totalCompanies: session.totalCompanies,
        totalQueued: session.totalQueued,
        totalSaved: session.totalSaved,
        totalFailed: session.totalFailed,
        parameters: session.params,
      },
      companies,
      pagination: {
        limit: limit_num,
        offset: offset_num,
        total: total,
      },
    });
  } catch (error) {
    logger.error(`
╔════════════════════════════════════════════════════════════╗
║  ❌ GET /search-session ERROR                             ║
╚════════════════════════════════════════════════════════════╝
  Error: ${error.message}
  Stack: ${error.stack}
    `);

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.status(500).json({
      success: false,
      error: error.message,
      type: error.constructor.name,
    });
  }
});

// ============================================
// GET /search-session/:sessionId/status
// Lightweight status only
// ============================================

router.get("/search-session/:sessionId/status", async (req, res) => {
  try {
    const { sessionId } = req.params;

    logger.debug(`🔹 GET /search-session/:sessionId/status - ${sessionId}`);

    const sessionData = await redis.get(`search:${sessionId}`);
    if (!sessionData) {
      logger.warn(`❌ Status request - Session not found: ${sessionId}`);
      return res.status(404).json({
        success: false,
        error: "Session not found",
        sessionId,
      });
    }

    const session = JSON.parse(sessionData);

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.json({
      success: true,
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
    });
  } catch (error) {
    logger.error(`❌ GET /status error: ${error.message}`);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================
// GET /api/companies-by-hotel/:hotel_id
// Query companies by hotel (independent of session)
// Supports: filter, sort, pagination
// ============================================

router.get("/companies-by-hotel/:hotel_id", async (req, res) => {
  try {
    const { hotel_id } = req.params;
    const {
      keyword = "",
      sort = "distance", // distance, rating, name, created_at
      order = "ASC", // ASC, DESC
      limit = 20,
      page = 1,
      maxDistance = null, // ✅ NEW: Optional radius filter (in km)
    } = req.query;

    // Validate parameters
    const pageLimit = Math.min(Math.max(1, parseInt(limit) || 20), 500);
    const pageNum = Math.max(1, parseInt(page) || 1);
    const pageOffset = (pageNum - 1) * pageLimit;
    const maxDistanceVal =
      maxDistance !== null ? parseFloat(maxDistance) : null;

    // ✅ LOG: Show query parameters
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

    // ✅ NEW: Add distance filter if maxDistance provided
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
    let orderClause = "ORDER BY hc.distance_km ASC"; // default
    if (sort === "rating") {
      orderClause = `ORDER BY c.rating ${order === "DESC" ? "DESC" : "ASC"} NULLS LAST, c.name ASC`;
    } else if (sort === "name") {
      orderClause = `ORDER BY c.name ${order === "DESC" ? "DESC" : "ASC"}`;
    } else if (sort === "created_at") {
      orderClause = `ORDER BY c.created_at ${order === "DESC" ? "DESC" : "ASC"}`;
    } else {
      // distance - default
      orderClause = "ORDER BY hc.distance_km ASC";
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

    // Validate page number
    if (pageNum > totalPages && totalPages > 0) {
      return res.status(404).json({
        error: `Page ${pageNum} not found. Total pages: ${totalPages}`,
      });
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

    // ✅ LOG: Show query results
    logger.info(
      `📋 Results: Found ${total} total | Returning ${companiesResult.rows.length} | Page: ${pageNum}/${totalPages}`,
    );

    res.json({
      hotel_id,
      companies: companiesResult.rows,
      pagination: {
        page: pageNum,
        limit: pageLimit,
        total,
        totalPages,
      },
      filters: {
        keyword,
        sort,
        order,
        maxDistance: maxDistanceVal,
      },
    });
  } catch (error) {
    logger.error("GET /companies-by-hotel error:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
