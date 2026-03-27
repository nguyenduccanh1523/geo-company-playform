/**
 * EXPRESS.JS API SERVER - Google Places Search
 *
 * Cách dùng:
 * 1. npm install express cors
 * 2. node src/api/server.js
 * 3. Test: POST http://localhost:3000/api/search-companies
 *
 * ⭐ CẢI TIẾN NỚI BẢN:
 * - Grid Search: Tìm kiếm vùng > 50km bằng cách chia thành multiple 50km circles
 * - Pagination đầy đủ: Lấy TẤT CẢ kết quả từ Google Places (không chỉ trang đầu)
 * - Duplicate removal: Loại bỏ công ty trùng lặp
 * - Rate limiting: Delay hợp lý giữa requests
 * - Báo cáo chi tiết: Thống kê theo khoảng cách
 */

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import GooglePlacesService from "../services/googlePlacesService.js";
import CompanyPersistenceService from "../services/companyPersistenceService.js";
import hotelNearbyHelper from "../utils/hotelNearbyHelper.js";
import { EventbriteAPI } from "./eventbriteAPI.js";
import { PredictHqAPI } from "./predictHqAPI.js";
import { EventSearchAPI } from "./eventSearchAPI.js";

dotenv.config();

const app = express();
const PORT = process.env.API_PORT || 9000;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize Google Places Service
const googlePlaces = new GooglePlacesService(process.env.GOOGLE_PLACES_API_KEY);

// Initialize Company Persistence Service
const companyPersistence = new CompanyPersistenceService(
  process.env.GOOGLE_PLACES_API_KEY,
);

// Initialize Eventbrite API
let eventbriteAPI;
try {
  if (!process.env.EVENTBRITE_ACCESS_TOKEN) {
    console.warn(
      "⚠️  EVENTBRITE_ACCESS_TOKEN not set in .env - Eventbrite routes will not work",
    );
    eventbriteAPI = null;
  } else {
    eventbriteAPI = new EventbriteAPI(process.env.EVENTBRITE_ACCESS_TOKEN);
    console.log("✅ Eventbrite API initialized successfully");
  }
} catch (error) {
  console.error("❌ Error initializing Eventbrite API:", error.message);
  eventbriteAPI = null;
}

// Initialize PredictHQ API
let predictHqAPI;
try {
  if (!process.env.PREDICTHQ_ACCESS_TOKEN) {
    console.warn(
      "⚠️  PREDICTHQ_ACCESS_TOKEN not set in .env - PredictHQ routes will not work",
    );
    predictHqAPI = null;
  } else {
    predictHqAPI = new PredictHqAPI(process.env.PREDICTHQ_ACCESS_TOKEN);
    console.log("✅ PredictHQ API initialized successfully");
  }
} catch (error) {
  console.error("❌ Error initializing PredictHQ API:", error.message);
  predictHqAPI = null;
}

// Initialize Event Search API (Perplexity + OpenAI)
let eventSearchAPI;
try {
  eventSearchAPI = new EventSearchAPI(
    process.env.PERPLEXITY_API_KEY || null,
    process.env.OPENAI_API_KEY || null,
    process.env.EVENTBRITE_ACCESS_TOKEN || null,
    process.env.PREDICTHQ_ACCESS_TOKEN || null,
  );
  console.log("✅ Event Search API (Perplexity + OpenAI) initialized");
  if (!process.env.PERPLEXITY_API_KEY) {
    console.warn(
      "⚠️  PERPLEXITY_API_KEY not set - Perplexity routes will not work",
    );
  }
  if (!process.env.OPENAI_API_KEY) {
    console.warn("⚠️  OPENAI_API_KEY not set - OpenAI routes will not work");
  }
} catch (error) {
  console.error("❌ Error initializing Event Search API:", error.message);
  eventSearchAPI = null;
}

// ============================================
// ENDPOINT 1: Tìm công ty gần vị trí (Smart Search)
// ============================================

