/**
 * GOOGLE PLACES ROUTES
 *
 * Routes cho Google Places API:
 * - Search companies by location
 * - Search companies by keyword
 * - Get place details
 * - Text search
 */

import express from "express";
import GooglePlacesService from "../../services/googlePlacesService.js";
import CompanyPersistenceService from "../../services/companyPersistenceService.js";

const router = express.Router();

// Initialize services
const googlePlaces = new GooglePlacesService(process.env.GOOGLE_PLACES_API_KEY);
const companyPersistence = new CompanyPersistenceService(
  process.env.GOOGLE_PLACES_API_KEY,
);

// ============================================
// Helper Functions
// ============================================

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 100) / 100; // 2 decimal places
}

function categorizeIndustry(types = []) {
  const typeString = (types || []).join(",").toLowerCase();

  if (typeString.includes("hotel") || typeString.includes("lodging")) {
    return "Accommodation";
  }
  if (
    typeString.includes("restaurant") ||
    typeString.includes("cafe") ||
    typeString.includes("food")
  ) {
    return "Food & Beverage";
  }
  if (typeString.includes("store") || typeString.includes("shopping")) {
    return "Retail";
  }
  if (
    typeString.includes("bank") ||
    typeString.includes("finance") ||
    typeString.includes("atm")
  ) {
    return "Finance";
  }
  if (typeString.includes("doctor") || typeString.includes("hospital")) {
    return "Healthcare";
  }
  if (typeString.includes("school") || typeString.includes("university")) {
    return "Education";
  }
  if (typeString.includes("park") || typeString.includes("museum")) {
    return "Tourism";
  }

  return "Services";
}

// ============================================
// ENDPOINT 1: Search Companies by Location
// ============================================

/**
 * POST /search-companies
 *
 * Tìm kiếm công ty gần vị trí xác định
 */
