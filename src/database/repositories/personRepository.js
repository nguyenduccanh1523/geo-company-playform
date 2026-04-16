import { query } from "../../config/database.js";
import { v4 as uuidv4 } from "uuid";
import {
  generateEmbedding,
  chunkText,
  preparePersonText,
} from "../../services/embeddingService.js";

/**
 * Tạo người mới và lưu vector embedding
 */
export async function createPerson(personData) {
  const client = await query.getClient();

  try {
    await client.query("BEGIN");

    const id = uuidv4();
    const now = new Date();

    // Thêm người
    const createSql = `
      INSERT INTO person (
        id, full_name, title, bio, linkedin_url, email, phone, 
        source, source_id, external_id, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
      ) RETURNING *
    `;

    const personResult = await client.query(createSql, [
      id,
      personData.full_name,
      personData.title,
      personData.bio,
      personData.linkedin_url,
      personData.email,
      personData.phone,
      personData.source,
      personData.source_id,
      personData.external_id,
      now,
      now,
    ]);

    const person = personResult.rows[0];

    // Tạo embedding
    const text = preparePersonText(person);
    const chunks = chunkText(text);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = await generateEmbedding(chunk);

      const vectorSql = `
        INSERT INTO person_vector (
          id, person_id, embedding, text_chunk, chunk_index, metadata, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8
        )
      `;

      const metadata = {
        type: "person",
        person_id: person.id,
        title: person.title,
      };

      await client.query(vectorSql, [
        uuidv4(),
        person.id,
        JSON.stringify(embedding),
        chunk,
        i,
        JSON.stringify(metadata),
        now,
        now,
      ]);
    }

    await client.query("COMMIT");
    return person;
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Lỗi tạo người:", error.message);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Lấy người theo ID
 */
export async function getPersonById(id) {
  const sql = `SELECT * FROM person WHERE id = $1`;
  const result = await query(sql, [id]);
  return result.rows[0];
}

/**
 * Tìm kiếm người theo tên
 */
export async function searchPersonsByName(name, limit = 20) {
  const sql = `
    SELECT * FROM person 
    WHERE full_name ILIKE $1
    ORDER BY full_name
    LIMIT $2
  `;
  const result = await query(sql, [`%${name}%`, limit]);
  return result.rows;
}

/**
 * Tìm kiếm người theo chức vụ
 */
export async function searchPersonsByTitle(title, limit = 20) {
  const sql = `
    SELECT * FROM person 
    WHERE title ILIKE $1
    ORDER BY full_name
    LIMIT $2
  `;
  const result = await query(sql, [`%${title}%`, limit]);
  return result.rows;
}

/**
 * Lấy tất cả người
 */
export async function getAllPersons(limit = 100, offset = 0) {
  const sql = `
    SELECT * FROM person 
    ORDER BY created_at DESC
    LIMIT $1 OFFSET $2
  `;
  const result = await query(sql, [limit, offset]);
  return result.rows;
}

/**
 * Cập nhật người
 */
export async function updatePerson(id, updateData) {
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
    UPDATE person 
    SET ${fields.join(", ")}
    WHERE id = $1
    RETURNING *
  `;

  const result = await query(sql, values);
  return result.rows[0];
}

/**
 * Xóa người
 */
export async function deletePerson(id) {
  const sql = `DELETE FROM person WHERE id = $1`;
  await query(sql, [id]);
}

/**
 * Lấy vectors của người
 */
export async function getPersonVectors(personId) {
  const sql = `SELECT * FROM person_vector WHERE person_id = $1 ORDER BY chunk_index`;
  const result = await query(sql, [personId]);
  return result.rows;
}

/**
 * Lấy công ty của người
 */
export async function getPersonCompanies(personId) {
  const sql = `
    SELECT c.*, cp.role
    FROM company c
    JOIN company_person cp ON c.id = cp.company_id
    WHERE cp.person_id = $1
  `;
  const result = await query(sql, [personId]);
  return result.rows;
}

/**
 * Lấy các sự kiện mà người tham gia
 */
export async function getPersonEvents(personId) {
  const sql = `
    SELECT e.*, pe.role
    FROM events e
    JOIN person_event pe ON e.id = pe.event_id
    WHERE pe.person_id = $1
    ORDER BY e.start_date DESC
  `;
  const result = await query(sql, [personId]);
  return result.rows;
}

/**
 * Liên kết người với công ty
 */
export async function linkPersonToCompany(
  personId,
  companyId,
  role = "member",
) {
  const sql = `
    INSERT INTO company_person (person_id, company_id, role)
    VALUES ($1, $2, $3)
    ON CONFLICT (person_id, company_id) DO UPDATE SET role = $3
  `;
  await query(sql, [personId, companyId, role]);
}

/**
 * Liên kết người với sự kiện
 */
export async function linkPersonToEvent(personId, eventId, role = "attendee") {
  const sql = `
    INSERT INTO person_event (person_id, event_id, role)
    VALUES ($1, $2, $3)
    ON CONFLICT (person_id, event_id) DO UPDATE SET role = $3
  `;
  await query(sql, [personId, eventId, role]);
}

export default {
  createPerson,
  getPersonById,
  searchPersonsByName,
  searchPersonsByTitle,
  getAllPersons,
  updatePerson,
  deletePerson,
  getPersonVectors,
  getPersonCompanies,
  getPersonEvents,
  linkPersonToCompany,
  linkPersonToEvent,
};
