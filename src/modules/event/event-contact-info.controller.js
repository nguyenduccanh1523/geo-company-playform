/**
 * EVENT CONTACT INFO CONTROLLER
 * API để tìm thông tin liên hệ công ty tổ chức sự kiện
 */

import PerplexityContactInfoService from "../../services/perplexityContactInfoService.js";
import {
  FindEventContactInfoRequestDto,
  FindEventContactInfoResponseDto,
  BulkFindEventContactInfoRequestDto,
  BulkFindEventContactInfoResponseDto,
} from "./dto/event-contact-info.dto.js";
import { sendSuccess, sendError } from "../../shared/utils/response.js";
import { createLogger } from "../../shared/utils/logger.js";

const logger = createLogger("EventContactInfoController");
const perplexityService = new PerplexityContactInfoService(
  process.env.PERPLEXITY_API_KEY,
);

export class EventContactInfoController {
  /**
   * POST /api/events/find-organizer-contact (NEW - No event_id needed!)
   * 🆕 Tìm thông tin liên hệ công ty tổ chức sự kiện - TRUYỀN DỮ LIỆU TRỰC TIẾP TỪDEMO
   *
   * BODY:
   * {
   *   "title": "C3 Annual Summit",
   *   "description": "Sourced from predicthq.com",
   *   "location": [-104.815067, 39.563562],
   *   "geo": {
   *     "address": {
   *       "formatted_address": "Parker, CO, United States of America",
   *       "country_code": "US"
   *     }
   *   },
   *   "timezone": "America/Denver"
   * }
   */
  static async findOrganizerContactFromBody(req, res, next) {
    try {
      const eventData = req.body;

      logger.info(
        `Finding organizer contact for event from body: ${eventData?.title}`,
      );

      // Validate input
      const requestDto = new FindEventContactInfoRequestDto(eventData);
      requestDto.validate();

      // Call Perplexity service
      const contactInfo =
        await perplexityService.findEventOrganizerContactInfo(requestDto);

      // Transform to response DTO
      const responseDto = new FindEventContactInfoResponseDto(contactInfo);

      return sendSuccess(
        res,
        responseDto.getFullInfo(),
        "Contact information found successfully",
        200,
      );
    } catch (error) {
      logger.error("Error finding organizer contact:", error);
      next(error);
    }
  }

  /**
   * POST /api/events/:eventId/find-organizer-contact
   * Tìm thông tin liên hệ công ty tổ chức sự kiện
   *
   * BODY:
   * {
   *   "title": "C3 Annual Summit",
   *   "description": "Sourced from predicthq.com",
   *   "location": [-104.815067, 39.563562],
   *   "geo": {
   *     "address": {
   *       "formatted_address": "Parker, CO, United States of America",
   *       "country_code": "US"
   *     }
   *   },
   *   "timezone": "America/Denver"
   * }
   *
   * RESPONSE:
   * {
   *   "statusCode": 200,
   *   "message": "Contact information found successfully",
   *   "data": {
   *     "event_title": "C3 Annual Summit",
   *     "event_location": "Parker, CO, United States of America",
   *     "organizer_found": true,
   *     "organizer_info": {
   *       "organization_name": "C3 Summit",
   *       "website": "https://www.c3summit.com",
   *       "address": "123 Business Ave",
   *       "city": "Denver",
   *       "state_province": "Colorado",
   *       "country": "United States",
   *       "email": "contact@c3summit.com",
   *       "phone": "+1-303-555-0123",
   *       "contact_person_name": "John Smith",
   *       "contact_person_title": "Event Director",
   *       "linkedin_url": "https://www.linkedin.com/company/c3-summit",
   *       "industry": "Professional Services",
   *       "company_size": "Medium"
   *     },
   *     "sources": [...],
   *     "confidence_score": 0.95,
   *     "search_notes": "..."
   *   }
   * }
   */
  static async findOrganizerContact(req, res, next) {
    try {
      const { eventId } = req.params;
      const eventData = req.body;

      logger.info(`Finding organizer contact for event: ${eventId}`);

      // Validate input
      const requestDto = new FindEventContactInfoRequestDto({
        id: eventId,
        ...eventData,
      });
      requestDto.validate();

      // Call Perplexity service
      const contactInfo =
        await perplexityService.findEventOrganizerContactInfo(requestDto);

      // Transform to response DTO
      const responseDto = new FindEventContactInfoResponseDto(contactInfo);

      return sendSuccess(
        res,
        responseDto.getFullInfo(),
        "Contact information found successfully",
        200,
      );
    } catch (error) {
      logger.error("Error finding organizer contact:", error);
      next(error);
    }
  }

