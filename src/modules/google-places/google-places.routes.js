/**
 * GOOGLE PLACES ROUTES (Clean Architecture)
 *
 * Endpoints:
 * - POST   /search-companies          → Search companies by location
 * - GET    /place-details/:place_id   → Get place details
 * - POST   /text-search               → Text search
 * - POST   /search-companies-by-keyword → Search by keyword
 * - GET    /companies-by-hotel/:hotel_id → Get companies for hotel
 * - GET    /companies/:companyId      → Get single company
 */

import express from "express";
import { GooglePlacesController } from "./controller/google-places.controller.js";

const router = express.Router();

// ===== SEARCH ENDPOINTS =====

/**
 * POST /search-companies
 * Search companies by location
 */
router.post("/search-companies", (req, res) =>
  GooglePlacesController.searchCompanies(req, res),
);

/**
 * GET /place-details/:place_id
 * Get place details
 */
router.get("/place-details/:place_id", (req, res) =>
  GooglePlacesController.getPlaceDetails(req, res),
);

/**
 * POST /text-search
 * Text search Google Places
 */
router.post("/text-search", (req, res) =>
  GooglePlacesController.textSearch(req, res),
);

/**
 * POST /search-companies-by-keyword
 * Search by keyword
 */
router.post("/search-companies-by-keyword", (req, res) =>
  GooglePlacesController.searchByKeyword(req, res),
);

// ===== COMPANIES ENDPOINTS =====

/**
 * GET /companies-by-hotel/:hotel_id
 * Get companies by hotel with pagination
 */
router.get("/companies-by-hotel/:hotel_id", (req, res) =>
  GooglePlacesController.getCompaniesByHotel(req, res),
);

/**
 * GET /companies/:companyId
 * Get single company
 */
router.get("/companies/:companyId", (req, res) =>
  GooglePlacesController.getCompanyById(req, res),
);

export default router;
