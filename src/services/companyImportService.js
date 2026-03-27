/**
 * Company Import Service
 * Nhập công ty từ Google Places vào database
 * Liên kết với khách sạn qua proximity table
 */

import { pool } from "../config/database.js";
import GooglePlacesService from "./googlePlacesService.js";

class CompanyImportService {
  constructor(googlePlacesService) {
    this.googlePlaces = googlePlacesService;
  }

  /**
   * Tìm công ty gần khách sạn từ Google Places
   * Lưu vào database và cập nhật proximity
   *
   * @param {String} hotelVersionId - Hotel version ID
   * @param {Object} hotelData - {lat, lng, name}
   * @param {Number} radiusKm - Bán kính tìm kiếm (default 100km)
   * @param {String} batchId - Batch ID cho tracking
   * @returns {Object} - {imported, linked, errors}
   */
  async importCompaniesAroundHotel(
    hotelVersionId,
    hotelData,
    radiusKm = 100,
    batchId,
  ) {
    const client = await pool.connect();
    let imported = 0;
    let linked = 0;
    let errors = [];

    try {
      await client.query("BEGIN");

      // 1. Lấy công ty từ Google Places
      console.log(
        `🔍 Searching for companies around "${hotelData.name}" (${radiusKm}km)...`,
      );
      const businesses = await this.googlePlaces.searchNearbyBusinesses(
        hotelData.name,
        hotelData.lat,
        hotelData.lng,
        ["company", "establishment", "point_of_interest"],
        radiusKm * 1000, // Convert to meters
      );

      console.log(
        `✅ Found ${businesses.length} businesses from Google Places`,
      );

      // 2. Xử lý từng company
      for (const business of businesses) {
        try {
          // Kiểm tra xem company đã tồn tại không (theo place_id)
          const existRes = await client.query(
            `SELECT id FROM company WHERE google_place_id = $1 LIMIT 1`,
            [business.place_id],
          );

          let companyId;
          let versionId;

          if (existRes.rows.length > 0) {
            // Company đã tồn tại, lấy ID
            companyId = existRes.rows[0].id;

            // Kiểm tra version mới
            const currentVersionRes = await client.query(
              `SELECT cv.id FROM company_version cv
               JOIN company c ON c.current_version_id = cv.id
               WHERE c.id = $1`,
              [companyId],
            );

            if (currentVersionRes.rows.length > 0) {
              versionId = currentVersionRes.rows[0].id;
            }
          } else {
            // Tạo company mới
            const newCompanyRes = await client.query(
              `INSERT INTO company (status, google_place_id)
               VALUES ($1, $2)
               RETURNING id`,
              ["active", business.place_id],
            );
            companyId = newCompanyRes.rows[0].id;

            // Tạo version đầu tiên
            const newVersionRes = await client.query(
              `INSERT INTO company_version (
                company_id, version, name, address, lat, lng,
                phone, email, website, industry, batch_id, data_quality_score, raw_data
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
              RETURNING id`,
              [
                companyId,
                1,
                business.name,
                business.address,
                business.lat,
                business.lng,
                business.phone,
                business.website,
                business.website,
                this._categorizeIndustry(business.types),
                batchId,
                0.8, // Data quality score from Google Places
                JSON.stringify(business.raw_data),
              ],
            );
            versionId = newVersionRes.rows[0].id;

            // Cập nhật current_version_id
            await client.query(
              `UPDATE company SET current_version_id = $1 WHERE id = $2`,
              [versionId, companyId],
            );

            imported++;
          }

          // 3. Tính khoảng cách và lưu vào proximity table
          const distance = this._calculateDistance(
            hotelData.lat,
            hotelData.lng,
            business.lat,
            business.lng,
          );

          // Kiểm tra xem relationship đã tồn tại không
          const proximityRes = await client.query(
            `SELECT id FROM hotel_company_proximity
             WHERE hotel_version_id = $1 AND company_version_id = $2`,
            [hotelVersionId, versionId],
          );

          if (proximityRes.rows.length > 0) {
            // Update
            await client.query(
              `UPDATE hotel_company_proximity
               SET distance_km = $1, last_updated = NOW()
               WHERE hotel_version_id = $2 AND company_version_id = $3`,
              [distance.distance_km, hotelVersionId, versionId],
            );
          } else {
            // Insert
            await client.query(
              `INSERT INTO hotel_company_proximity (
                hotel_version_id, company_version_id, distance_km, bearing
              )
              VALUES ($1, $2, $3, $4)`,
              [
                hotelVersionId,
                versionId,
                distance.distance_km,
                distance.bearing,
              ],
            );
            linked++;
          }
        } catch (err) {
          errors.push({
            business: business.name,
            error: err.message,
          });
          console.error(
            `❌ Error importing company "${business.name}":`,
            err.message,
          );
        }
      }

      // Log transaction
      await client.query(
        `INSERT INTO change_log (entity_type, entity_id, change_type, new_values, batch_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          "hotel",
          hotelVersionId.split("-")[0], // Extract hotel ID
          "google_places_import",
          JSON.stringify({
            imported,
            linked,
            total_found: businesses.length,
            radius_km: radiusKm,
          }),
          batchId,
        ],
      );

      await client.query("COMMIT");

      return {
        imported,
        linked,
        total_found: businesses.length,
        errors,
        status: "success",
      };
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("Error in importCompaniesAroundHotel:", err.message);
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Tính khoảng cách và bearing giữa 2 điểm (Haversine formula)
   * @private
   */
  _calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Bán kính trái đất (km)
    const dLat = this._toRad(lat2 - lat1);
    const dLon = this._toRad(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this._toRad(lat1)) *
        Math.cos(this._toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance_km = R * c;

    // Tính bearing
    const y = Math.sin(dLon) * Math.cos(this._toRad(lat2));
    const x =
      Math.cos(this._toRad(lat1)) * Math.sin(this._toRad(lat2)) -
      Math.sin(this._toRad(lat1)) *
        Math.cos(this._toRad(lat2)) *
        Math.cos(dLon);
    const bearing = (Math.atan2(y, x) * 180) / Math.PI + 360;

    return {
      distance_km: Math.round(distance_km * 100) / 100,
      bearing: Math.round(bearing * 100) / 100,
    };
  }

  /**
   * Convert độ sang radian
   * @private
   */
  _toRad(deg) {
    return (deg * Math.PI) / 180;
  }

  /**
   * Phân loại ngành nghề từ Google Places types
   * @private
   */
  _categorizeIndustry(types = []) {
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

    return "Services"; // Default
  }

  /**
   * Lấy danh sách công ty gần khách sạn (đã import)
   * @param {String} hotelVersionId
   * @param {Number} radiusKm
   * @param {Number} limit
   * @returns {Array}
   */
  async getCompaniesNearHotel(hotelVersionId, radiusKm = 100, limit = 100) {
    const res = await pool.query(
      `SELECT hcp.distance_km, hcp.bearing,
              c.id as company_id, c.google_place_id,
              cv.version, cv.name, cv.industry, cv.address,
              cv.lat, cv.lng, cv.phone, cv.website, cv.rating
       FROM hotel_company_proximity hcp
       JOIN company_version cv ON hcp.company_version_id = cv.id
       JOIN company c ON cv.company_id = c.id
       WHERE hcp.hotel_version_id = $1
       AND hcp.distance_km <= $2
       ORDER BY hcp.distance_km ASC
       LIMIT $3`,
      [hotelVersionId, radiusKm, limit],
    );
    return res.rows;
  }

  /**
   * Thống kê công ty gần khách sạn
   * @param {String} hotelVersionId
   */
  async getStatistics(hotelVersionId) {
    const res = await pool.query(
      `SELECT 
        COUNT(DISTINCT c.id) as total_companies,
        COUNT(DISTINCT CASE WHEN hcp.distance_km <= 10 THEN c.id END) as within_10km,
        COUNT(DISTINCT CASE WHEN hcp.distance_km <= 25 THEN c.id END) as within_25km,
        COUNT(DISTINCT CASE WHEN hcp.distance_km <= 50 THEN c.id END) as within_50km,
        ROUND(AVG(hcp.distance_km)::NUMERIC, 2) as avg_distance,
        ROUND(MIN(hcp.distance_km)::NUMERIC, 2) as min_distance,
        ROUND(MAX(hcp.distance_km)::NUMERIC, 2) as max_distance,
        COUNT(DISTINCT cv.industry) as industries_count
       FROM hotel_company_proximity hcp
       JOIN company_version cv ON hcp.company_version_id = cv.id
       JOIN company c ON cv.company_id = c.id
       WHERE hcp.hotel_version_id = $1`,
      [hotelVersionId],
    );
    return res.rows[0];
  }
}

export default CompanyImportService;
