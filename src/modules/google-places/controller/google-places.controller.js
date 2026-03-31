/**
 * Google Places Controller
 * Handle HTTP requests for Google Places
 */

import { GooglePlacesBusinessService } from "../service/google-places.service.js";
import { GooglePlacesRepository } from "../repository/google-places.repository.js";
import GooglePlacesService from "../../../services/googlePlacesService.js";
import CompanyPersistenceService from "../../../services/companyPersistenceService.js";
import { createLogger } from "../../../shared/utils/logger.js";

const logger = createLogger("GooglePlacesController");

export class GooglePlacesController {
  /**
   * POST /search-companies - Basic search
   */
  static async searchCompanies(req, res) {
    try {
      const { lat, lng, radius_km = 100, hotel_name = "Location" } = req.body;

      if (!lat || !lng) {
        return res.status(400).json({
          success: false,
          error: "Missing required: lat, lng",
        });
      }

      // Get search results
      const result = await GooglePlacesBusinessService.searchCompanies(
        lat,
        lng,
        radius_km,
        hotel_name,
      );

      // Get or create hotel
      const hotelId = await GooglePlacesRepository.getOrCreateHotel(
        lat,
        lng,
        radius_km,
      );

      // Persist companies
      let persistenceResult = { saved: 0, skipped: 0, errors: 0 };

      if (result.companies.length > 0) {
        try {
          const companyPersistence = new CompanyPersistenceService(
            process.env.GOOGLE_PLACES_API_KEY,
          );

          const companiesToPersist = result.companies.map((c) => ({
            place_id: c.place_id,
            name: c.name,
            industry: c.industry,
            address: c.address,
            lat: c.location.lat,
            lng: c.location.lng,
            website: c.contact.website,
            email: c.contact.email,
            phone: c.contact.phone,
            url: c.contact.url,
            rating: c.rating,
            reviews_count: c.reviews_count,
            business_status: c.business_status,
            business_hours: c.contact.business_hours,
            types: c.types,
          }));

          const persistResult = await companyPersistence.persistCompanies(
            companiesToPersist,
            {
              enrichDetails: false,
              skipDuplicates: true,
              maxDetailsToEnrich: 50,
              source_id: "google_places_search",
            },
          );

          persistenceResult = {
            saved: persistResult.summary.total_saved,
            skipped: persistResult.summary.total_skipped,
            errors: persistResult.summary.total_errors,
            time_ms: persistResult.summary.time_ms,
          };
        } catch (persistError) {
          logger.warn(`Persistence error: ${persistError.message}`);
        }
      }

      return res.json({
        success: true,
        hotelId,
        location: { lat, lng, radius_km, name: hotel_name },
        total_found: result.allCompanies.length,
        total_in_radius: result.companies.length,
        companies: result.companies,
        database: persistenceResult,
        statistics: {
          ...result.stats,
          search_time_ms: result.searchTime,
        },
      });
    } catch (error) {
      logger.error(`Search error: ${error.message}`);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * GET /place-details/:place_id
   */
  static async getPlaceDetails(req, res) {
    try {
      const { place_id } = req.params;

      if (!place_id) {
        return res
          .status(400)
          .json({ success: false, error: "place_id required" });
      }

      const googlePlaces = new GooglePlacesService(
        process.env.GOOGLE_PLACES_API_KEY,
      );
      const details = await googlePlaces.getPlaceDetails(place_id);

      return res.json({ success: true, place: details });
    } catch (error) {
      logger.error(`Get place details error: ${error.message}`);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * POST /text-search
   */
  static async textSearch(req, res) {
    try {
      const { query: searchQuery, lat, lng } = req.body;

      if (!searchQuery || !lat || !lng) {
        return res.status(400).json({
          success: false,
          error: "Missing required: query, lat, lng",
        });
      }

      const googlePlaces = new GooglePlacesService(
        process.env.GOOGLE_PLACES_API_KEY,
      );
      const results = await googlePlaces.textSearch(searchQuery, lat, lng);

      return res.json({
        success: true,
        query: searchQuery,
        total_found: results.length,
        results,
      });
    } catch (error) {
      logger.error(`Text search error: ${error.message}`);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * POST /search-companies-by-keyword
   */
  static async searchByKeyword(req, res) {
    try {
      const {
        lat,
        lng,
        keyword,
        radius_km = 100,
        grid_radius_km = 50,
        limit = 1000,
      } = req.body;

      if (!lat || !lng || !keyword) {
        return res.status(400).json({
          success: false,
          error: "Missing required: lat, lng, keyword",
        });
      }

      const result = await GooglePlacesBusinessService.searchByKeyword(
        lat,
        lng,
        keyword,
        radius_km,
        grid_radius_km,
        limit,
      );

      return res.json({
        success: true,
        search_params: {
          keyword,
          location: { lat, lng },
          radius_km,
          limit,
        },
        results: {
          total_found: result.total_found,
          in_radius: result.in_radius,
          returned: result.companies.length,
          search_time_ms: result.searchTime,
        },
        companies: result.companies,
      });
    } catch (error) {
      logger.error(`Search by keyword error: ${error.message}`);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * GET /companies-by-hotel/:hotel_id
   */
  static async getCompaniesByHotel(req, res) {
    try {
      const { hotel_id } = req.params;
      const {
        keyword = "",
        sort = "distance",
        order = "ASC",
        limit = 20,
        page = 1,
        maxDistance = null,
      } = req.query;

      const pageLimit = Math.min(Math.max(1, parseInt(limit) || 20), 500);
      const pageNum = Math.max(1, parseInt(page) || 1);
      const pageOffset = (pageNum - 1) * pageLimit;

      const filters = {};
      if (keyword) filters.keyword = keyword;
      if (maxDistance) filters.maxDistance = parseFloat(maxDistance);

      const result = await GooglePlacesRepository.getCompaniesByHotel(
        hotel_id,
        pageLimit,
        pageOffset,
        filters,
      );

      // Apply sorting
      let companies = result.companies;
      if (sort === "rating") {
        companies = companies.sort(
          (a, b) =>
            ((b.rating || 0) - (a.rating || 0)) * (order === "DESC" ? 1 : -1),
        );
      } else if (sort === "name") {
        companies = companies.sort((a, b) =>
          order === "DESC"
            ? b.name.localeCompare(a.name)
            : a.name.localeCompare(b.name),
        );
      } else if (sort === "created_at") {
        companies = companies.sort((a, b) =>
          order === "DESC"
            ? new Date(b.created_at) - new Date(a.created_at)
            : new Date(a.created_at) - new Date(b.created_at),
        );
      }

      return res.json({
        hotel_id,
        companies,
        pagination: {
          page: pageNum,
          limit: pageLimit,
          total: result.total,
          totalPages: result.totalPages,
        },
        filters: {
          keyword,
          sort,
          order,
          maxDistance,
        },
      });
    } catch (error) {
      logger.error(`Get companies by hotel error: ${error.message}`);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * GET /companies/:companyId
   */
  static async getCompanyById(req, res) {
    try {
      const { companyId } = req.params;

      if (!companyId) {
        return res
          .status(400)
          .json({ success: false, error: "companyId required" });
      }

      const company = await GooglePlacesRepository.getCompanyById(companyId);

      if (!company) {
        return res.status(404).json({
          success: false,
          error: `Company not found: ${companyId}`,
        });
      }

      return res.json({ success: true, company });
    } catch (error) {
      logger.error(`Get company error: ${error.message}`);
      return res.status(500).json({ success: false, error: error.message });
    }
  }
}
