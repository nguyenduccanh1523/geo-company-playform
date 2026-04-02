/**
 * GOOGLE PLACES STREAMING ROUTES (Clean Architecture)
 *
 * Endpoints:
 * - POST   /search-companies-stream      → Start background search with caching
 *          Parameters: lat, lng, radius_km, grid_radius_km, keyword, name, address, forceRefresh
 * - GET    /search-session/:sessionId     → Query companies saved from session
 * - GET    /search-session/:sessionId/status → Lightweight progress status
 * - GET    /companies-by-hotel/:hotel_id  → Query companies by hotel with filters
 */

import express from "express";
import { GooglePlacesStreamController } from "./controller/google-places-stream.controller.js";

const router = express.Router();

/**
 * POST /search-companies-stream
 * Start a new search session with progressive results
 *
 * Body Parameters:
 * - lat (required): Latitude
 * - lng (required): Longitude
 * - radius_km (optional): Search radius in km (default: 5)
 * - grid_radius_km (optional): Grid size for multi-point search (1-50, auto-calculated if not set)
 * - keyword (optional): Search keyword (default: "company")
 * - name (optional): Location/hotel name (default: auto-generated)
 * - address (optional): Location/hotel address (default: auto-generated from coordinates)
 * - maxResults (optional): Max results per request (default: 100)
 * - forceRefresh (optional): Skip cache and search again (default: false)
 *
 * Example:
 * {
 *   "lat": 16.0699,
 *   "lng": 108.2249,
 *   "radius_km": 50,
 *   "name": "Da Nang City",
 *   "address": "Da Nang, Vietnam"
 * }
 */
router.post("/search-companies-stream", (req, res) =>
  GooglePlacesStreamController.searchCompaniesStream(req, res),
);

// GET /search-session/:sessionId
router.get("/search-session/:sessionId", (req, res) =>
  GooglePlacesStreamController.getSearchSession(req, res),
);

// GET /search-session/:sessionId/status
router.get("/search-session/:sessionId/status", (req, res) =>
  GooglePlacesStreamController.getSearchStatus(req, res),
);

// GET /companies-by-hotel/:hotel_id
router.get("/companies-by-hotel/:hotel_id", (req, res) =>
  GooglePlacesStreamController.getCompaniesByHotel(req, res),
);

export default router;
