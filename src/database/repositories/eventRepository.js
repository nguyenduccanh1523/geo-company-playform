import { query } from "../../config/database.js";
import { v4 as uuidv4 } from "uuid";
import {
  generateEmbedding,
  chunkText,
  prepareEventText,
} from "../../services/embeddingService.js";

/**
 * Tạo sự kiện mới và lưu vector embedding
 */
export async function createEvent(eventData) {
  const client = await query.getClient();

  try {
    await client.query("BEGIN");

    const id = uuidv4();
    const now = new Date();

    // Thêm sự kiện
    const createSql = `
      INSERT INTO event (
        id, name, description, start_date, end_date, location, 
        lat, lng, source, source_id, external_id, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
      ) RETURNING *
    `;

    const eventResult = await client.query(createSql, [
      id,
      eventData.name,
      eventData.description,
      eventData.start_date,
      eventData.end_date,
      eventData.location,
      eventData.lat,
      eventData.lng,
      eventData.source,
      eventData.source_id,
      eventData.external_id,
      now,
      now,
    ]);

    const event = eventResult.rows[0];

    // Tạo embedding
    const text = prepareEventText(event);
    const chunks = chunkText(text);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = await generateEmbedding(chunk);

      const vectorSql = `
        INSERT INTO event_vector (
          id, event_id, embedding, text_chunk, chunk_index, metadata, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8
        )
      `;

      const metadata = {
        type: "event",
        event_id: event.id,
        location: event.location,
        event_date: event.start_date,
      };

      await client.query(vectorSql, [
        uuidv4(),
        event.id,
        JSON.stringify(embedding),
        chunk,
        i,
        JSON.stringify(metadata),
        now,
        now,
      ]);
    }

    await client.query("COMMIT");
    return event;
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Lỗi tạo sự kiện:", error.message);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Lấy sự kiện theo ID
 */
export async function getEventById(id) {
  const sql = `SELECT * FROM event WHERE id = $1`;
  const result = await query(sql, [id]);
  return result.rows[0];
}

/**
 * Tìm kiếm sự kiện theo tên
 */
export async function searchEventsByName(name, limit = 20) {
  const sql = `
    SELECT * FROM event 
    WHERE name ILIKE $1
    ORDER BY start_date DESC
    LIMIT $2
  `;
  const result = await query(sql, [`%${name}%`, limit]);
  return result.rows;
}

/**
 * Tìm kiếm sự kiện theo khoảng thời gian
 */
export async function searchEventsByDateRange(startDate, endDate, limit = 20) {
  const sql = `
    SELECT * FROM event 
    WHERE start_date >= $1 AND end_date <= $2
    ORDER BY start_date ASC
    LIMIT $3
  `;
  const result = await query(sql, [startDate, endDate, limit]);
  return result.rows;
}

/**
 * Lấy tất cả sự kiện
 */
export async function getAllEvents(limit = 100, offset = 0) {
  const sql = `
    SELECT * FROM event 
    ORDER BY start_date DESC
    LIMIT $1 OFFSET $2
  `;
  const result = await query(sql, [limit, offset]);
  return result.rows;
}

/**
 * Cập nhật sự kiện
 */
export async function updateEvent(id, updateData) {
  const now = new Date();
  const fields = [];
  const values = [id, now];
  let paramCount = 3;

  for (const [key, value] of Object.entries(updateData)) {
    if (value !== undefined && value !== null) {
      fields.push(`${key} = $${paramCount}`);
      values.splice(paramCount - 1, 0, value);
      paramCount++;
    }
  }

  fields.push(`updated_at = $2`);

  const sql = `
    UPDATE event 
    SET ${fields.join(", ")}
    WHERE id = $1
    RETURNING *
  `;

  const result = await query(sql, values);
  return result.rows[0];
}

/**
 * Xóa sự kiện
 */
export async function deleteEvent(id) {
  const sql = `DELETE FROM event WHERE id = $1`;
  await query(sql, [id]);
}

/**
 * Lấy vectors của sự kiện
 */
export async function getEventVectors(eventId) {
  const sql = `SELECT * FROM event_vector WHERE event_id = $1 ORDER BY chunk_index`;
  const result = await query(sql, [eventId]);
  return result.rows;
}

/**
 * Lấy các công ty tham gia sự kiện
 */
export async function getEventCompanies(eventId) {
  const sql = `
    SELECT c.*, ce.role
    FROM company c
    JOIN company_event ce ON c.id = ce.company_id
    WHERE ce.event_id = $1
  `;
  const result = await query(sql, [eventId]);
  return result.rows;
}

/**
 * Lấy các người tham gia sự kiện
 */
export async function getEventPersons(eventId) {
  const sql = `
    SELECT p.*, pe.role
    FROM person p
    JOIN person_event pe ON p.id = pe.person_id
    WHERE pe.event_id = $1
  `;
  const result = await query(sql, [eventId]);
  return result.rows;
}

export default {
  createEvent,
  getEventById,
  searchEventsByName,
  searchEventsByDateRange,
  getAllEvents,
  updateEvent,
  deleteEvent,
  getEventVectors,
  getEventCompanies,
  getEventPersons,
};
