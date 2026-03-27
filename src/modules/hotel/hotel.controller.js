/**
 * HOTEL CONTROLLER
 */

import { HotelService } from "./hotel.service.js";
import { HotelResponseDto, HotelDetailDto } from "./dto/hotel-response.dto.js";
import { createLogger } from "../../shared/utils/logger.js";

const logger = createLogger("HotelController");

export class HotelController {
  /**
   * POST /api/hotels
   */
  static async createHotel(req, res, next) {
    try {
      const hotel = await HotelService.createHotel(req.body);
      const response = new HotelResponseDto(hotel);

      res.status(201).json({
        success: true,
        data: response,
        message: "Hotel created successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/hotels/:id
   */
  static async getHotel(req, res, next) {
    try {
      const { id } = req.params;

      const hotel = await HotelService.getHotel(id);
      const response = new HotelResponseDto(hotel);

      res.json({
        success: true,
        data: response,
      });
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

      res.json({
        success: true,
        data: {
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
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/hotels
   */
  static async listHotels(req, res, next) {
    try {
      const { name, status, minRating, limit = 20, offset = 0 } = req.query;

      const result = await HotelService.searchHotels(
        {
          name,
          status,
          minRating: minRating ? parseFloat(minRating) : undefined,
        },
        { limit: Math.min(parseInt(limit), 100), offset: parseInt(offset) },
      );

      const responses = result.hotels.map((h) => new HotelResponseDto(h));

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
   * GET /api/hotels/nearby
   */
  static async getNearbyHotels(req, res, next) {
    try {
      const { lat, lng, radius = 50, limit = 20 } = req.query;

      const result = await HotelService.findNearbyHotels(
        parseFloat(lat),
        parseFloat(lng),
        parseInt(radius),
        parseInt(limit),
      );

      const responses = result.hotels.map((h) => new HotelResponseDto(h));

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
   * PUT /api/hotels/:id
   */
  static async updateHotel(req, res, next) {
    try {
      const { id } = req.params;

      const hotel = await HotelService.updateHotel(id, req.body);
      const response = new HotelResponseDto(hotel);

      res.json({
        success: true,
        data: response,
        message: "Hotel updated successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/hotels/:id
   */
  static async deleteHotel(req, res, next) {
    try {
      const { id } = req.params;

      await HotelService.deleteHotel(id);

      res.json({
        success: true,
        message: "Hotel deleted successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/hotels/:id/archive
   */
  static async archiveHotel(req, res, next) {
    try {
      const { id } = req.params;

      const hotel = await HotelService.archiveHotel(id);
      const response = new HotelResponseDto(hotel);

      res.json({
        success: true,
        data: response,
        message: "Hotel archived successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/hotels/import
   */
  static async importHotels(req, res, next) {
    try {
      const { hotels, source_id } = req.body;

      if (!hotels || !Array.isArray(hotels)) {
        return res.status(400).json({
          success: false,
          error: {
            code: "INVALID_INPUT",
            message: "hotels array is required",
          },
        });
      }

      const result = await HotelService.importHotels(hotels, source_id);

      res.status(201).json({
        success: true,
        data: {
          count: result.count,
          hotels: result.hotels.map((h) => new HotelResponseDto(h)),
        },
        message: `${result.count} hotels imported successfully`,
      });
    } catch (error) {
      next(error);
    }
  }
}
