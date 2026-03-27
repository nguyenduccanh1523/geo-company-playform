/**
 * Database Initialization Script
 * Chạy migrations và tạo tables
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { query, getClient } from "../config/database.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const migrationsDir = path.join(__dirname, "migrations");

async function runMigrations() {
  const client = await getClient();

  try {
    console.log("🚀 Bắt đầu khởi tạo database...\n");

    // Đọc tất cả file migration
    const migrationFiles = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith(".sql"))
      .sort();

    for (const file of migrationFiles) {
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, "utf-8");

      console.log(`⏳ Đang chạy migration: ${file}`);

      try {
        // Tách SQL thành các câu lệnh riêng biệt
        const statements = sql
          .split(";")
          .map((stmt) => stmt.trim())
          .filter((stmt) => stmt.length > 0);

        for (const statement of statements) {
          await client.query(statement);
        }

        console.log(`✅ ${file} - Hoàn tất\n`);
      } catch (error) {
        console.error(`❌ Lỗi khi chạy ${file}:`, error.message);
        throw error;
      }
    }

    console.log("✨ Khởi tạo database thành công!\n");

    // Kiểm tra các tables
    const result = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    console.log("📋 Các bảng được tạo:");
    result.rows.forEach((row) => {
      console.log(`   - ${row.table_name}`);
    });
  } catch (error) {
    console.error("❌ Lỗi khởi tạo database:", error.message);
    process.exit(1);
  } finally {
    client.release();
  }
}

runMigrations();
