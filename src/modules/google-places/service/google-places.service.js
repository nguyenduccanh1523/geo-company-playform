/**
 * Google Places Service
 * Business logic for Google Places operations
 */

import GooglePlacesService from "../../../services/googlePlacesService.js";
import { GooglePlacesRepository } from "../repository/google-places.repository.js";
import { createLogger } from "../../../shared/utils/logger.js";

const logger = createLogger("GooglePlacesBusinessService");

export class GooglePlacesBusinessService {
  /**
   * Calculate distance between two coordinates (km)
   */
  static calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c * 100) / 100;
  }

  /**
   * Categorize company by types
   */
  static categorizeIndustry(types = []) {
    const typeString = (types || []).join(",").toLowerCase();

    if (typeString.includes("hotel") || typeString.includes("lodging")) {
      return "Accommodation";
    }
    if (
      typeString.includes("restaurant") ||
      typeString.includes("cafe") ||
      typeString.includes("food")
    ) {
      return "Food & Beverage";
    }
    if (typeString.includes("store") || typeString.includes("shopping")) {
      return "Retail";
    }
    if (
      typeString.includes("bank") ||
      typeString.includes("finance") ||
      typeString.includes("atm")
    ) {
      return "Finance";
    }
    if (typeString.includes("doctor") || typeString.includes("hospital")) {
      return "Healthcare";
    }
    if (typeString.includes("school") || typeString.includes("university")) {
      return "Education";
    }
    if (typeString.includes("park") || typeString.includes("museum")) {
      return "Tourism";
    }

    return "Services";
  }

  /**
   * Format search result
   */
  static formatCompany(business, lat, lng) {
    const distance = this.calculateDistance(
      lat,
      lng,
      business.lat,
      business.lng,
    );
    return {
      place_id: business.place_id,
      name: business.name,
      industry: this.categorizeIndustry(business.types),
      address: business.address,
      location: {
        lat: business.lat,
        lng: business.lng,
      },
      distance_km: distance,
      contact: {
        phone: business.phone || "N/A",
        website: business.website || "N/A",
        url: business.url || "N/A",
        email: business.email || "N/A",
        contact_person: business.contact_person || null,
        contact_person_phone: business.contact_person_phone || null,
        business_hours: business.opening_hours || "N/A",
      },
      rating: business.rating || null,
      reviews_count: business.user_ratings_total || 0,
      business_status: business.business_status || "OPERATIONAL",
      types: business.types,
    };
  }

  /**
   * Search companies - Basic
   */
  static async searchCompanies(lat, lng, radiusKm, hotelName) {
    try {
      logger.info(
        `🔍 Searching companies around ${hotelName} (${lat}, ${lng})`,
      );

      // Calculate grid radius
      let gridRadiusKm;
      if (radiusKm > 80) {
        gridRadiusKm = 50;
      } else if (radiusKm >= 40) {
        gridRadiusKm = 25;
      } else {
        gridRadiusKm = 10;
      }

      const startTime = Date.now();
      const googlePlaces = new GooglePlacesService(
        process.env.GOOGLE_PLACES_API_KEY,
      );

      // Search
      const businesses = await googlePlaces.searchNearbyBusinesses(
        hotelName,
        lat,
        lng,
        ["company", "establishment", "point_of_interest"],
        radiusKm * 1000,
        gridRadiusKm * 1000,
      );

      // Enrich
      const enrichedBusinesses =
        await googlePlaces.enrichPlacesWithContactDetails(businesses, 30);

      // Format
      const companies = enrichedBusinesses
        .map((b) => this.formatCompany(b, lat, lng))
        .sort((a, b) => a.distance_km - b.distance_km);

      // Filter by radius
      const companiesInRadius = companies.filter(
        (c) => c.distance_km <= radiusKm,
      );

      const searchTime = Date.now() - startTime;

      logger.info(
        `✅ Found ${companiesInRadius.length} companies within radius`,
      );

      return {
        companies: companiesInRadius,
        allCompanies: companies,
        searchTime,
        stats: this.calculateStats(companiesInRadius),
      };
    } catch (error) {
      logger.error(`Error searching companies: ${error.message}`);
      throw error;
    }
  }

  /**
   * Search companies by keyword
   */
  static async searchByKeyword(
    lat,
    lng,
    keyword,
    radiusKm,
    gridRadiusKm,
    limit,
  ) {
    try {
      logger.info(`🔍 Searching by keyword: "${keyword}" at (${lat}, ${lng})`);

      const startTime = Date.now();
      const googlePlaces = new GooglePlacesService(
        process.env.GOOGLE_PLACES_API_KEY,
      );

      const businesses = await googlePlaces.searchNearbyBusinesses(
        keyword,
        lat,
        lng,
        [],
        radiusKm * 1000,
        gridRadiusKm * 1000,
      );

      const enrichedBusinesses =
        await googlePlaces.enrichPlacesWithContactDetails(businesses, 30);

      const companies = enrichedBusinesses
        .map((b) => this.formatCompany(b, lat, lng))
        .sort((a, b) => (b.rating || 0) - (a.rating || 0));

      const companiesInRadius = companies.filter(
        (c) => c.distance_km <= radiusKm,
      );

      const finalResults = companiesInRadius.slice(0, limit);
      const searchTime = Date.now() - startTime;

      logger.info(`✅ Found ${finalResults.length} companies`);

      return {
        companies: finalResults,
        total_found: companies.length,
        in_radius: companiesInRadius.length,
        searchTime,
      };
    } catch (error) {
      logger.error(`Error searching by keyword: ${error.message}`);
      throw error;
    }
  }

  /**
   * Save single company
   */
  static async saveSingleCompany(
    company,
    lat,
    lng,
    searchRadius,
    hotelId = null,
  ) {
    try {
      // Validate
      if (
        !company.name ||
        !company.address ||
        company.lat === undefined ||
        company.lng === undefined
      ) {
        logger.warn(`⚠️  Skip ${company.name}: missing required fields`);
        return { success: false };
      }

      // Check radius
      const distance = this.calculateDistance(
        lat,
        lng,
        company.lat,
        company.lng,
      );
      if (distance > searchRadius) {
        logger.debug(
          `❌ FILTERED OUT: "${company.name}" | Distance: ${distance}km > ${searchRadius}km`,
        );
        return { success: false, error: "OUT_OF_RADIUS" };
      }

      // Check if exists
      const exists = await GooglePlacesRepository.checkCompanyExists(
        company.place_id,
      );
      if (exists) {
        logger.debug(`✅ DUPLICATE: ${company.name} already in DB`);
        return { success: false, error: "DUPLICATE" };
      }

      // Save company
      const companyId = await GooglePlacesRepository.saveCompany(company);
      logger.info(`✅ Saved: ${company.name} (ID: ${companyId})`);

      // Create hotel relationship if hotelId provided
      if (hotelId) {
        await GooglePlacesRepository.createHotelCompanyLink(
          hotelId,
          companyId,
          distance,
        );
      }

      return { success: true, companyId, hotelId };
    } catch (error) {
      logger.error(`Error saving company: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Calculate statistics
   */
  static calculateStats(companies) {
    if (companies.length === 0) {
      return {
        within_10km: 0,
        within_25km: 0,
        within_50km: 0,
        within_100km: 0,
        within_500km: 0,
        avg_distance: 0,
        min_distance: 0,
        max_distance: 0,
      };
    }

    return {
      within_10km: companies.filter((c) => c.distance_km <= 10).length,
      within_25km: companies.filter((c) => c.distance_km <= 25).length,
      within_50km: companies.filter((c) => c.distance_km <= 50).length,
      within_100km: companies.filter((c) => c.distance_km <= 100).length,
      within_500km: companies.filter((c) => c.distance_km <= 500).length,
      avg_distance: (
        companies.reduce((sum, c) => sum + c.distance_km, 0) / companies.length
      ).toFixed(2),
      min_distance: companies[0].distance_km,
      max_distance: companies[companies.length - 1].distance_km,
    };
  }
}
