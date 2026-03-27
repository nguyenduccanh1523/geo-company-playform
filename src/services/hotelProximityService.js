/**
 * Hotel Proximity Service
 * Tìm công ty gần khách sạn (100km radius)
 */

import { pool } from "../config/database.js";

class HotelProximityService {
  /**
   * Tìm công ty gần khách sạn
   * @param {String} hotelVersionId - hotel version
   * @param {Number} radiusKm - bán kính tìm kiếm (default 100km)
   * @returns {Array} - danh sách công ty với khoảng cách
   */
  async findCompaniesNearHotel(hotelVersionId, radiusKm = 100) {
    const res = await pool.query(
      `SELECT hcp.distance_km, hcp.bearing,
              c.id as company_id, cv.version, cv.name, cv.industry,
              cv.address, cv.lat, cv.lng, cv.phone, cv.email, cv.website
       FROM hotel_company_proximity hcp
       JOIN company_version cv ON hcp.company_version_id = cv.id
       JOIN company c ON cv.company_id = c.id
       WHERE hcp.hotel_version_id = $1
       AND hcp.distance_km <= $2
       ORDER BY hcp.distance_km ASC`,
      [hotelVersionId, radiusKm],
    );
    return res.rows;
  }

  /**
   * Cập nhật proximity (sau khi crawl)
   * Tính khoảng cách từ hotel tới tất cả company
   * @param {String} hotelVersionId
   * @param {String} batchId
   * @param {Number} radiusKm - chỉ lưu các công ty trong radius này
   * @returns {Object} - {inserted, updated, total}
   */
  async updateProximityForHotel(hotelVersionId, batchId, radiusKm = 100) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // 1. Lấy lat/lng của hotel
      const hotelRes = await client.query(
        `SELECT lat, lng FROM hotel_version WHERE id = $1`,
        [hotelVersionId],
      );
      const hotel = hotelRes.rows[0];
      if (!hotel || !hotel.lat || !hotel.lng) {
        throw new Error("Hotel không có lat/lng");
      }

      // 2. Lấy tất cả company versions (current)
      const companiesRes = await client.query(
        `SELECT DISTINCT ON (c.id) cv.id as company_version_id, cv.lat, cv.lng
         FROM company c
         JOIN company_version cv ON c.current_version_id = cv.id
         WHERE c.status = 'active' AND cv.lat IS NOT NULL AND cv.lng IS NOT NULL`,
      );

      let inserted = 0;
      let updated = 0;

      // 3. Tính distance & bearing cho mỗi company
      for (const company of companiesRes.rows) {
        const { distance_km, bearing } = this._calculateDistance(
          hotel.lat,
          hotel.lng,
          company.lat,
          company.lng,
        );

        // Chỉ lưu nếu trong radius
        if (distance_km <= radiusKm) {
          const existRes = await client.query(
            `SELECT id FROM hotel_company_proximity
             WHERE hotel_version_id = $1 AND company_version_id = $2`,
            [hotelVersionId, company.company_version_id],
          );

          if (existRes.rows.length > 0) {
            // Update
            await client.query(
              `UPDATE hotel_company_proximity
               SET distance_km = $1, bearing = $2
               WHERE hotel_version_id = $3 AND company_version_id = $4`,
              [
                distance_km,
                bearing,
                hotelVersionId,
                company.company_version_id,
              ],
            );
            updated++;
          } else {
            // Insert
            await client.query(
              `INSERT INTO hotel_company_proximity (hotel_version_id, company_version_id, distance_km, bearing)
               VALUES ($1, $2, $3, $4)`,
              [
                hotelVersionId,
                company.company_version_id,
                distance_km,
                bearing,
              ],
            );
            inserted++;
          }
        }
      }

