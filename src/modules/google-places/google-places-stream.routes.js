/**
 * GOOGLE PLACES STREAMING ROUTES (Clean Architecture)
 *
 * Endpoints:
 * - POST   /search-companies-stream      → Start background search with caching
 * - GET    /search-session/:sessionId     → Query companies saved from session
 * - GET    /search-session/:sessionId/status → Lightweight progress status
 * - GET    /companies-by-hotel/:hotel_id  → Query companies by hotel with filters
 */

import express from "express";
import { GooglePlacesStreamController } from "./controller/google-places-stream.controller.js";

const router = express.Router();

// POST /search-companies-stream
router.post("/search-companies-stream", (req, res) =>
  GooglePlacesStreamController.searchCompaniesStream(req, res)
);

// GET /search-session/:sessionId
router.get("/search-session/:sessionId", (req, res) =>
  GooglePlacesStreamController.getSearchSession(req, res)
);

// GET /search-session/:sessionId/status
router.get("/search-session/:sessionId/status", (req, res) =>
  GooglePlacesStreamController.getSearchStatus(req, res)
);

// GET /companies-by-hotel/:hotel_id
router.get("/companies-by-hotel/:hotel_id", (req, res) =>
  GooglePlacesStreamController.getCompaniesByHotel(req, res)
);

export default router;
