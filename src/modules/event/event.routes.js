/**
 * EVENT ROUTES
 */

import express from "express";
import { EventController } from "./event.controller.js";
import EventContactInfoController from "./event-contact-info.controller.js";

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

// ============================================
// CONTACT INFO ROUTES
// ============================================
// These routes must come AFTER specific routes and BEFORE /:id routes

/**
 * POST /api/events/find-organizer-contact
 * 🆕 DEMO ENDPOINT - Find organizer contact without eventId
 * Use this to test with manual event data when DB is empty
 * MUST BE BEFORE /bulk and /:id ROUTES!
 */
router.post(
  "/find-organizer-contact",
  EventContactInfoController.findOrganizerContactFromBody,
);

/**
 * POST /api/events/find-organizer-contacts/bulk
 * Find contact info for multiple events
 * MUST BE BEFORE /:id ROUTE!
 */
router.post(
  "/find-organizer-contacts/bulk",
  EventContactInfoController.findMultipleOrganizersContact,
);

/**
 * POST /api/events/:eventId/find-organizer-contact
 * Find contact info for a single event organizer
 */
router.post(
  "/:eventId/find-organizer-contact",
  EventContactInfoController.findOrganizerContact,
);

/**
 * GET /api/events/:eventId/organizer-contact
 * Get cached organizer contact info
 */
router.get(
  "/:eventId/organizer-contact",
  EventContactInfoController.getOrganizerContactFromCache,
);

/**
 * POST /api/events/:eventId/organizer-contact/save
 * Save organizer contact info to cache
 */
router.post(
  "/:eventId/organizer-contact/save",
  EventContactInfoController.saveCachedOrganizerContact,
);

export default router;
