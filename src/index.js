/**
 * Main Application Entry Point
 */

import dotenv from "dotenv";
import { pool } from "./config/database.js";

dotenv.config();

console.log(`
╔══════════════════════════════════════════════════════════╗
║    🌍 Geo Company Platform - Main Application           ║
║    Version: 1.0.0                                        ║
╚══════════════════════════════════════════════════════════╝
`);

async function main() {
  try {
    // Test database connection
    console.log("🔍 Kiểm tra kết nối database...");
    const result = await pool.query("SELECT NOW()");
    console.log("✅ Database connected:", result.rows[0].now);

    console.log(`
📋 Các lệnh có sẵn:
  - npm run db:init     # Khởi tạo database (tạo tables)
  - npm run db:seed     # Nhập dữ liệu mẫu
  - npm run mcp:server  # Chạy MCP Server

💡 Tiếp theo:
  1. Chạy: npm install
  2. Cấu hình .env
  3. Chạy: npm run db:init
  4. Chạy: npm run mcp:server
    `);
  } catch (error) {
    console.error("❌ Lỗi kết nối database:", error.message);
    console.log("⚠️  Đảm bảo PostgreSQL đang chạy và .env được cấu hình đúng");
    process.exit(1);
  }
}

main();