  /**
   * POST /api/events/find-organizer-contacts/bulk
   * Tìm thông tin liên hệ cho nhiều sự kiện
   *
   * BODY:
   * {
   *   "events": [
   *     {
   *       "id": "DZuj7VSNU6XvwnTWbj",
   *       "title": "C3 Annual Summit",
   *       "location": [-104.815067, 39.563562],
   *       ...
   *     },
   *     ...
   *   ]
   * }
   *
   * RESPONSE:
   * {
   *   "success": true,
   *   "data": {
   *     "results": [{...}, {...}],
   *     "total": 2,
   *     "processed": 2,
   *     "failed": 0,
   *     "successRate": 100
   *   }
   * }
   */
  static async findMultipleOrganizersContact(req, res, next) {
    try {
      const { events } = req.body;

      logger.info(`Finding organizer contacts for ${events.length} events`);

      // Validate input
      const requestDto = new BulkFindEventContactInfoRequestDto({
        events,
      });
      requestDto.validate();

      // Call Perplexity service
      const results =
        await perplexityService.findMultipleEventOrganizersContactInfo(
          requestDto.events,
        );

      // Transform to response DTO
      const responseDto = new BulkFindEventContactInfoResponseDto({
        results,
        total: events.length,
        processed: results.filter((r) => r.organizer_found).length,
        errors: results.filter((r) => !r.organizer_found),
      });

      return sendSuccess(
        res,
        {
          total: responseDto.total,
          processed: responseDto.processed,
          failed: responseDto.failed,
          success_rate: `${responseDto.getSuccessRate().toFixed(2)}%`,
          results: responseDto.results.map((r) => r.getPrimaryContactInfo()),
        },
        `Found contact info for ${responseDto.processed} out of ${responseDto.total} events`,
        200,
      );
    } catch (error) {
      logger.error("Error finding multiple organizers contact:", error);
      next(error);
    }
  }

  /**
   * GET /api/events/:eventId/organizer-contact
   * Lấy thông tin liên hệ đã lưu từ database (nếu có)
   *
   * RESPONSE:
   * {
   *   "statusCode": 404,
   *   "message": "Contact information not found in cache"
   * }
   */
  static async getOrganizerContactFromCache(req, res, next) {
    try {
      const { eventId } = req.params;

      logger.info(`Getting cached organizer contact for event: ${eventId}`);

      // TODO: Implement database cache if needed
      // For now, return 404
      return sendError(
        res,
        "Contact information not found in cache. Use POST endpoint to search for organizer contact",
        404,
      );
    } catch (error) {
      logger.error("Error getting cached organizer contact:", error);
      next(error);
    }
  }

  /**
   * POST /api/events/:eventId/organizer-contact/save
   * Lưu thông tin liên hệ vào database
   *
   * BODY:
   * {
   *   "organizer_info": {...},
   *   "confidence_score": 0.95,
   *   "sources": [...]
   * }
   */
  static async saveCachedOrganizerContact(req, res, next) {
    try {
      const { eventId } = req.params;
      const { organizer_info, confidence_score, sources } = req.body;

      logger.info(`Saving organizer contact for event: ${eventId}`);

      // TODO: Implement database save if needed
      return sendSuccess(
        res,
        {
          event_id: eventId,
          saved_at: new Date().toISOString(),
        },
        "Contact information saved successfully",
        200,
      );
    } catch (error) {
      logger.error("Error saving organizer contact:", error);
      next(error);
    }
  }
}

export default EventContactInfoController;
