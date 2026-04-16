/**
 * EVENT SERVICE
 */

import { EventRepository } from "./event.repository.js";
import { CreateEventDto } from "./dto/create-event.dto.js";
import {
  BusinessException,
  NotFoundException,
} from "../../shared/exceptions/base.exception.js";
import { createLogger } from "../../shared/utils/logger.js";

const logger = createLogger("EventService");

export class EventService {
  /**
   * ✅ CREATE
   */
  static async createEvent(createEventDto) {
    try {
      logger.info(`Creating event: ${createEventDto.name}`);

      const validatedDto = CreateEventDto.from(createEventDto);

      const event = await EventRepository.create(validatedDto.toDatabase());

      logger.info(`Event created: ${event.id}`);
      return event;
    } catch (error) {
      logger.error(`Error creating event: ${error.message}`);
      throw error;
    }
  }

  /**
   * ✅ READ
   */
  static async getEvent(id) {
    try {
      const event = await EventRepository.findById(id);

      if (!event) {
        throw new NotFoundException("Event", `id: ${id}`);
      }

      return event;
    } catch (error) {
      logger.error(`Error getting event: ${error.message}`);
      throw error;
    }
  }

  static async searchEvents(
    filters = {},
    pagination = { limit: 20, offset: 0 },
  ) {
    try {
      logger.info(`Searching events with filters: ${JSON.stringify(filters)}`);

      const events = await EventRepository.findAll(filters, pagination);
      const total = await EventRepository.count(filters);

      return {
        events,
        total,
        limit: pagination.limit,
        offset: pagination.offset,
        hasMore: pagination.offset + pagination.limit < total,
      };
    } catch (error) {
      logger.error(`Error searching events: ${error.message}`);
      throw error;
    }
  }

  static async findNearbyEvents(lat, lng, radiusKm = 50, limit = 20) {
    try {
      if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
        throw new BusinessException(
          "INVALID_LOCATION",
          "Invalid latitude or longitude",
        );
      }

      if (radiusKm < 1 || radiusKm > 500) {
        throw new BusinessException(
          "INVALID_RADIUS",
          "Radius must be between 1 and 500 km",
        );
      }

      logger.info(
        `Finding events near: ${lat}, ${lng} (radius: ${radiusKm}km)`,
      );

      const events = await EventRepository.findNearby(
        lat,
        lng,
        radiusKm,
        limit,
      );

      return {
        location: { lat, lng },
        radiusKm,
        total: events.length,
        events,
      };
    } catch (error) {
      logger.error(`Error finding nearby events: ${error.message}`);
      throw error;
    }
  }

  /**
   * Find events by hotel ID
   */
  static async findEventsByHotel(
    hotelId,
    pagination = { page: 1, pageSize: 20 },
  ) {
    try {
      if (!hotelId) {
        throw new BusinessException("INVALID_HOTEL_ID", "Hotel ID is required");
      }

      logger.info(`Finding events for hotel: ${hotelId}`);

      // Convert page/pageSize to offset/limit
      const pageSize = Math.min(pagination.pageSize || 20, 100);
      const page = Math.max(pagination.page || 1, 1);
      const offset = (page - 1) * pageSize;

      const events = await EventRepository.findByHotel(hotelId, {
        limit: pageSize,
        offset,
      });
      const total = await EventRepository.countByHotel(hotelId);

      return {
        hotel_id: hotelId,
        events,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
          hasNextPage: page < Math.ceil(total / pageSize),
          hasPreviousPage: page > 1,
        },
      };
    } catch (error) {
      logger.error(`Error finding events by hotel: ${error.message}`);
      throw error;
    }
  }

  /**
   * ✅ UPDATE
   */
  static async updateEvent(id, updateData) {
    try {
      logger.info(`Updating event: ${id}`);

      const event = await EventRepository.findById(id);
      if (!event) {
        throw new NotFoundException("Event", `id: ${id}`);
      }

      const updated = await EventRepository.update(id, updateData);

      logger.info(`Event updated: ${id}`);
      return updated;
    } catch (error) {
      logger.error(`Error updating event: ${error.message}`);
      throw error;
    }
  }

  /**
   * ✅ DELETE
   */
  static async deleteEvent(id) {
    try {
      logger.info(`Deleting event: ${id}`);

      const event = await EventRepository.findById(id);
      if (!event) {
        throw new NotFoundException("Event", `id: ${id}`);
      }

      const success = await EventRepository.delete(id);

      if (!success) {
        throw new BusinessException("DELETE_FAILED", "Failed to delete event");
      }

      logger.info(`Event deleted: ${id}`);
      return true;
    } catch (error) {
      logger.error(`Error deleting event: ${error.message}`);
      throw error;
    }
  }

  /**
   * ✅ ARCHIVE
   */
  static async archiveEvent(id) {
    try {
      logger.info(`Archiving event: ${id}`);

      const event = await EventRepository.findById(id);
      if (!event) {
        throw new NotFoundException("Event", `id: ${id}`);
      }

      const updated = await EventRepository.archive(id);

      logger.info(`Event archived: ${id}`);
      return updated;
    } catch (error) {
      logger.error(`Error archiving event: ${error.message}`);
      throw error;
    }
  }

  /**
   * ✅ BULK IMPORT
   */
  static async importEvents(events) {
    try {
      if (!Array.isArray(events) || events.length === 0) {
        throw new BusinessException(
          "INVALID_INPUT",
          "Events array is required and must not be empty",
        );
      }

      logger.info(`Importing ${events.length} events`);

      const imported = await EventRepository.bulkCreate(events);

      logger.info(`Successfully imported ${imported.length} events`);
      return {
        count: imported.length,
        events: imported,
      };
    } catch (error) {
      logger.error(`Error importing events: ${error.message}`);
      throw error;
    }
  }

  /**
   * ✅ GET EVENT DETAILS
   */
  static async getEventDetails(id) {
    try {
      const event = await EventRepository.findById(id);
      if (!event) {
        throw new NotFoundException("Event", `id: ${id}`);
      }

      const companies = await EventRepository.getCompanies(id);

      return {
        event,
        companies,
      };
    } catch (error) {
      logger.error(`Error getting event details: ${error.message}`);
      throw error;
    }
  }
}
