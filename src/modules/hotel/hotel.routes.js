/**
 * HOTEL ROUTES
 */

import express from "express";
import { HotelController } from "./hotel.controller.js";

const router = express.Router();

/**
 * POST /api/hotels
 * Create hotel
 */
router.post("/", HotelController.createHotel);

/**
 * GET /api/hotels
 * List hotels with filtering
 */
router.get("/", HotelController.listHotels);

/**
 * GET /api/hotels/nearby
 * Find nearby hotels - MUST BE BEFORE /:id ROUTE!
 */
router.get("/nearby", HotelController.getNearbyHotels);

/**
 * GET /api/hotels/import
 * Import hotels
 */
router.post("/import", HotelController.importHotels);

/**
 * GET /api/hotels/:id
 * Get hotel details
 */
router.get("/:id", HotelController.getHotel);

/**
 * GET /api/hotels/:id/details
 * Get hotel with related companies and events
 */
router.get("/:id/details", HotelController.getHotelDetails);

/**
 * PUT /api/hotels/:id
 * Update hotel
 */
router.put("/:id", HotelController.updateHotel);

/**
 * DELETE /api/hotels/:id
 * Delete hotel
 */
router.delete("/:id", HotelController.deleteHotel);

/**
 * POST /api/hotels/:id/archive
 * Archive hotel (soft delete)
 */
router.post("/:id/archive", HotelController.archiveHotel);

export default router;
