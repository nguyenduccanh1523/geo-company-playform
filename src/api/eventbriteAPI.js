/**
 * Eventbrite API Routes/Middleware Integration
 * Tích hợp tìm sự kiện vào Express.js API
 */

import EventbriteService from "../services/eventbriteService.js";
import { pool } from "../config/database.js";
import { v4 as uuidv4 } from "uuid";

export class EventbriteAPI {
  constructor(eventbriteAccessToken) {
    this.eventbrite = new EventbriteService(eventbriteAccessToken);
  }

  /**
   * Express.js Route Handler
   * POST /api/companies/:companyId/find-events
   *
   * Tìm sự kiện liên quan đến công ty
   *
   * Request Body:
   * {
   *   "keywords": ["technology", "networking"],  // optional
   *   "location": "Ho Chi Minh",                // optional, default Vietnam
   *   "radius": 50,                              // km, optional
   *   "startDate": "2026-01-01",               // optional
   *   "endDate": "2027-01-01",                 // optional
   *   "limit": 50                               // optional, default 50
   * }
   *
   * Example:
   * curl -X POST http://localhost:3000/api/companies/company-123/find-events \
   *   -H "Content-Type: application/json" \
   *   -d '{
   *     "keywords": ["tech", "conference"],
   *     "location": "Vietnam",
   *     "limit": 20
   *   }'
   */
  async handleFindCompanyEvents(req, res) {
    try {
      const { companyId } = req.params;
      const {
        keywords = [],
        location = "Vietnam",
        radius,
        startDate,
        endDate,
        limit = 50,
      } = req.body;

      // 1. Get company info from database
      const companyRes = await pool.query(
        `SELECT id, name, lat, lng FROM company WHERE id = $1 LIMIT 1`,
        [companyId],
      );

      if (companyRes.rows.length === 0) {
        return res.status(404).json({ error: "Company not found" });
      }

      const company = companyRes.rows[0];

      // 2. Search events using Eventbrite
      const searchParams = {
        companyName: company.name,
        keywords,
        location,
        ...(company.lat &&
          company.lng &&
          radius && {
            lat: company.lat,
            lng: company.lng,
            radius,
          }),
        ...(startDate && { startDate: new Date(startDate) }),
        ...(endDate && { endDate: new Date(endDate) }),
        limit,
      };

      console.log(`🔍 Finding events for company: ${company.name}`);
      const eventResults =
        await this.eventbrite.searchEventsByCompany(searchParams);

      // 3. Save events to database (optional)
      const savedEvents = await this._saveEventsToDatabase(
        eventResults.events,
        companyId,
      );

      return res.json({
        company: {
          id: company.id,
          name: company.name,
        },
        searchParams: searchParams,
        results: {
          totalEvents: eventResults.totalEvents,
          events: savedEvents,
          metadata: eventResults.metadata,
        },
      });
    } catch (error) {
      console.error("Error in handleFindCompanyEvents:", error);
      return res.status(500).json({
        error: "Failed to search events",
        message: error.message,
      });
    }
  }

  /**
   * EXPRESS ROUTE
   * POST /api/events/search-by-location
   *
   * Tìm sự kiện theo vị trí địa lý
   */
  async handleSearchEventsByLocation(req, res) {
    try {
      const {
        lat,
        lng,
        radius = 50,
        startDate,
        endDate,
        limit = 50,
      } = req.body;

      if (!lat || !lng) {
        return res.status(400).json({
          error: "Missing required fields: lat, lng",
        });
      }

      console.log(`🔍 Finding events near (${lat}, ${lng})`);

      const searchParams = {
        lat,
        lng,
        radius,
        ...(startDate && { startDate: new Date(startDate) }),
        ...(endDate && { endDate: new Date(endDate) }),
        limit,
      };

      const eventResults =
        await this.eventbrite.searchEventsByLocation(searchParams);

      // Save events to database
      const savedEvents = await this._saveEventsToDatabase(eventResults.events);

      return res.json({
        searchParams,
        results: {
          totalEvents: eventResults.totalEvents,
          events: savedEvents,
          metadata: eventResults.metadata,
        },
      });
    } catch (error) {
      console.error("Error in handleSearchEventsByLocation:", error);
      return res.status(500).json({
        error: "Failed to search events",
        message: error.message,
      });
    }
  }

