/**
 * Hotel Repository V1
 * Thao tác với bảng hotel (versioning-aware)
 */

import { pool } from "../config/database.js";

class HotelRepository {
  /**
   * CREATE: Tạo khách sạn mới + tự động tạo version 1
   * @param {Object} data - {name, address, lat, lng, phone, email, website, rating, room_count, description}
   * @param {String} batchId - batch crawl id
   * @returns {Object} - {hotelId, versionId, version}
   */
  async createHotel(data, batchId) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // 1. Tạo record hotel
      const hotelRes = await client.query(
        `INSERT INTO hotel (status)
         VALUES ($1)
         RETURNING id`,
        ["active"],
      );
      const hotelId = hotelRes.rows[0].id;

      // 2. Tạo version 1
      const versionRes = await client.query(
        `INSERT INTO hotel_version (
          hotel_id, version, name, address, lat, lng,
          phone, email, website, rating, room_count,
          description, batch_id, data_quality_score, raw_data
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        RETURNING id, version`,
        [
          hotelId,
          1,
          data.name,
          data.address,
          data.lat,
          data.lng,
          data.phone,
          data.email,
          data.website,
          data.rating || null,
          data.room_count || null,
          data.description,
          batchId,
          data.data_quality_score || 0.9,
          JSON.stringify(data), // raw_data
        ],
      );
      const versionId = versionRes.rows[0].id;

      // 3. Cập nhật current_version_id
      await client.query(
        `UPDATE hotel SET current_version_id = $1 WHERE id = $2`,
        [versionId, hotelId],
      );

      // 4. Ghi change_log
      await client.query(
        `INSERT INTO change_log (entity_type, entity_id, change_type, new_values, batch_id)
         VALUES ($1, $2, $3, $4, $5)`,
        ["hotel", hotelId, "create", JSON.stringify(data), batchId],
      );

      await client.query("COMMIT");
      return { hotelId, versionId, version: 1 };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * UPDATE: Cập nhật khách sạn → tạo version mới
   * @param {String} hotelId
   * @param {String} batchId
   * @param {Object} newData
   * @returns {Object} - {hotelId, newVersionId, newVersion, changes}
   */
  async updateHotel(hotelId, batchId, newData) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // 1. Lấy phiên bản hiện tại
      const currentRes = await client.query(
        `SELECT hv.* FROM hotel_version hv
         JOIN hotel h ON h.current_version_id = hv.id
         WHERE h.id = $1`,
        [hotelId],
      );
      const current = currentRes.rows[0];

      // 2. Phát hiện thay đổi
      const changes = this._detectChanges(current, newData);
      if (Object.keys(changes).length === 0) {
        return { hotelId, noChanges: true };
      }

      // 3. Tạo version mới
      const newVersion = (current.version || 0) + 1;
      const versionRes = await client.query(
        `INSERT INTO hotel_version (
          hotel_id, version, name, address, lat, lng,
          phone, email, website, rating, room_count,
          description, batch_id, data_quality_score, raw_data
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        RETURNING id`,
        [
          hotelId,
          newVersion,
          newData.name || current.name,
          newData.address || current.address,
          newData.lat || current.lat,
          newData.lng || current.lng,
          newData.phone || current.phone,
          newData.email || current.email,
          newData.website || current.website,
          newData.rating || current.rating,
          newData.room_count || current.room_count,
          newData.description || current.description,
          batchId,
          newData.data_quality_score || current.data_quality_score,
          JSON.stringify({ ...current, ...newData }),
        ],
      );
      const newVersionId = versionRes.rows[0].id;

      // 4. Cập nhật current_version_id
      await client.query(
        `UPDATE hotel SET current_version_id = $1, updated_at = NOW() WHERE id = $2`,
        [newVersionId, hotelId],
      );

      // 5. Ghi hotel_change
      await client.query(
        `INSERT INTO hotel_change (hotel_id, from_version, to_version, changed_fields, confidence_score)
         VALUES ($1, $2, $3, $4, $5)`,
        [hotelId, current.version, newVersion, JSON.stringify(changes), 0.95],
      );

