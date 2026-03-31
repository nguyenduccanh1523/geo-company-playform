/**
 * HOTEL SERVICE
 *
 * Business logic layer
 */

import { HotelRepository } from "./hotel.repository.js";
import { CreateHotelDto } from "./dto/create-hotel.dto.js";
import {
  BusinessException,
  NotFoundException,
} from "../../shared/exceptions/base.exception.js";
import { createLogger } from "../../shared/utils/logger.js";

const logger = createLogger("HotelService");

export class HotelService {
  /**
   * ✅ CREATE
   */
  static async createHotel(createHotelDto) {
    try {
      logger.info(`Creating hotel: ${createHotelDto.name}`);

      const validatedDto = CreateHotelDto.from(createHotelDto);

      const hotel = await HotelRepository.create(validatedDto.toDatabase());

      logger.info(`Hotel created: ${hotel.id}`);
      return hotel;
    } catch (error) {
      logger.error(`Error creating hotel: ${error.message}`);
      throw error;
    }
  }

  /**
   * ✅ READ
   */
  static async getHotel(id) {
    try {
      const hotel = await HotelRepository.findById(id);

      if (!hotel) {
        throw new NotFoundException("Hotel", `id: ${id}`);
      }

      return hotel;
    } catch (error) {
      logger.error(`Error getting hotel: ${error.message}`);
      throw error;
    }
  }

  static async searchHotels(
    filters = {},
    pagination = { limit: 20, offset: 0, page: null, pageSize: null },
  ) {
    try {
      logger.info(`Searching hotels with filters: ${JSON.stringify(filters)}`);

      // Support both offset/limit and page/pageSize
      let finalLimit = pagination.limit || 20;
      let finalOffset = pagination.offset || 0;

      // If page/pageSize are provided, convert to offset/limit
      if (pagination.page && pagination.pageSize) {
        const pageNum = Math.max(1, parseInt(pagination.page) || 1);
        const pageSizeNum = Math.min(
          Math.max(1, parseInt(pagination.pageSize) || 20),
          500,
        );
        finalLimit = pageSizeNum;
        finalOffset = (pageNum - 1) * pageSizeNum;
      }

      const hotels = await HotelRepository.findAll(filters, {
        limit: finalLimit,
        offset: finalOffset,
      });
      const total = await HotelRepository.count(filters);

      // Calculate pagination info for both styles
      const page = Math.floor(finalOffset / finalLimit) + 1;
      const totalPages = Math.ceil(total / finalLimit);

      return {
        hotels,
        total,
        limit: finalLimit,
        offset: finalOffset,
        page,
        pageSize: finalLimit,
        totalPages,
        hasMore: finalOffset + finalLimit < total,
      };
    } catch (error) {
      logger.error(`Error searching hotels: ${error.message}`);
      throw error;
    }
  }

  static async findNearbyHotels(lat, lng, radiusKm = 50, limit = 20) {
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
        `Finding hotels near: ${lat}, ${lng} (radius: ${radiusKm}km)`,
      );

      const hotels = await HotelRepository.findNearby(
        lat,
        lng,
        radiusKm,
        limit,
      );

      return {
        location: { lat, lng },
        radiusKm,
        total: hotels.length,
        hotels,
      };
    } catch (error) {
      logger.error(`Error finding nearby hotels: ${error.message}`);
      throw error;
    }
  }

  /**
   * ✅ UPDATE
   */
  static async updateHotel(id, updateData) {
    try {
      logger.info(`Updating hotel: ${id}`);

      const hotel = await HotelRepository.findById(id);
      if (!hotel) {
        throw new NotFoundException("Hotel", `id: ${id}`);
      }

      const updated = await HotelRepository.update(id, updateData);

      logger.info(`Hotel updated: ${id}`);
      return updated;
    } catch (error) {
      logger.error(`Error updating hotel: ${error.message}`);
      throw error;
    }
  }

  /**
   * ✅ DELETE
   */
  static async deleteHotel(id) {
    try {
      logger.info(`Deleting hotel: ${id}`);

      const hotel = await HotelRepository.findById(id);
      if (!hotel) {
        throw new NotFoundException("Hotel", `id: ${id}`);
      }

      const success = await HotelRepository.delete(id);

      if (!success) {
        throw new BusinessException("DELETE_FAILED", "Failed to delete hotel");
      }

      logger.info(`Hotel deleted: ${id}`);
      return true;
    } catch (error) {
      logger.error(`Error deleting hotel: ${error.message}`);
      throw error;
    }
  }

  /**
   * ✅ ARCHIVE
   */
  static async archiveHotel(id) {
    try {
      logger.info(`Archiving hotel: ${id}`);

      const hotel = await HotelRepository.findById(id);
      if (!hotel) {
        throw new NotFoundException("Hotel", `id: ${id}`);
      }

      const updated = await HotelRepository.archive(id);

      logger.info(`Hotel archived: ${id}`);
      return updated;
    } catch (error) {
      logger.error(`Error archiving hotel: ${error.message}`);
      throw error;
    }
  }

  /**
   * ✅ BULK IMPORT
   */
  static async importHotels(hotels, sourceId) {
    try {
      if (!Array.isArray(hotels) || hotels.length === 0) {
        throw new BusinessException(
          "INVALID_INPUT",
          "Hotels array is required and must not be empty",
        );
      }

      logger.info(`Importing ${hotels.length} hotels from source ${sourceId}`);

      const imported = await HotelRepository.bulkCreate(hotels);

      logger.info(`Successfully imported ${imported.length} hotels`);
      return {
        count: imported.length,
        hotels: imported,
      };
    } catch (error) {
      logger.error(`Error importing hotels: ${error.message}`);
      throw error;
    }
  }

  /**
   * ✅ GET HOTEL DETAILS WITH RELATED DATA
   */
  static async getHotelDetails(id) {
    try {
      const hotel = await HotelRepository.findById(id);
      if (!hotel) {
        throw new NotFoundException("Hotel", `id: ${id}`);
      }

      const companies = await HotelRepository.getNearbyCompanies(id);
      const events = await HotelRepository.getNearbyEvents(id);

      return {
        hotel,
        companies,
        events,
      };
    } catch (error) {
      logger.error(`Error getting hotel details: ${error.message}`);
      throw error;
    }
  }
}
