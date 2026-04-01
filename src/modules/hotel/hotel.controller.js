/**
 * HOTEL CONTROLLER
 *
 * HTTP request/response handling
 * - Parse request params
 * - Validate input
 * - Call service
 * - Format response using standardized response helpers
 */

import { HotelService } from "./hotel.service.js";
import { HotelResponseDto, HotelDetailDto } from "./dto/hotel-response.dto.js";
import { createLogger } from "../../shared/utils/logger.js";
import {
  sendSuccess,
  sendError,
  sendPaginatedSuccess,
  sendNotFound,
  sendValidationError,
} from "../../shared/utils/response.js";

const logger = createLogger("HotelController");

export class HotelController {
  /**
   * POST /api/hotels
   * Create a new hotel
   */
  static async createHotel(req, res, next) {
    try {
      const hotel = await HotelService.createHotel(req.body);
      const response = new HotelResponseDto(hotel);

      return sendSuccess(res, response, "Hotel created successfully", 201);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/hotels/:id
   * Get single hotel by ID
   */
  static async getHotel(req, res, next) {
    try {
      const { id } = req.params;

      const hotel = await HotelService.getHotel(id);
      if (!hotel) {
        return sendNotFound(res, `Hotel not found: ${id}`);
      }

      const response = new HotelResponseDto(hotel);
      return sendSuccess(res, response, "Hotel retrieved successfully");
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/hotels/:id/details
   * Get hotel with nearby companies and events
   */
  static async getHotelDetails(req, res, next) {
    try {
      const { id } = req.params;

      const details = await HotelService.getHotelDetails(id);
      if (!details || !details.hotel) {
        return sendNotFound(res, `Hotel not found: ${id}`);
      }

      const detailDto = {
        hotel: new HotelResponseDto(details.hotel),
        nearby_companies: details.companies.map((c) => ({
          id: c.id,
          name: c.name,
          address: c.address,
          distance_km: c.distance_km,
          relationship_type: c.relationship_type,
        })),
        nearby_events: details.events.map((e) => ({
          id: e.id,
          name: e.name,
          start_date: e.start_date,
          distance_km: e.distance_km,
        })),
      };

      return sendSuccess(
        res,
        detailDto,
        "Hotel details retrieved successfully",
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/hotels
   * List and search hotels with pagination (support both page/pageSize and offset/limit)
   */
  static async listHotels(req, res, next) {
    try {
      const {
        name,
        status,
        minRating,
        limit = 20,
        offset = 0,
        page,
        pageSize,
      } = req.query;

      // Parse and validate pagination parameters
      const pageNum = page ? Math.max(1, parseInt(page)) : 1;
      const pageSizeNum = Math.min(parseInt(pageSize || limit || 20), 100);
      const calculatedOffset = (pageNum - 1) * pageSizeNum;

      const result = await HotelService.searchHotels(
        {
          name,
          status,
          minRating: minRating ? parseFloat(minRating) : undefined,
        },
        {
          limit: pageSizeNum,
          offset: calculatedOffset,
        },
      );

      const responses = result.hotels.map((h) => new HotelResponseDto(h));
      const totalPages = Math.ceil(result.total / pageSizeNum);

      return sendPaginatedSuccess(
        res,
        responses,
        {
          page: pageNum,
          pageSize: pageSizeNum,
          total: result.total,
          totalPages,
        },
        "Hotels retrieved successfully",
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/hotels/nearby
   * Find nearby hotels by location
   */
  static async getNearbyHotels(req, res, next) {
    try {
      const { lat, lng, radius = 50, limit = 20 } = req.query;

      // Validate required parameters
      if (!lat || !lng) {
        return sendValidationError(
          res,
          "Missing required parameters: lat, lng",
          {
            example:
              "/api/hotels/nearby?lat=39.52&lng=-104.77&radius=50&limit=20",
          },
        );
      }

      const result = await HotelService.findNearbyHotels(
        parseFloat(lat),
        parseFloat(lng),
        parseInt(radius),
        parseInt(limit),
      );

      const responses = result.hotels.map((h) => new HotelResponseDto(h));

      const data = {
        items: responses,
        location: result.location,
        radiusKm: result.radiusKm,
        totalFound: responses.length,
      };

      return sendSuccess(res, data, "Nearby hotels retrieved successfully");
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/hotels/:id
   * Update hotel
   */
  static async updateHotel(req, res, next) {
    try {
      const { id } = req.params;

      const hotel = await HotelService.updateHotel(id, req.body);
      if (!hotel) {
        return sendNotFound(res, `Hotel not found: ${id}`);
      }

      const response = new HotelResponseDto(hotel);
      return sendSuccess(res, response, "Hotel updated successfully");
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/hotels/:id
   * Delete hotel
   */
  static async deleteHotel(req, res, next) {
    try {
      const { id } = req.params;

      await HotelService.deleteHotel(id);

      return sendSuccess(res, { id }, "Hotel deleted successfully");
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/hotels/:id/archive
   * Archive hotel (soft delete)
   */
  static async archiveHotel(req, res, next) {
    try {
      const { id } = req.params;

      const hotel = await HotelService.archiveHotel(id);
      if (!hotel) {
        return sendNotFound(res, `Hotel not found: ${id}`);
      }

      const response = new HotelResponseDto(hotel);
      return sendSuccess(res, response, "Hotel archived successfully");
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/hotels/import
   * Import multiple hotels
   */
  static async importHotels(req, res, next) {
    try {
      const { hotels, source_id } = req.body;

      if (!hotels || !Array.isArray(hotels)) {
        return sendValidationError(res, "Invalid request format", {
          required: ["hotels"],
          details: "hotels must be an array",
        });
      }

      if (hotels.length === 0) {
        return sendValidationError(res, "Hotels array cannot be empty");
      }

      const result = await HotelService.importHotels(hotels, source_id);

      const importData = {
        count: result.count,
        imported: result.hotels.map((h) => new HotelResponseDto(h)),
      };

      return sendSuccess(
        res,
        importData,
        `${result.count} hotels imported successfully`,
        201,
      );
    } catch (error) {
      next(error);
    }
  }
}