      // 6. Ghi change_log
      await client.query(
        `INSERT INTO change_log (entity_type, entity_id, change_type, old_values, new_values, batch_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          "hotel",
          hotelId,
          "update",
          JSON.stringify(current),
          JSON.stringify({ ...current, ...newData }),
          batchId,
        ],
      );

      await client.query("COMMIT");
      return { hotelId, newVersionId, newVersion, changes };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * READ: Lấy khách sạn hiện tại (version mới nhất)
   * @param {String} hotelId
   * @returns {Object}
   */
  async getHotelById(hotelId) {
    const res = await pool.query(
      `SELECT hv.* FROM hotel_version hv
       JOIN hotel h ON h.current_version_id = hv.id
       WHERE h.id = $1`,
      [hotelId],
    );
    return res.rows[0] || null;
  }

  /**
   * READ: Lấy lịch sử của khách sạn (tất cả versions)
   * @param {String} hotelId
   * @returns {Array}
   */
  async getHotelVersionHistory(hotelId) {
    const res = await pool.query(
      `SELECT * FROM hotel_version
       WHERE hotel_id = $1
       ORDER BY version ASC`,
      [hotelId],
    );
    return res.rows;
  }

  /**
   * READ: Lấy phiên bản cụ thể
   * @param {String} hotelId
   * @param {Number} version
   * @returns {Object}
   */
  async getHotelVersion(hotelId, version) {
    const res = await pool.query(
      `SELECT * FROM hotel_version
       WHERE hotel_id = $1 AND version = $2`,
      [hotelId, version],
    );
    return res.rows[0] || null;
  }

  /**
   * READ: Lấy danh sách thay đổi
   * @param {String} hotelId
   * @returns {Array}
   */
  async getHotelChanges(hotelId) {
    const res = await pool.query(
      `SELECT * FROM hotel_change
       WHERE hotel_id = $1
       ORDER BY from_version ASC`,
      [hotelId],
    );
    return res.rows;
  }

  /**
   * SEARCH: Tìm khách sạn theo tên
   * @param {String} term
   * @param {Number} limit
   * @returns {Array}
   */
  async searchHotelsByName(term, limit = 20) {
    const res = await pool.query(
      `SELECT DISTINCT ON (hotel_id) *
       FROM hotel_version
       WHERE name ILIKE $1
       ORDER BY hotel_id, version DESC
       LIMIT $2`,
      [`%${term}%`, limit],
    );
    return res.rows;
  }

  /**
   * SEARCH: Tìm khách sạn theo vị trí
   * @param {Number} lat, lng
   * @param {Number} radiusKm
   * @returns {Array}
   */
  async searchHotelsByLocation(lat, lng, radiusKm = 50) {
    const earthRadiusKm = 6371;
    const res = await pool.query(
      `SELECT DISTINCT ON (hotel_id) id, hotel_id, version, name, address, lat, lng, rating,
              (${earthRadiusKm} * acos(cos(radians($1)) * cos(radians(lat)) *
               cos(radians(lng) - radians($2)) + sin(radians($1)) * sin(radians(lat)))) AS distance_km
       FROM hotel_version
       WHERE (${earthRadiusKm} * acos(cos(radians($1)) * cos(radians(lat)) *
              cos(radians(lng) - radians($2)) + sin(radians($1)) * sin(radians(lat)))) <= $3
       ORDER BY hotel_id, version DESC, distance_km ASC`,
      [lat, lng, radiusKm],
    );
    return res.rows;
  }

  /**
   * RELATIONSHIP: Thêm nhân viên/khách ở khách sạn
   * @param {String} hotelVersionId
   * @param {String} personVersionId
   * @param {String} role
   * @returns {Object}
   */
  async addPersonToHotelVersion(
    hotelVersionId,
    personVersionId,
    role = "guest",
  ) {
    const res = await pool.query(
      `INSERT INTO hotel_person_version (hotel_version_id, person_version_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (hotel_version_id, person_version_id, role) DO NOTHING
       RETURNING id`,
      [hotelVersionId, personVersionId, role],
    );
    return res.rows[0] || null;
  }

  /**
   * RELATIONSHIP: Lấy nhân viên/khách ở khách sạn
   * @param {String} hotelId
   * @returns {Array}
   */
  async getPeopleAtHotel(hotelId) {
    const res = await pool.query(
      `SELECT DISTINCT ON (pv.person_id)
              pv.person_id, pv.first_name, pv.last_name, pv.email,
              hpv.role, hpv.start_date, hpv.end_date
       FROM hotel_person_version hpv
       JOIN person_version pv ON hpv.person_version_id = pv.id
       JOIN hotel_version hv ON hpv.hotel_version_id = hv.id
       WHERE hv.hotel_id = $1
       ORDER BY pv.person_id, pv.version DESC`,
      [hotelId],
    );
    return res.rows;
  }

  /**
   * DEDUP: Gộp khách sạn
   * @param {String} primaryId - cái được giữ
   * @param {Array} duplicateIds - cái bị gộp
   * @param {String} batchId
   * @returns {Object}
   */
  async mergeHotels(primaryId, duplicateIds, batchId) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // 1. Cập nhật status + merged_into_id
      await client.query(
        `UPDATE hotel SET status = 'merged', merged_into_id = $1, updated_at = NOW()
         WHERE id = ANY($2)`,
        [primaryId, duplicateIds],
      );

      // 2. Ghi dedup_log
      await client.query(
        `INSERT INTO dedup_log (entity_type, primary_id, merged_ids, match_score, batch_id)
         VALUES ($1, $2, $3, $4, $5)`,
        ["hotel", primaryId, duplicateIds, 0.95, batchId],
      );

      // 3. Ghi change_log cho mỗi
      for (const dupId of duplicateIds) {
        await client.query(
          `INSERT INTO change_log (entity_type, entity_id, change_type, new_values, batch_id)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            "hotel",
            dupId,
            "merge",
            JSON.stringify({ merged_into: primaryId }),
            batchId,
          ],
        );
      }

      await client.query("COMMIT");
      return { primaryId, mergedCount: duplicateIds.length };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * ARCHIVE: Xóa mềm khách sạn
   * @param {String} hotelId
   * @param {String} batchId
   * @param {String} reason
   * @returns {Boolean}
   */
  async archiveHotel(hotelId, batchId, reason = "archived") {
    const res = await pool.query(
      `UPDATE hotel SET status = 'archived', updated_at = NOW()
       WHERE id = $1
       RETURNING id`,
      [hotelId],
    );

    if (res.rows.length > 0) {
      await pool.query(
        `INSERT INTO change_log (entity_type, entity_id, change_type, new_values, batch_id)
         VALUES ($1, $2, $3, $4, $5)`,
        ["hotel", hotelId, "archive", JSON.stringify({ reason }), batchId],
      );
      return true;
    }
    return false;
  }

  /**
   * BATCH: Tạo nhiều khách sạn cùng lúc
   * @param {Array} dataArray
   * @param {String} batchId
   * @returns {Array}
   */
  async batchCreateHotels(dataArray, batchId) {
    const results = [];
    for (const data of dataArray) {
      try {
        const result = await this.createHotel(data, batchId);
        results.push({ ...result, success: true });
      } catch (err) {
        results.push({ data, error: err.message, success: false });
      }
    }
    return results;
  }

  /**
   * STATS: Lấy thống kê
   * @returns {Object}
   */
  async getHotelStats() {
    const res = await pool.query(
      `SELECT
        COUNT(DISTINCT h.id) as total_hotels,
        COUNT(DISTINCT CASE WHEN h.status = 'active' THEN h.id END) as active_hotels,
        COUNT(DISTINCT CASE WHEN h.status = 'merged' THEN h.id END) as merged_hotels,
        COUNT(DISTINCT CASE WHEN h.status = 'archived' THEN h.id END) as archived_hotels,
        AVG(hv.rating) as avg_rating,
        AVG(hv.data_quality_score) as avg_quality
       FROM hotel h
       LEFT JOIN hotel_version hv ON h.current_version_id = hv.id`,
    );
    return res.rows[0];
  }

  /**
   * HELPER: Phát hiện thay đổi
   */
  _detectChanges(oldData, newData) {
    const changes = {};
    const fields = [
      "name",
      "address",
      "lat",
      "lng",
      "phone",
      "email",
      "website",
      "rating",
      "room_count",
      "description",
    ];

    for (const field of fields) {
      if (newData[field] !== undefined && newData[field] !== oldData[field]) {
        changes[field] = { old: oldData[field], new: newData[field] };
      }
    }

    return changes;
  }
}

export default new HotelRepository();
