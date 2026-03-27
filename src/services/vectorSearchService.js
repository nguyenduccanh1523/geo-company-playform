import { query } from "../config/database.js";

/**
 * Tìm kiếm công ty tương tự theo semantic
 * @param {number[]} embedding - Vector embedding cần tìm kiếm
 * @param {number} limit - Số kết quả trả về (mặc định 10)
 * @param {number} threshold - Ngưỡng similarity (mặc định 0.5)
 * @returns {Promise<Object[]>} - Danh sách công ty tương tự
 */
export async function searchSimilarCompanies(
  embedding,
  limit = 10,
  threshold = 0.5,
) {
  const sql = `
    SELECT 
      c.id,
      c.name,
      c.industry,
      c.address,
      c.website,
      c.lat,
      c.lng,
      (1 - (cv.embedding <=> $1::vector)) as similarity
    FROM company_vector cv
    JOIN company c ON cv.company_id = c.id
    WHERE 1 - (cv.embedding <=> $1::vector) > $2
    ORDER BY cv.embedding <=> $1::vector
    LIMIT $3
  `;

  try {
    const result = await query(sql, [
      JSON.stringify(embedding),
      threshold,
      limit,
    ]);
    return result.rows;
  } catch (error) {
    console.error("Lỗi tìm kiếm công ty:", error.message);
    throw error;
  }
}

/**
 * Tìm kiếm sự kiện tương tự theo semantic
 * @param {number[]} embedding - Vector embedding cần tìm kiếm
 * @param {number} limit - Số kết quả trả về (mặc định 10)
 * @param {number} threshold - Ngưỡng similarity (mặc định 0.5)
 * @returns {Promise<Object[]>} - Danh sách sự kiện tương tự
 */
export async function searchSimilarEvents(
  embedding,
  limit = 10,
  threshold = 0.5,
) {
  const sql = `
    SELECT 
      e.id,
      e.name,
      e.description,
      e.location,
      e.start_date,
      e.end_date,
      e.lat,
      e.lng,
      (1 - (ev.embedding <=> $1::vector)) as similarity
    FROM event_vector ev
    JOIN event e ON ev.event_id = e.id
    WHERE 1 - (ev.embedding <=> $1::vector) > $2
    ORDER BY ev.embedding <=> $1::vector
    LIMIT $3
  `;

  try {
    const result = await query(sql, [
      JSON.stringify(embedding),
      threshold,
      limit,
    ]);
    return result.rows;
  } catch (error) {
    console.error("Lỗi tìm kiếm sự kiện:", error.message);
    throw error;
  }
}

/**
 * Tìm kiếm người tương tự theo semantic
 * @param {number[]} embedding - Vector embedding cần tìm kiếm
 * @param {number} limit - Số kết quả trả về (mặc định 10)
 * @param {number} threshold - Ngưỡng similarity (mặc định 0.5)
 * @returns {Promise<Object[]>} - Danh sách người tương tự
 */
export async function searchSimilarPersons(
  embedding,
  limit = 10,
  threshold = 0.5,
) {
  const sql = `
    SELECT 
      p.id,
      p.full_name,
      p.title,
      p.bio,
      p.linkedin_url,
      (1 - (pv.embedding <=> $1::vector)) as similarity
    FROM person_vector pv
    JOIN person p ON pv.person_id = p.id
    WHERE 1 - (pv.embedding <=> $1::vector) > $2
    ORDER BY pv.embedding <=> $1::vector
    LIMIT $3
  `;

  try {
    const result = await query(sql, [
      JSON.stringify(embedding),
      threshold,
      limit,
    ]);
    return result.rows;
  } catch (error) {
    console.error("Lỗi tìm kiếm người:", error.message);
    throw error;
  }
}

/**
 * Tìm kiếm mọi entity (công ty, sự kiện, người) theo semantic
 * @param {number[]} embedding - Vector embedding cần tìm kiếm
 * @param {number} limit - Số kết quả trả về (mặc định 10)
 * @param {number} threshold - Ngưỡng similarity (mặc định 0.5)
 * @returns {Promise<Object[]>} - Danh sách kết quả hỗn hợp
 */