  /**
   * EXPRESS ROUTE
   * POST /api/events/search
   *
   * Generic event search endpoint
   */
  async handleSearchEvents(req, res) {
    try {
      const {
        query,
        keywords = [],
        location = "Vietnam",
        lat,
        lng,
        radius,
        startDate,
        endDate,
        limit = 50,
      } = req.body;

      if (!query && keywords.length === 0) {
        return res.status(400).json({
          error: "Missing required fields: query or keywords",
        });
      }

      const searchParams = {
        companyName: query || keywords[0],
        keywords: [...keywords, ...(query ? [query] : [])],
        location,
        ...(lat &&
          lng && {
            lat,
            lng,
            radius,
          }),
        ...(startDate && { startDate: new Date(startDate) }),
        ...(endDate && { endDate: new Date(endDate) }),
        limit,
      };

      const eventResults =
        await this.eventbrite.searchEventsByCompany(searchParams);

      // Save to database
      const savedEvents = await this._saveEventsToDatabase(eventResults.events);

      return res.json({
        searchParams,
        results: {
          totalEvents: eventResults.totalEvents,
          events: savedEvents,
          metadata: eventResults.metadata,
        },
      });
    } catch (error) {
      console.error("Error in handleSearchEvents:", error);
      return res.status(500).json({
        error: "Failed to search events",
        message: error.message,
      });
    }
  }

  /**
   * EXPRESS ROUTE
   * GET /api/events/:eventbriteId
   *
   * Get event details by Eventbrite ID
   */
  async handleGetEventDetails(req, res) {
    try {
      const { eventbriteId } = req.params;

      console.log(`📌 Getting details for event: ${eventbriteId}`);

      const eventDetails = await this.eventbrite.getEventDetails(eventbriteId);

      // Try to get from database first
      const dbEvent = await pool.query(
        `SELECT * FROM event WHERE source_id = $1 LIMIT 1`,
        [eventbriteId],
      );

      const result = {
        eventbriteData: eventDetails,
        databaseRecord: dbEvent.rows[0] || null,
      };

      return res.json(result);
    } catch (error) {
      console.error("Error in handleGetEventDetails:", error);
      return res.status(500).json({
        error: "Failed to get event details",
        message: error.message,
      });
    }
  }

  /**
   * Save events to database
   * @private
   */
  async _saveEventsToDatabase(events, companyId = null) {
    if (!events || events.length === 0) {
      return [];
    }

    const savedEvents = [];

    for (const event of events) {
      try {
        // Check if event already exists
        const existing = await pool.query(
          `SELECT id FROM event WHERE source_id = $1 LIMIT 1`,
          [event.id],
        );

        if (existing.rows.length > 0) {
          // Update existing
          const updateSql = `
            UPDATE event SET
              name = $2,
              description = $3,
              start_date = $4,
              end_date = $5,
              location = $6,
              lat = $7,
              lng = $8,
              updated_at = NOW()
            WHERE id = $1
            RETURNING *
          `;

          const result = await pool.query(updateSql, [
            existing.rows[0].id,
            event.name,
            event.description,
            event.startDate,
            event.endDate,
            event.venue?.name || null,
            event.venue?.latitude || null,
            event.venue?.longitude || null,
          ]);

          savedEvents.push(result.rows[0]);
        } else {
          // Insert new
          const insertSql = `
            INSERT INTO event (
              id, name, description, start_date, end_date, 
              location, lat, lng, source, source_id, external_id,
              created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
            ON CONFLICT (source_id) DO UPDATE SET
              updated_at = NOW()
            RETURNING *
          `;

          const result = await pool.query(insertSql, [
            uuidv4(),
            event.name,
            event.description,
            event.startDate,
            event.endDate,
            event.venue?.name || null,
            event.venue?.latitude || null,
            event.venue?.longitude || null,
            "eventbrite",
            event.id,
            event.id,
          ]);

          savedEvents.push(result.rows[0]);
        }

        // Link to company if provided
        if (companyId && existing.rows[0]) {
          await pool.query(
            `INSERT INTO company_event (company_id, event_id, created_at)
             VALUES ($1, $2, NOW())
             ON CONFLICT DO NOTHING`,
            [companyId, existing.rows[0].id],
          );
        }
      } catch (error) {
        console.warn(
          `Warning: Failed to save event ${event.name}: ${error.message}`,
        );
      }
    }

    return savedEvents.map((e) => ({
      id: e.id,
      name: e.name,
      startDate: e.start_date,
      endDate: e.end_date,
      location: e.location,
    }));
  }
}

export default EventbriteAPI;