/**
 * POST /api/search-companies
 *
 * 📌 GIẢI THÍCH CẬP NHẬT:
 *
 * Google Places API giới hạn: radius MAX = 50km
 *
 * ✅ Nếu radius_km <= grid_radius_km:
 *    - Direct search: 1 request API duy nhất
 *    - Lấy TẤT CẢ trang (với pagination)
 *
 * ✅ Nếu radius_km > grid_radius_km (VD: 100km với grid 10km):
 *    - Grid Search: Chia thành multiple grid_radius circles
 *    - Với grid 10km: Tạo ~90 điểm để cover 100km
 *    - Với grid 50km: Tạo ~7 điểm để cover 100km
 *    - Loại bỏ duplicate khi lấy kết quả
 *    - Tất cả kết quả sắp xếp theo khoảng cách từ center
 *
 * Body:
 * {
 *   "lat": 16.0699,
 *   "lng": 108.2249,
 *   "radius_km": 100,           // Bán kính tìm kiếm
 *   "grid_radius_km": 10,       // (Optional) Grid size. Default: 50.
 *                                // Nhỏ hơn = chính xác hơn nhưng API calls nhiều hơn
 *   "hotel_name": "Da Nang"     // (Optional)
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "location": {lat, lng, radius_km, name},
 *   "total_found": 2845,                     // Tổng công ty tìm được
 *   "total_in_radius": 2800,                 // Công ty nằm trong bán kính REQUEST
 *   "companies": [{name, address, distance_km, ...}, ...],
 *   "statistics": {
 *     "within_10km": 45,
 *     "within_25km": 189,
 *     "within_50km": 654,
 *     "within_100km": 2800,
 *     "search_time_ms": 15430,
 *     "api_notes": {
 *       "search_method": "Grid Search",
 *       "grid_radius_km": 10,
 *       "explanation": "Multiple grid searches with 10km grid spacing"
 *     }
 *   }
 * }
 *
 * 💡 GRID RADIUS RECOMMENDATIONS:
 *
 * grid_radius_km | use_case | api_calls_for_100km | accuracy
 * --------------|----------|---------------------|----------
 * 50 (default)   | Fast (default) | 7 | ±25km overlap
 * 25             | Balanced | 16 | ±12.5km overlap
 * 10             | Accurate | 90 | ±5km overlap ← Bạn dùng cái này
 * 5              | Very accurate | 361 | ±2.5km overlap
 *
 * ⚠️  LƯÊN CẢI TIẾN:
 * - grid_radius_km = 10 sẽ chính xác hơn (overlap nhỏ hơn)
 * - Nhưng sẽ nhiều API calls hơn (~90 calls vs 7 calls)
 * - Time estimate: 10km grid for 100km ≈ 3-5 minutes
 */