      // 4. Ghi log
      await client.query(
        `INSERT INTO change_log (entity_type, entity_id, change_type, new_values, batch_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          "hotel_proximity",
          hotelVersionId,
          "update",
          JSON.stringify({ inserted, updated, radiusKm }),
          batchId,
        ],
      );

      await client.query("COMMIT");
      return { inserted, updated, total: inserted + updated };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Batch update proximity cho nhiều hotel
   * @param {Array} hotelVersionIds
   * @param {String} batchId
   * @param {Number} radiusKm
   * @returns {Array}
   */
  async batchUpdateProximity(hotelVersionIds, batchId, radiusKm = 100) {
    const results = [];
    for (const hotelVersionId of hotelVersionIds) {
      try {
        const result = await this.updateProximityForHotel(
          hotelVersionId,
          batchId,
          radiusKm,
        );
        results.push({ hotelVersionId, ...result, success: true });
      } catch (err) {
        results.push({ hotelVersionId, error: err.message, success: false });
      }
    }
    return results;
  }

  /**
   * Tìm khách sạn gần công ty (reverse)
   * @param {String} companyVersionId
   * @param {Number} radiusKm
   * @returns {Array}
   */
  async findHotelsNearCompany(companyVersionId, radiusKm = 100) {
    const res = await pool.query(
      `SELECT hcp.distance_km, hcp.bearing,
              h.id as hotel_id, hv.version, hv.name, hv.address,
              hv.lat, hv.lng, hv.phone, hv.rating, hv.room_count
       FROM hotel_company_proximity hcp
       JOIN hotel_version hv ON hcp.hotel_version_id = hv.id
       JOIN hotel h ON hv.hotel_id = h.id
       WHERE hcp.company_version_id = $1
       AND hcp.distance_km <= $2
       ORDER BY hcp.distance_km ASC`,
      [companyVersionId, radiusKm],
    );
    return res.rows;
  }

  /**
   * Tìm công ty & khách sạn gần nhất (mutual)
   * @param {Number} lat, lng
   * @param {Number} radiusKm
   * @returns {Object} - {companies, hotels}
   */
  async findNearbyEntities(lat, lng, radiusKm = 50) {
    const earthRadiusKm = 6371;
    const distanceFormula = `
      (${earthRadiusKm} * acos(cos(radians($1)) * cos(radians(lat)) *
       cos(radians(lng) - radians($2)) + sin(radians($1)) * sin(radians(lat))))
    `;

    // Tìm công ty
    const companiesRes = await pool.query(
      `SELECT DISTINCT ON (c.id) c.id as company_id, cv.version, cv.name, cv.industry, cv.address,
              cv.lat, cv.lng, cv.phone,
              ${distanceFormula} AS distance_km
       FROM company c
       JOIN company_version cv ON c.current_version_id = cv.id
       WHERE c.status = 'active'
       AND ${distanceFormula} <= $3
       ORDER BY c.id, cv.version DESC, distance_km ASC
       LIMIT 20`,
      [lat, lng, radiusKm],
    );

    // Tìm khách sạn
    const hotelsRes = await pool.query(
      `SELECT DISTINCT ON (h.id) h.id as hotel_id, hv.version, hv.name, hv.address,
              hv.lat, hv.lng, hv.rating, hv.room_count,
              ${distanceFormula} AS distance_km
       FROM hotel h
       JOIN hotel_version hv ON h.current_version_id = hv.id
       WHERE h.status = 'active'
       AND ${distanceFormula} <= $3
       ORDER BY h.id, hv.version DESC, distance_km ASC
       LIMIT 20`,
      [lat, lng, radiusKm],
    );

    return {
      companies: companiesRes.rows,
      hotels: hotelsRes.rows,
      searchRadius: radiusKm,
    };
  }

  /**
   * Thống kê proximity
   * @param {String} hotelVersionId (optional)
   * @returns {Object}
   */
  async getProximityStats(hotelVersionId = null) {
    let query = `
      SELECT
        COUNT(*) as total_proximity,
        COUNT(DISTINCT hotel_version_id) as hotels_with_companies,
        COUNT(DISTINCT company_version_id) as companies_linked,
        AVG(distance_km) as avg_distance,
        MIN(distance_km) as min_distance,
        MAX(distance_km) as max_distance
      FROM hotel_company_proximity
    `;
    const params = [];

    if (hotelVersionId) {
      query += ` WHERE hotel_version_id = $1`;
      params.push(hotelVersionId);
    }

    const res = await pool.query(query, params);
    return res.rows[0];
  }

  /**
   * HELPER: Tính khoảng cách & hướng Haversine
   * @param {Number} lat1, lng1 - hotel
   * @param {Number} lat2, lng2 - company
   * @returns {Object} - {distance_km, bearing}
   */
  _calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371; // Earth radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    // Tính bearing
    const y = Math.sin(dLng) * Math.cos((lat2 * Math.PI) / 180);
    const x =
      Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
      Math.sin((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.cos(dLng);
    const bearing = (Math.atan2(y, x) * 180) / Math.PI;
    const normalizedBearing = (bearing + 360) % 360;

    return {
      distance_km: Math.round(distance * 100) / 100,
      bearing: Math.round(normalizedBearing),
    };
  }
}

export default new HotelProximityService();
