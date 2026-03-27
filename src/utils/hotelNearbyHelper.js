/**
 * Hotel Near Companies Helper
 * Quick utility functions for finding nearby companies
 */

import GooglePlacesService from "../services/googlePlacesService.js";
import CompanyImportService from "../services/companyImportService.js";
import { pool } from "../config/database.js";

/**
 * Initialize the hotel search system
 * @returns {Object} - {googlePlaces, companyImport, ...}
 */
export function initializeHotelSearch(googleApiKey) {
  const googlePlaces = new GooglePlacesService(googleApiKey);
  const companyImport = new CompanyImportService(googlePlaces);

  return {
    googlePlaces,
    companyImport,
    /**
     * Quick method: Search nearby companies for ANY hotel
     */
    async searchHotelNearby(hotelId, radiusKm = 100) {
      const hotelRes = await pool.query(
        `SELECT hv.id, hv.name, hv.lat, hv.lng
         FROM hotel_version hv
         WHERE hv.id = $1`,
        [hotelId],
      );

      if (hotelRes.rows.length === 0) {
        throw new Error(`Hotel ${hotelId} not found`);
      }

      const hotel = hotelRes.rows[0];
      const batchId = require("uuid").v4();

      return await companyImport.importCompaniesAroundHotel(
        hotelId,
        {
          name: hotel.name,
          lat: hotel.lat,
          lng: hotel.lng,
        },
        radiusKm,
        batchId,
      );
    },

    /**
     * Quick method: Get nearby companies with all details
     */
    async getNearbyCompanies(hotelId, radiusKm = 100, limit = 100) {
      return await companyImport.getCompaniesNearHotel(
        hotelId,
        radiusKm,
        limit,
      );
    },

    /**
     * Quick method: Get statistics for a hotel
     */
    async getHotelStats(hotelId) {
      return await companyImport.getStatistics(hotelId);
    },

    /**
     * Quick method: Get companies by industry
     */
    async getCompaniesByIndustry(hotelId, radiusKm = 100) {
      const result = await pool.query(
        `SELECT cv.industry, COUNT(DISTINCT c.id) as count,
                ROUND(AVG(hcp.distance_km)::NUMERIC, 2) as avg_distance
         FROM hotel_company_proximity hcp
         JOIN company_version cv ON hcp.company_version_id = cv.id
         JOIN company c ON cv.company_id = c.id
         WHERE hcp.hotel_version_id = $1
         AND hcp.distance_km <= $2
         GROUP BY cv.industry
         ORDER BY count DESC`,
        [hotelId, radiusKm],
      );
      return result.rows;
    },

    /**
     * Quick method: Search across all hotels
     */
    async searchAllHotels(radiusKm = 100) {
      const hotelsRes = await pool.query(
        `SELECT DISTINCT ON (h.id) hv.id, hv.name, hv.lat, hv.lng
         FROM hotel_version hv
         JOIN hotel h ON h.id = hv.hotel_id
         WHERE h.status = 'active'
         ORDER BY h.id`,
      );

      const results = [];
      for (const hotel of hotelsRes.rows) {
        try {
          const result = await this.searchHotelNearby(hotel.id, radiusKm);
          results.push({
            hotel: hotel.name,
            ...result,
          });
        } catch (err) {
          console.error(`Error searching ${hotel.name}:`, err.message);
        }
      }
      return results;
    },
  };
}

/**
 * Format companies for frontend display
 */
export function formatCompaniesForFrontend(companies) {
  return companies.map((c) => ({
    id: c.company_id,
    name: c.name,
    industry: c.industry,
    address: c.address,
    distance: {
      km: c.distance_km,
      miles: Math.round(c.distance_km * 0.621371 * 100) / 100,
    },
    location: {
      lat: c.lat,
      lng: c.lng,
    },
    contact: {
      phone: c.phone,
      website: c.website,
    },
    rating: c.rating,
  }));
}

/**
 * Create a heatmap data for Google Maps
 */
export function createHeatmapData(companies) {
  return companies.map((c) => ({
    location: {
      lat: c.lat,
      lng: c.lng,
    },
    weight: c.rating ? c.rating / 5 : 0.5, // Normalize rating as weight
  }));
}

/**
 * Create markers for Google Maps
 */
export function createMarkers(companies) {
  return companies.map((c, idx) => ({
    id: c.company_id,
    position: {
      lat: c.lat,
      lng: c.lng,
    },
    title: c.name,
    label: String(idx + 1),
    infoWindow: {
      content: `
        <div style="width: 200px;">
          <h3>${c.name}</h3>
          <p><strong>Industry:</strong> ${c.industry}</p>
          <p><strong>Distance:</strong> ${c.distance_km}km</p>
          <p><strong>Address:</strong> ${c.address}</p>
          ${c.phone ? `<p><strong>Phone:</strong> ${c.phone}</p>` : ""}
          ${c.website ? `<p><strong>Website:</strong> <a href="${c.website}" target="_blank">Link</a></p>` : ""}
          ${c.rating ? `<p><strong>Rating:</strong> ⭐ ${c.rating}/5</p>` : ""}
        </div>
      `,
    },
  }));
}

/**
 * Export data helper
 */
export function exportToCSV(companies, filename = "companies.csv") {
  const headers = [
    "Name",
    "Industry",
    "Distance (km)",
    "Address",
    "Phone",
    "Website",
    "Rating",
    "Latitude",
    "Longitude",
  ];

  const rows = companies.map((c) => [
    c.name,
    c.industry || "",
    c.distance_km || "",
    c.address || "",
    c.phone || "",
    c.website || "",
    c.rating || "",
    c.lat || "",
    c.lng || "",
  ]);

  // Create CSV content
  const csvContent = [
    headers.join(","),
    ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
  ].join("\n");

  return csvContent;
}

/**
 * Filter companies by criteria
 */
export function filterCompanies(companies, criteria) {
  let filtered = [...companies];

  if (criteria.minDistance !== undefined) {
    filtered = filtered.filter((c) => c.distance_km >= criteria.minDistance);
  }

  if (criteria.maxDistance !== undefined) {
    filtered = filtered.filter((c) => c.distance_km <= criteria.maxDistance);
  }

  if (criteria.industries && criteria.industries.length > 0) {
    filtered = filtered.filter((c) => criteria.industries.includes(c.industry));
  }

  if (criteria.minRating !== undefined) {
    filtered = filtered.filter((c) => c.rating >= criteria.minRating);
  }

  if (criteria.searchText) {
    const text = criteria.searchText.toLowerCase();
    filtered = filtered.filter(
      (c) =>
        c.name.toLowerCase().includes(text) ||
        c.address?.toLowerCase().includes(text),
    );
  }

  return filtered;
}

export default {
  initializeHotelSearch,
  formatCompaniesForFrontend,
  createHeatmapData,
  createMarkers,
  exportToCSV,
  filterCompanies,
};