export async function searchAllEntities(
  embedding,
  limit = 10,
  threshold = 0.5,
) {
  const companySql = `
    SELECT 
      'company'::text as entity_type,
      c.id as entity_id,
      c.name as title,
      c.industry as subtitle,
      (1 - (cv.embedding <=> $1::vector)) as similarity
    FROM company_vector cv
    JOIN company c ON cv.company_id = c.id
    WHERE 1 - (cv.embedding <=> $1::vector) > $2
  `;

  const eventSql = `
    SELECT 
      'event'::text as entity_type,
      e.id as entity_id,
      e.name as title,
      e.location as subtitle,
      (1 - (ev.embedding <=> $1::vector)) as similarity
    FROM event_vector ev
    JOIN event e ON ev.event_id = e.id
    WHERE 1 - (ev.embedding <=> $1::vector) > $2
  `;

  const personSql = `
    SELECT 
      'person'::text as entity_type,
      p.id as entity_id,
      p.full_name as title,
      p.title as subtitle,
      (1 - (pv.embedding <=> $1::vector)) as similarity
    FROM person_vector pv
    JOIN person p ON pv.person_id = p.id
    WHERE 1 - (pv.embedding <=> $1::vector) > $2
  `;

  const sql = `
    (${companySql})
    UNION ALL
    (${eventSql})
    UNION ALL
    (${personSql})
    ORDER BY similarity DESC
    LIMIT $3
  `;

  try {
    const result = await query(sql, [
      JSON.stringify(embedding),
      threshold,
      limit,
    ]);
    return result.rows;
  } catch (error) {
    console.error("Lỗi tìm kiếm toàn bộ entity:", error.message);
    throw error;
  }
}

/**
 * Tìm kiếm công ty theo khoảng cách địa lý
 * @param {number} lat - Vĩ độ
 * @param {number} lng - Kinh độ
 * @param {number} radiusKm - Bán kính tìm kiếm (km)
 * @param {number} limit - Số kết quả (mặc định 20)
 * @returns {Promise<Object[]>} - Danh sách công ty
 */
export async function searchCompaniesByLocation(
  lat,
  lng,
  radiusKm,
  limit = 20,
) {
  const sql = `
    SELECT 
      id,
      name,
      industry,
      address,
      website,
      lat,
      lng,
      (6371 * acos(cos(radians($1)) * cos(radians(lat)) * cos(radians(lng) - radians($2)) + sin(radians($1)) * sin(radians(lat)))) as distance_km
    FROM company
    WHERE 6371 * acos(cos(radians($1)) * cos(radians(lat)) * cos(radians(lng) - radians($2)) + sin(radians($1)) * sin(radians(lat))) < $3
    ORDER BY distance_km
    LIMIT $4
  `;

  try {
    const result = await query(sql, [lat, lng, radiusKm, limit]);
    return result.rows;
  } catch (error) {
    console.error("Lỗi tìm kiếm công ty theo vị trí:", error.message);
    throw error;
  }
}

/**
 * Tìm kiếm sự kiện theo khoảng cách địa lý
 * @param {number} lat - Vĩ độ
 * @param {number} lng - Kinh độ
 * @param {number} radiusKm - Bán kính tìm kiếm (km)
 * @param {number} limit - Số kết quả (mặc định 20)
 * @returns {Promise<Object[]>} - Danh sách sự kiện
 */
export async function searchEventsByLocation(lat, lng, radiusKm, limit = 20) {
  const sql = `
    SELECT 
      id,
      name,
      description,
      location,
      start_date,
      end_date,
      lat,
      lng,
      (6371 * acos(cos(radians($1)) * cos(radians(lat)) * cos(radians(lng) - radians($2)) + sin(radians($1)) * sin(radians(lat)))) as distance_km
    FROM event
    WHERE 6371 * acos(cos(radians($1)) * cos(radians(lat)) * cos(radians(lng) - radians($2)) + sin(radians($1)) * sin(radians(lat))) < $3
    ORDER BY distance_km
    LIMIT $4
  `;

  try {
    const result = await query(sql, [lat, lng, radiusKm, limit]);
    return result.rows;
  } catch (error) {
    console.error("Lỗi tìm kiếm sự kiện theo vị trí:", error.message);
    throw error;
  }
}

export default {
  searchSimilarCompanies,
  searchSimilarEvents,
  searchSimilarPersons,
  searchAllEntities,
  searchCompaniesByLocation,
  searchEventsByLocation,
};
