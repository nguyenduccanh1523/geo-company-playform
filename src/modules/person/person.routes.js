/**
 * PERSON ROUTES
 */

import express from "express";
import { PersonController } from "./person.controller.js";

const router = express.Router();

/**
 * POST /api/people
 * Create person
 */
router.post("/", PersonController.createPerson);

/**
 * GET /api/people
 * List people with filtering
 */
router.get("/", PersonController.listPeople);

/**
 * POST /api/people/import
 * Bulk import people
 */
router.post("/import", PersonController.importPeople);

/**
 * GET /api/people/by-email/:email
 * Get person by email - MUST BE BEFORE /:id ROUTE!
 */
router.get("/by-email/:email", PersonController.getByEmail);

/**
 * GET /api/people/:id
 * Get person details
 */
router.get("/:id", PersonController.getPerson);

/**
 * GET /api/people/:id/details
 * Get person with related companies
 */
router.get("/:id/details", PersonController.getPersonDetails);

/**
 * PUT /api/people/:id
 * Update person
 */
router.put("/:id", PersonController.updatePerson);

/**
 * DELETE /api/people/:id
 * Delete person
 */
router.delete("/:id", PersonController.deletePerson);

/**
 * POST /api/people/:id/archive
 * Archive person (soft delete)
 */
router.post("/:id/archive", PersonController.archivePerson);

export default router;