app.post("/api/search-companies", async (req, res) => {
  try {
    const {
      lat,
      lng,
      radius_km = 100,
      grid_radius_km = 50,
      hotel_name = "Location",
    } = req.body;

    // Validate input
    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        error: "Missing required: lat, lng",
        example: {
          lat: 16.0699,
          lng: 108.2249,
          radius_km: 100,
          grid_radius_km: 50,
          hotel_name: "Hotel Name",
        },
      });
    }

    // Validate grid_radius_km
    if (grid_radius_km <= 0 || grid_radius_km > 50) {
      return res.status(400).json({
        success: false,
        error: "grid_radius_km must be > 0 and <= 50 (Google API max)",
        note: "Smaller grid_radius = more accurate but more API calls. Try 10-50.",
      });
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
      radius_km * 1000, // Convert km to meters
      grid_radius_km * 1000, // Convert km to meters
    );

    // 📞 ENRICH WITH CONTACT DETAILS (lấy phone, website, email)
    // ⚠️ IMPORTANT: Nearby Search API không trả về contact info
    // Phải gọi Place Details API riêng - giới hạn 30 places để tránh rate limit
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

    // ===== THỐNG KÊ CHỈ TÍNH TỪ COMPANIES TRONG RADIUS =====
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

    // Calculate averages only from companies in radius
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

    // Only persist companies within radius to avoid unnecessary data
    if (companiesInRadius.length > 0) {
      console.log(
        `\n💾 Persisting ${companiesInRadius.length} companies to database...`,
      );

      try {
        // Prepare companies for persistence (flatten nested structure)
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
            enrichDetails: false, // Already enriched above
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
          `✅ Persistence completed: ${persistenceResult.saved} saved, ${persistenceResult.skipped} skipped, ${persistenceResult.errors} errors`,
        );
      } catch (persistError) {
        console.error("❌ Error persisting companies:", persistError.message);
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
        within_100km: Math.min(within_100km, totalInRadius), // Cap at totalInRadius
        within_500km: Math.min(within_500km, totalInRadius), // Cap at totalInRadius
        avg_distance: avgDistance,
        min_distance: minDistance,
        max_distance: maxDistance,
        search_time_ms: searchTime,
        api_notes: {
          search_method:
            radius_km <= grid_radius_km ? "Direct Search" : "Grid Search",
          grid_radius_km: grid_radius_km,
          max_google_api_radius_km: 50,
          overlap_explanation:
            grid_radius_km <= 10
              ? `Small grid (${grid_radius_km}km) with ${Math.round((radius_km / (grid_radius_km * 0.433)) ** 1.5)} grid points. Overlap: ${((grid_radius_km / 2) * 0.866).toFixed(1)}km. More data but slower.`
              : `Larger grid (${grid_radius_km}km) with fewer grid points. Overlap: ${((grid_radius_km / 2) * 0.866).toFixed(1)}km. Faster but less redundancy.`,
          why_total_found_higher_than_in_radius:
            "total_found includes duplicates from grid points BEFORE deduplication. After deduplication and radius filter, some companies outside requested radius are excluded.",
          note: "All statistics calculated only from companies within the requested radius",
        },
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
// ENDPOINT 2: Tìm chi tiết 1 Place
// ============================================

/**
 * GET /api/place-details/:place_id
 *
 * Response:
 * {
 *   "success": true,
 *   "place": {name, phone, website, business_status, ...}
 * }
 */
app.get("/api/place-details/:place_id", async (req, res) => {
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
// ENDPOINT 3: Search by text
// ============================================

/**
 * POST /api/text-search
 *
 * Body:
 * {
 *   "query": "restaurant",
 *   "lat": 16.0699,
 *   "lng": 108.2249
 * }
 */
app.post("/api/text-search", async (req, res) => {
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
// ENDPOINT 4: Search companies by keyword + location
// ============================================

/**
 * POST /api/search-companies-by-keyword
 *
 * ⭐ Tìm kiếm công ty theo KEYWORD tại vị trí xác định
 *
 * Body:
 * {
 *   "lat": 16.0699,
 *   "lng": 108.2249,
 *   "keyword": "software development",      // ← Keyword tìm kiếm
 *   "radius_km": 50,                        // (Optional, default 100)
 *   "grid_radius_km": 25,                   // (Optional, default 50)
 *   "limit": 100                            // (Optional, default unlimited)
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "search_params": {keyword, location, radius_km},
 *   "total_found": 245,
 *   "companies": [{...company data...}]
 * }
 */
app.post("/api/search-companies-by-keyword", async (req, res) => {
  try {
    const {
      lat,
      lng,
      keyword,
      radius_km = 100,
      grid_radius_km = 50,
      limit = 1000,
    } = req.body;

    // Validate input
    if (!lat || !lng || !keyword) {
      return res.status(400).json({
        success: false,
        error: "Missing required: lat, lng, keyword",
        example: {
          lat: 16.0699,
          lng: 108.2249,
          keyword: "software development",
          radius_km: 100,
          grid_radius_km: 50,
        },
      });
    }

    // Validate grid_radius_km
    if (grid_radius_km <= 0 || grid_radius_km > 50) {
      return res.status(400).json({
        success: false,
        error: "grid_radius_km must be > 0 and <= 50 (Google API max)",
      });
    }

    console.log(`\n🔍 Searching by keyword: "${keyword}"`);
    console.log(`   Location: ${lat}, ${lng}`);
    console.log(`   Radius: ${radius_km}km\n`);

    const startTime = Date.now();

    // Search using the keyword
    const businesses = await googlePlaces.searchNearbyBusinesses(
      keyword,
      lat,
      lng,
      [], // Empty types array - let Google use the keyword
      radius_km * 1000,
      grid_radius_km * 1000,
    );

    // 📞 ENRICH WITH CONTACT DETAILS (lấy phone, website, email)
    const enrichedBusinesses =
      await googlePlaces.enrichPlacesWithContactDetails(businesses, 30);

    // Format results
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

    // Sort by rating (highest first), then by distance
    companies.sort((a, b) => {
      if ((b.rating || 0) !== (a.rating || 0)) {
        return (b.rating || 0) - (a.rating || 0);
      }
      return a.distance_km - b.distance_km;
    });

    // Filter to requested radius
    const companiesInRadius = companies.filter(
      (c) => c.distance_km <= radius_km,
    );

    // Apply limit
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
      notes: {
        sorted_by: "Rating (highest first), then distance",
        contact_info: "phone, website, email, contact_person (if available)",
        place_details: "Use /api/place-details/:place_id for more details",
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
// Root endpoint
// ============================================

app.get("/", (req, res) => {
  res.json({
    message: "🌐 Google Places Search API",
    endpoints: {
      "POST /api/search-companies": {
        description:
          "Search companies around a location (with configurable grid size)",
        body: {
          lat: 16.0699,
          lng: 108.2249,
          radius_km: 100,
          grid_radius_km: 10,
          hotel_name: "Hotel Name (optional)",
        },
        returns: {
          contact: "phone, website, email, contact_person, business_hours",
          sorted_by: "distance",
        },
      },
      "POST /api/search-companies-by-keyword": {
        description: "Search companies by keyword + location (⭐ NEW)",
        body: {
          lat: 16.0699,
          lng: 108.2249,
          keyword: "software development",
          radius_km: 100,
          grid_radius_km: 50,
          limit: 100,
        },
        returns: {
          contact: "phone, website, email, contact_person",
          sorted_by: "rating (highest first), then distance",
        },
      },
      "GET /api/place-details/:place_id": {
        description: "Get details for a specific place",
      },
      "POST /api/text-search": {
        description: "Search by text query",
        body: {
          query: "restaurant",
          lat: 16.0699,
          lng: 108.2249,
        },
      },
      "POST /api/events/infer-openai": {
        description:
          "⭐ NEW: Infer events using OpenAI based on company profiles JSON",
        body: {
          companies: [
            {
              company_name: "Google Vietnam",
              website: "google.com.vn",
              industry: "Technology",
              address: "Ho Chi Minh City, Vietnam",
              distance_from_center: 0,
            },
          ],
        },
        returns:
          "JSON array of inferred events (2-5 per company) with confidence scores per prompt.txt schema",
      },
      "POST /api/events/infer-perplexity": {
        description:
          "⭐ NEW: Infer events using Perplexity based on company profiles JSON",
        body: {
          companies: [
            {
              company_name: "Google Vietnam",
              website: "google.com.vn",
              industry: "Technology",
              address: "Ho Chi Minh City, Vietnam",
              distance_from_center: 0,
            },
          ],
        },
        returns:
          "JSON array of inferred events (2-5 per company) with confidence scores per prompt.txt schema",
      },
      "POST /api/events/infer-compare": {
        description:
          "⭐ NEW: Compare inferred events from OpenAI vs Perplexity",
        body: {
          companies: [
            {
              company_name: "Google Vietnam",
              website: "google.com.vn",
              industry: "Technology",
              address: "Ho Chi Minh City, Vietnam",
              distance_from_center: 0,
            },
          ],
        },
        returns:
          "Comparison of results from both providers with total inferred events",
      },
    },
  });
});

// ============================================
// EVENTBRITE API ROUTES
// ============================================

// Middleware để check EventbriteAPI
const checkEventbriteAPI = (req, res, next) => {
  if (!eventbriteAPI) {
    return res.status(503).json({
      success: false,
      error:
        "Eventbrite API not initialized - EVENTBRITE_ACCESS_TOKEN missing in .env",
    });
  }
  next();
};

/**
 * POST /api/events/search
 * Search events by company name, keywords, location, etc.
 */
app.post("/api/events/search", checkEventbriteAPI, (req, res) =>
  eventbriteAPI.handleSearchEvents(req, res),
);

/**
 * POST /api/events/search-by-location
 * Search events by coordinates (latitude, longitude) and radius
 */
app.post("/api/events/search-by-location", checkEventbriteAPI, (req, res) =>
  eventbriteAPI.handleSearchEventsByLocation(req, res),
);

/**
 * POST /api/companies/:companyId/find-events
 * Find events for a specific company
 */
app.post(
  "/api/companies/:companyId/find-events",
  checkEventbriteAPI,
  (req, res) => eventbriteAPI.handleFindCompanyEvents(req, res),
);

/**
 * GET /api/events/:eventbriteId
 * Get detailed information about a specific event
 */
app.get("/api/events/:eventbriteId", checkEventbriteAPI, (req, res) =>
  eventbriteAPI.handleGetEventDetails(req, res),
);

// ============================================
// PREDICTHQ API ROUTES
// ============================================

// Middleware để check PredictHQ API
const checkPredictHqAPI = (req, res, next) => {
  if (!predictHqAPI) {
    return res.status(503).json({
      success: false,
      error:
        "PredictHQ API not initialized - PREDICTHQ_ACCESS_TOKEN missing in .env",
    });
  }
  next();
};

/**
 * POST /api/events/search-by-company
 * ⭐ MAIN: Search events by company name + date range
 * Input: companyName, location (optional), startDate, endDate
 */
app.post("/api/events/search-by-company", checkPredictHqAPI, (req, res) =>
  predictHqAPI.handleSearchCompanyEvents(req, res),
);

/**
 * POST /api/events/search-by-location
 * Search events by coordinates (lat/lng) + radius
 * Input: lat, lng, radius, startDate, endDate
 */
app.post("/api/events/search-by-location", checkPredictHqAPI, (req, res) =>
  predictHqAPI.handleSearchLocationEvents(req, res),
);

/**
 * POST /api/events/search-keywords
 * Search events by keywords + category filter
 * Input: keywords, category (optional), location
 */
app.post("/api/events/search-keywords", checkPredictHqAPI, (req, res) =>
  predictHqAPI.handleSearchKeywordsEvents(req, res),
);

/**
 * GET /api/events/details/:eventId
 * Get comprehensive event details including attendance, rank, and tickets
 * Input: eventId (from URL)
 */
app.get("/api/events/details/:eventId", checkPredictHqAPI, (req, res) =>
  predictHqAPI.handleGetEventDetails(req, res),
);

/**
 * GET /api/health/events
 * Health check - Verify API connectivity
 */
app.get("/api/health/events", (req, res) =>
  predictHqAPI.handleHealthCheck(req, res),
);

// ============================================
// EVENT SEARCH API ROUTES (Perplexity + OpenAI)
// ============================================
// EVENT SEARCH API ROUTES (Perplexity + OpenAI)
// ============================================

// Middleware để check Event Search API
const checkEventSearchAPI = (req, res, next) => {
  if (!eventSearchAPI) {
    return res.status(503).json({
      success: false,
      error:
        "Event Search API not initialized - Check PERPLEXITY_API_KEY and OPENAI_API_KEY in .env",
    });
  }
  next();
};

/**
 * POST /api/events/infer-openai
 * ⭐ Infer events using OpenAI based on company profiles
 *
 * Input:
 * {
 *   "companies": [
 *     {
 *       "company_name": "Google Vietnam",
 *       "website": "google.com.vn",
 *       "industry": "Technology",
 *       "address": "Ho Chi Minh City, Vietnam",
 *       "distance_from_center": 0
 *     },
 *     ...
 *   ]
 * }
 *
 * Output: JSON array của inferred events theo prompt.txt schema
 */
app.post("/api/events/infer-openai", checkEventSearchAPI, (req, res) =>
  eventSearchAPI.handleInferOpenAI(req, res),
);

/**
 * POST /api/events/infer-perplexity
 * ⭐ Infer events using Perplexity based on company profiles
 *
 * Input:
 * {
 *   "companies": [...]
 * }
 *
 * Output: JSON array của inferred events theo prompt.txt schema
 */
app.post("/api/events/infer-perplexity", checkEventSearchAPI, (req, res) =>
  eventSearchAPI.handleInferPerplexity(req, res),
);

/**
 * POST /api/events/infer-compare
 * ⭐ Compare inferred events from both OpenAI and Perplexity
 *
 * Input:
 * {
 *   "companies": [...]
 * }
 *
 * Output:
 * {
 *   "success": true,
 *   "total_companies": N,
 *   "providers": {
 *     "openai": {...},
 *     "perplexity": {...}
 *   }
 * }
 */
app.post("/api/events/infer-compare", checkEventSearchAPI, (req, res) =>
  eventSearchAPI.handleInferCompare(req, res),
);

/**
 * POST /api/events/search-perplexity
 * ⭐ Search events using Perplexity AI + Web Search
 *
 * Perplexity tìm sự kiện từ nhiều nguồn trên internet
 * - Tìm được thông tin organizer / người tổ chức
 * - Hỗ trợ tìm kiếm web thời gian thực
 *
 * Input:
 * {
 *   "companyName": "Google Vietnam",           // Bắt buộc
 *   "website": "google.com.vn",               // Optional
 *   "location": "Ho Chi Minh City",           // Optional
 *   "limit": 20,                              // Optional
 *   "includeContacts": true                   // Optional
 * }
 */
app.post("/api/events/search-perplexity", checkEventSearchAPI, (req, res) =>
  eventSearchAPI.handleSearchPerplexity(req, res),
);

/**
 * POST /api/events/search-openai
 * ⭐ Search events using OpenAI + Multi-source Integration
 *
 * OpenAI kết hợp:
 * - Web search (function calling)
 * - Eventbrite API (nếu có token)
 * - PredictHQ API (nếu có token)
 * - Phân tích và tổng hợp thông tin
 *
 * Input:
 * {
 *   "companyName": "Google Vietnam",           // Bắt buộc
 *   "website": "google.com.vn",               // Optional
 *   "location": "Ho Chi Minh City",           // Optional
 *   "limit": 20,                              // Optional
 *   "includeContacts": true,                  // Optional
 *   "useExternalApis": true                   // Optional - Use Eventbrite/PredictHQ
 * }
 */
app.post("/api/events/search-openai", checkEventSearchAPI, (req, res) =>
  eventSearchAPI.handleSearchOpenAI(req, res),
);

/**
 * POST /api/events/search-advanced
 * ⭐ Advanced search with filters using OpenAI
 *
 * Tìm kiếm nâng cao với bộ lọc:
 * - Loại sự kiện (Conference, Meetup, Workshop, etc.)
 * - Khoảng thời gian
 * - Từ khóa
 *
 * Input:
 * {
 *   "companyName": "Google Vietnam",
 *   "website": "google.com.vn",
 *   "location": "Ho Chi Minh City",
 *   "filters": {
 *     "eventTypes": ["Conference", "Meetup"],
 *     "dateRange": {
 *       "from": "2024-01-01",
 *       "to": "2026-12-31"
 *     },
 *     "keywords": ["technology", "AI"],
 *     "minAttendees": 100
 *   }
 * }
 */
app.post("/api/events/search-advanced", checkEventSearchAPI, (req, res) =>
  eventSearchAPI.handleAdvancedSearch(req, res),
);

/**
 * POST /api/events/compare
 * ⭐ Compare results from Perplexity vs OpenAI
 *
 * So sánh kết quả tìm kiếm từ Perplexity và OpenAI
 * để thấy sự khác biệt và độ chính xác của từng nền tảng
 *
 * Input:
 * {
 *   "companyName": "Google Vietnam",
 *   "website": "google.com.vn",
 *   "location": "Ho Chi Minh City",
 *   "limit": 15
 * }
 *
 * Response sẽ chứa:
 * - Kết quả từ Perplexity
 * - Kết quả từ OpenAI
 * - Sự kiện chỉ có ở Perplexity
 * - Sự kiện chỉ có ở OpenAI
 * - Sự kiện chung ở cả hai
 * - Tỉ lệ bao phủ
 * - Phân tích so sánh
 */
app.post("/api/events/compare", checkEventSearchAPI, (req, res) =>
  eventSearchAPI.handleCompareProviders(req, res),
);

/**
 * POST /api/events/organizer-details
 * Get detailed information about an event organizer
 *
 * Input:
 * {
 *   "organizerName": "Tech Meetup Vietnam",
 *   "location": "Ho Chi Minh",
 *   "provider": "perplexity" (or "openai")
 * }
 */
app.post("/api/events/organizer-details", checkEventSearchAPI, (req, res) =>
  eventSearchAPI.handleGetOrganizerDetails(req, res),
);

// ============================================
// Error handling (MUST BE LAST)
// ============================================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "Endpoint not found",
  });
});

// ============================================
// Start server
// ============================================

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════╗
║  🌐 Geo Company API (Places + Events)              ║
║  Server running on http://localhost:${PORT}        ║
╚════════════════════════════════════════════════════╝

📍 Google Places Endpoints:

1️⃣ Search Companies Around Location (By Type)
   POST http://localhost:${PORT}/api/search-companies
   Body: {"lat": 16.0699, "lng": 108.2249, "radius_km": 100}
   Returns: contact (phone, website, email, contact_person, business_hours)

2️⃣ Search Companies by Keyword ⭐ NEW
   POST http://localhost:${PORT}/api/search-companies-by-keyword
   Body: {"lat": 16.0699, "lng": 108.2249, "keyword": "software development", "radius_km": 50}
   Returns: contact + sorted by rating (highest first), then distance

3️⃣ Get Place Details
   GET http://localhost:${PORT}/api/place-details/{place_id}

4️⃣ Text Search
   POST http://localhost:${PORT}/api/text-search
   Body: {"query": "restaurant", "lat": 16.0699, "lng": 108.2249}

📍 EVENT SEARCH (Perplexity + OpenAI) ⭐⭐⭐ NEW

5️⃣ Search Events - PERPLEXITY (Web Search Real-time)
   POST http://localhost:${PORT}/api/events/search-perplexity
   Body: {"companyName": "Google Vietnam", "website": "google.com.vn", "location": "Ho Chi Minh City", "limit": 20}
   ✨ Tìm sự kiện từ web real-time + Organizer info

6️⃣ Search Events - OPENAI (Multi-source)
   POST http://localhost:${PORT}/api/events/search-openai
   Body: {"companyName": "Google Vietnam", "website": "google.com.vn", "location": "Ho Chi Minh City", "limit": 20, "useExternalApis": true}
   ✨ Kết hợp OpenAI + Eventbrite + PredictHQ

7️⃣ Advanced Search - OPENAI (With Filters)
   POST http://localhost:${PORT}/api/events/search-advanced
   Body: {
     "companyName": "Google Vietnam",
     "filters": {
       "eventTypes": ["Conference", "Meetup"],
       "dateRange": {"from": "2024-01-01", "to": "2026-12-31"},
       "keywords": ["technology", "AI"]
     }
   }

8️⃣ Compare Results (Perplexity vs OpenAI)
   POST http://localhost:${PORT}/api/events/compare
   Body: {"companyName": "Google Vietnam", "website": "google.com.vn", "location": "Ho Chi Minh City", "limit": 15}
   📊 So sánh độ chính xác và phạm vi tìm kiếm

9️⃣ Get Organizer Details
   POST http://localhost:${PORT}/api/events/organizer-details
   Body: {"organizerName": "Tech Meetup Vietnam", "location": "Ho Chi Minh", "provider": "perplexity"}

📍 PredictHQ Event Endpoints: (Traditional)

🔟 Search Events by Company Name + Date Range
   POST http://localhost:${PORT}/api/events/search-by-company
   Body: {"companyName": "Google Vietnam", "location": "Vietnam", "startDate": "2026-01-01", "endDate": "2027-01-01"}

1️⃣1️⃣ Search Events by Location (Coordinates)
   POST http://localhost:${PORT}/api/events/search-by-location
   Body: {"lat": 10.7769, "lng": 106.7009, "radius": 50}

1️⃣2️⃣ Search Events by Keywords
   POST http://localhost:${PORT}/api/events/search-keywords
   Body: {"keywords": "technology conference", "location": "Vietnam"}

🧪 Curl Examples:

# Test Perplexity Search
   curl -X POST http://localhost:${PORT}/api/events/search-perplexity \\
     -H "Content-Type: application/json" \\
     -d '{"companyName":"Google Vietnam","website":"google.com.vn","location":"Ho Chi Minh"}'

# Test OpenAI Search
   curl -X POST http://localhost:${PORT}/api/events/search-openai \\
     -H "Content-Type: application/json" \\
     -d '{"companyName":"Google Vietnam","website":"google.com.vn","location":"Ho Chi Minh","useExternalApis":true}'

# Compare Perplexity vs OpenAI
   curl -X POST http://localhost:${PORT}/api/events/compare \\
     -H "Content-Type: application/json" \\
     -d '{"companyName":"Google Vietnam","website":"google.com.vn","location":"Ho Chi Minh"}'

📖 Ready to test!
  `);
});
