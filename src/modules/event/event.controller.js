/**
 * EVENT CONTROLLER
 */

import { EventService } from "./event.service.js";
import { EventResponseDto, EventDetailDto } from "./dto/event-response.dto.js";
import { createLogger } from "../../shared/utils/logger.js";

const logger = createLogger("EventController");

export class EventController {
  /**
   * POST /api/events
   */
  static async createEvent(req, res, next) {
    try {
      const event = await EventService.createEvent(req.body);
      const response = new EventResponseDto(event);

      res.status(201).json({
        success: true,
        data: response,
        message: "Event created successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/events/:id
   */
  static async getEvent(req, res, next) {
    try {
      const { id } = req.params;

      const event = await EventService.getEvent(id);
      const response = new EventResponseDto(event);

      res.json({
        success: true,
        data: response,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/events/:id/details
   */
  static async getEventDetails(req, res, next) {
    try {
      const { id } = req.params;

      const details = await EventService.getEventDetails(id);

      res.json({
        success: true,
        data: {
          event: new EventResponseDto(details.event),
          companies: details.companies.map((c) => ({
            id: c.id,
            name: c.name,
            role: c.role,
          })),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/events
   */
  static async listEvents(req, res, next) {
    try {
      const { name, event_type, status, limit = 20, offset = 0 } = req.query;

      const result = await EventService.searchEvents(
        { name, event_type, status },
        { limit: Math.min(parseInt(limit), 100), offset: parseInt(offset) },
      );

      const responses = result.events.map((e) => new EventResponseDto(e));

      res.json({
        success: true,
        data: responses,
        pagination: {
          limit: result.limit,
          offset: result.offset,
          total: result.total,
          hasMore: result.hasMore,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/events/nearby
   */
  static async getNearbyEvents(req, res, next) {
    try {
      const { lat, lng, radius = 50, limit = 20 } = req.query;

      const result = await EventService.findNearbyEvents(
        parseFloat(lat),
        parseFloat(lng),
        parseInt(radius),
        parseInt(limit),
      );

      const responses = result.events.map((e) => new EventResponseDto(e));

      res.json({
        success: true,
        data: responses,
        statistics: {
          total: responses.length,
          location: result.location,
          radiusKm: result.radiusKm,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/events/:id
   */
  static async updateEvent(req, res, next) {
    try {
      const { id } = req.params;

      const event = await EventService.updateEvent(id, req.body);
      const response = new EventResponseDto(event);

      res.json({
        success: true,
        data: response,
        message: "Event updated successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/events/:id
   */
  static async deleteEvent(req, res, next) {
    try {
      const { id } = req.params;

      await EventService.deleteEvent(id);

      res.json({
        success: true,
        message: "Event deleted successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/events/:id/archive
   */
  static async archiveEvent(req, res, next) {
    try {
      const { id } = req.params;

      const event = await EventService.archiveEvent(id);
      const response = new EventResponseDto(event);

      res.json({
        success: true,
        data: response,
        message: "Event archived successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/events/import
   */
  static async importEvents(req, res, next) {
    try {
      const { events } = req.body;

      if (!events || !Array.isArray(events)) {
        return res.status(400).json({
          success: false,
          error: {
            code: "INVALID_INPUT",
            message: "events array is required",
          },
        });
      }

      const result = await EventService.importEvents(events);

      res.status(201).json({
        success: true,
        data: {
          count: result.count,
          events: result.events.map((e) => new EventResponseDto(e)),
        },
        message: `${result.count} events imported successfully`,
      });
    } catch (error) {
      next(error);
    }
  }
}
