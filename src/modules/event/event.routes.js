/**
 * EVENT ROUTES
 */

import express from "express";
import { EventController } from "./event.controller.js";

const router = express.Router();

/**
 * POST /api/events
 * Create event
 */
router.post("/", EventController.createEvent);

/**
 * GET /api/events
 * List events with filtering
 */
router.get("/", EventController.listEvents);

/**
 * GET /api/events/nearby
 * Find nearby events - MUST BE BEFORE /:id ROUTE!
 */
router.get("/nearby", EventController.getNearbyEvents);

/**
 * POST /api/events/import
 * Import events
 */
router.post("/import", EventController.importEvents);

/**
 * GET /api/events/:id
 * Get event details
 */
router.get("/:id", EventController.getEvent);

/**
 * GET /api/events/:id/details
 * Get event with related companies
 */
router.get("/:id/details", EventController.getEventDetails);

/**
 * PUT /api/events/:id
 * Update event
 */
router.put("/:id", EventController.updateEvent);

/**
 * DELETE /api/events/:id
 * Delete event
 */
router.delete("/:id", EventController.deleteEvent);

/**
 * POST /api/events/:id/archive
 * Archive event (soft delete)
 */
router.post("/:id/archive", EventController.archiveEvent);

export default router;
