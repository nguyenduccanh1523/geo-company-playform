/**
 * GOOGLE PLACES STREAMING ROUTES (Clean Architecture)
 *
 * Endpoints:
 * - POST   /search-companies-stream      → Start background search + events crawl (dual sessions)
 *          Returns: sessionId (companies) + eventsSessionId (events)
 * - GET    /search-session/:sessionId     → Query companies from session
 * - GET    /search-session/:sessionId/status → Lightweight progress status
 * - GET    /events-session/:eventsSessionId → Query events from session (NEW)
 * - GET    /companies-by-hotel/:hotel_id  → Query companies by hotel with filters
 */

import express from "express";
import { GooglePlacesStreamController } from "./controller/google-places-stream.controller.js";

const router = express.Router();

/**
 * POST /search-companies-stream
 * Start a new search session - returns dual sessions: companies + events
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
 * Response:
 * {
 *   "sessionId": "companies_session_id",
 *   "eventsSessionId": "events_session_id",
 *   "hotelId": "hotel_id",
 *   "events_crawl_queued": true
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

// GET /events-session/:eventsSessionId (NEW)
router.get("/events-session/:eventsSessionId", (req, res) =>
  GooglePlacesStreamController.getEventsSession(req, res),
);

// GET /companies-by-hotel/:hotel_id
router.get("/companies-by-hotel/:hotel_id", (req, res) =>
  GooglePlacesStreamController.getCompaniesByHotel(req, res),
);

export default router;