router.post("/search-companies", async (req, res) => {
  try {
    const { lat, lng, radius_km = 100, hotel_name = "Location" } = req.body;

    // Validate input
    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        error: "Missing required: lat, lng",
        example: {
          lat: 16.0699,
          lng: 108.2249,
          radius_km: 100,
          hotel_name: "Hotel Name",
        },
      });
    }

    // Calculate grid_radius_km based on search radius
    let grid_radius_km;
    if (radius_km > 80) {
      grid_radius_km = 50;
    } else if (radius_km >= 40) {
      grid_radius_km = 25;
    } else {
      grid_radius_km = 10;
    }

    console.log(`\n🔍 Searching for companies around ${hotel_name}`);
    console.log(`   Location: ${lat}, ${lng}`);
    console.log(`   Search radius: ${radius_km}km`);
    console.log(`   Grid radius: ${grid_radius_km}km\n`);

    const startTime = Date.now();

    // Search
    const businesses = await googlePlaces.searchNearbyBusinesses(
      hotel_name,
      lat,
      lng,
      ["company", "establishment", "point_of_interest"],
      radius_km * 1000,
      grid_radius_km * 1000,
    );

    // 📞 ENRICH WITH CONTACT DETAILS
    const enrichedBusinesses =
      await googlePlaces.enrichPlacesWithContactDetails(businesses, 30);

    // Format results with distance calculation
    const companies = enrichedBusinesses.map((b) => {
      const distance = calculateDistance(lat, lng, b.lat, b.lng);
      return {
        place_id: b.place_id,
        name: b.name,
        industry: categorizeIndustry(b.types),
        address: b.address,
        location: {
          lat: b.lat,
          lng: b.lng,
        },
        distance_km: distance,
        contact: {
          phone: b.phone || "N/A",
          website: b.website || "N/A",
          url: b.url || "N/A",
          email: b.email || "N/A",
          contact_person: b.contact_person || null,
          contact_person_phone: b.contact_person_phone || null,
          business_hours: b.opening_hours || "N/A",
        },
        rating: b.rating || null,
        reviews_count: b.user_ratings_total || 0,
        business_status: b.business_status || "OPERATIONAL",
        types: b.types,
      };
    });

    // Sort by distance
    companies.sort((a, b) => a.distance_km - b.distance_km);

    const searchTime = Date.now() - startTime;

    // Filter companies to only those WITHIN requested radius
    const companiesInRadius = companies.filter(
      (c) => c.distance_km <= radius_km,
    );

    const totalInRadius = companiesInRadius.length;

    // Statistics breakdown by distance
    const within_10km = companiesInRadius.filter(
      (c) => c.distance_km <= 10,
    ).length;
    const within_25km = companiesInRadius.filter(
      (c) => c.distance_km <= 25,
    ).length;
    const within_50km = companiesInRadius.filter(
      (c) => c.distance_km <= 50,
    ).length;
    const within_100km = companiesInRadius.filter(
      (c) => c.distance_km <= 100,
    ).length;
    const within_500km = companiesInRadius.filter(
      (c) => c.distance_km <= 500,
    ).length;

    // Calculate averages
    const avgDistance =
      companiesInRadius.length > 0
        ? (
            companiesInRadius.reduce((sum, c) => sum + c.distance_km, 0) /
            companiesInRadius.length
          ).toFixed(2)
        : 0;

    const minDistance =
      companiesInRadius.length > 0 ? companiesInRadius[0].distance_km : 0;
    const maxDistance =
      companiesInRadius.length > 0
        ? companiesInRadius[companiesInRadius.length - 1].distance_km
        : 0;

    // ============================================
    // 💾 PERSIST COMPANIES TO DATABASE
    // ============================================
    let persistenceResult = {
      saved: 0,
      skipped: 0,
      errors: 0,
    };

    if (companiesInRadius.length > 0) {
      console.log(
        `\n💾 Persisting ${companiesInRadius.length} companies to database...`,
      );

      try {
        const companiesToPersist = companiesInRadius.map((c) => ({
          place_id: c.place_id,
          name: c.name,
          industry: c.industry,
          address: c.address,
          lat: c.location.lat,
          lng: c.location.lng,
          website: c.contact.website,
          email: c.contact.email,
          phone: c.contact.phone,
          url: c.contact.url,
          rating: c.rating,
          reviews_count: c.reviews_count,
          business_status: c.business_status,
          business_hours: c.contact.business_hours,
          types: c.types,
        }));

        const result = await companyPersistence.persistCompanies(
          companiesToPersist,
          {
            enrichDetails: false,
            skipDuplicates: true,
            maxDetailsToEnrich: 50,
            source_id: "google_places_search",
          },
        );

        persistenceResult = {
          saved: result.summary.total_saved,
          skipped: result.summary.total_skipped,
          errors: result.summary.total_errors,
          time_ms: result.summary.time_ms,
        };

        console.log(
          `✅ Persistence completed: ${persistenceResult.saved} saved, ${persistenceResult.skipped} skipped`,
        );
      } catch (persistError) {
        console.error("❌ Error persisting:", persistError.message);
        persistenceResult.errors = 1;
      }
    }

    res.json({
      success: true,
      location: {
        lat,
        lng,
        radius_km,
        name: hotel_name,
      },
      total_found: companies.length,
      total_in_radius: totalInRadius,
      companies: companiesInRadius,
      database: {
        saved: persistenceResult.saved,
        skipped: persistenceResult.skipped,
        errors: persistenceResult.errors,
        persist_time_ms: persistenceResult.time_ms || 0,
      },
      statistics: {
        within_10km,
        within_25km,
        within_50km,
        within_100km: Math.min(within_100km, totalInRadius),
        within_500km: Math.min(within_500km, totalInRadius),
        avg_distance: avgDistance,
        min_distance: minDistance,
        max_distance: maxDistance,
        search_time_ms: searchTime,
      },
    });
  } catch (error) {
    console.error("❌ Error:", error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================
// ENDPOINT 2: Get Place Details
// ============================================

/**
 * GET /place-details/:place_id
 */
router.get("/place-details/:place_id", async (req, res) => {
  try {
    const { place_id } = req.params;

    if (!place_id) {
      return res.status(400).json({
        success: false,
        error: "place_id is required",
      });
    }

    const details = await googlePlaces.getPlaceDetails(place_id);

    res.json({
      success: true,
      place: details,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================
// ENDPOINT 3: Text Search
// ============================================

/**
 * POST /text-search
 */
router.post("/text-search", async (req, res) => {
  try {
    const { query, lat, lng } = req.body;

    if (!query || !lat || !lng) {
      return res.status(400).json({
        success: false,
        error: "Missing required: query, lat, lng",
      });
    }

    const results = await googlePlaces.textSearch(query, lat, lng);

    res.json({
      success: true,
      query,
      total_found: results.length,
      results,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================
// ENDPOINT 4: Search by Keyword
// ============================================

/**
 * POST /search-companies-by-keyword
 */
router.post("/search-companies-by-keyword", async (req, res) => {
  try {
    const {
      lat,
      lng,
      keyword,
      radius_km = 100,
      grid_radius_km = 50,
      limit = 1000,
    } = req.body;

    if (!lat || !lng || !keyword) {
      return res.status(400).json({
        success: false,
        error: "Missing required: lat, lng, keyword",
      });
    }

    if (grid_radius_km <= 0 || grid_radius_km > 50) {
      return res.status(400).json({
        success: false,
        error: "grid_radius_km must be > 0 and <= 50",
      });
    }

    console.log(`\n🔍 Searching by keyword: "${keyword}"`);

    const startTime = Date.now();

    const businesses = await googlePlaces.searchNearbyBusinesses(
      keyword,
      lat,
      lng,
      [],
      radius_km * 1000,
      grid_radius_km * 1000,
    );

    const enrichedBusinesses =
      await googlePlaces.enrichPlacesWithContactDetails(businesses, 30);

    const companies = enrichedBusinesses.map((b) => {
      const distance = calculateDistance(lat, lng, b.lat, b.lng);
      return {
        place_id: b.place_id,
        name: b.name,
        industry: categorizeIndustry(b.types),
        address: b.address,
        location: {
          lat: b.lat,
          lng: b.lng,
        },
        distance_km: distance,
        contact: {
          phone: b.phone || "N/A",
          website: b.website || "N/A",
          url: b.url || "N/A",
          email: b.email || "N/A",
        },
        rating: b.rating || null,
        reviews_count: b.user_ratings_total || 0,
        business_status: b.business_status || "OPERATIONAL",
        types: b.types,
      };
    });

    // Sort by rating, then distance
    companies.sort((a, b) => {
      if ((b.rating || 0) !== (a.rating || 0)) {
        return (b.rating || 0) - (a.rating || 0);
      }
      return a.distance_km - b.distance_km;
    });

    const companiesInRadius = companies.filter(
      (c) => c.distance_km <= radius_km,
    );

    const finalResults = companiesInRadius.slice(0, limit);
    const searchTime = Date.now() - startTime;

    res.json({
      success: true,
      search_params: {
        keyword,
        location: { lat, lng },
        radius_km,
        limit,
      },
      results: {
        total_found: companies.length,
        in_radius: companiesInRadius.length,
        returned: finalResults.length,
        search_time_ms: searchTime,
      },
      companies: finalResults,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
