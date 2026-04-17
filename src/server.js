import dotenv from "dotenv";
import { pool } from "./config/database.js";
import app from "./app.js";
import { createLogger } from "./shared/utils/logger.js";

dotenv.config();

const logger = createLogger("Server");
const PORT = process.env.API_PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || "development";

async function startServer() {
  try {
    logger.info("🔍 Checking database connection...");
    const connectionTest = await pool.query("SELECT NOW()");
    logger.info(`✅ Database connected: ${connectionTest.rows[0].now}`);

    const server = app.listen(PORT, async () => {
      logger.info(`✅ Server started on port ${PORT}`);
      logger.info(`📍 Environment: ${NODE_ENV}`);
      logger.info(`
╔══════════════════════════════════════════════════════════╗
║  🚀 Geo Company Platform API Server Running              ║
║  Port: ${PORT}                                              ║
║  Environment: ${NODE_ENV}                                    ║
╚══════════════════════════════════════════════════════════╝

📋 API Endpoints:
  ✅ /health                  - Health check
  ✅ /api/docs                - API documentation
  
  🏢 Entities:
  ✅ /api/hotels              - Hotel management
  ✅ /api/people              - Person management
  ✅ /api/events              - Event management
  ✅ /api/companies           - Company management

  📦 Data Pipeline:
  ✅ /api/crawl-batches       - Batch ingestion management

  🔍 Google Places:
  ✅ /api/search-companies              - Search by location
  ✅ /api/search-companies-by-keyword   - Search by keyword
  ✅ /api/place-details/:place_id       - Get place details
  ✅ /api/text-search                   - Text search

🧪 Test endpoints:
  curl http://localhost:${PORT}/health
  curl http://localhost:${PORT}/api/docs

📚 Documentation:
  See docs/INTEGRATION_GUIDE.md for full API documentation
      `);

      // ============================================
      // Initialize Background Workers
      // ============================================
      try {
        await import("./workers/index.js");
        logger.info(`\n✅ Background Workers Initialized`);
        logger.info(`📡 Listening for queue jobs...`);
      } catch (error) {
        logger.error(`❌ Failed to initialize workers:`, error.message);
      }
    });

    // ============================================
    // 3. Graceful Shutdown
    // ============================================
    const gracefulShutdown = async (signal) => {
      logger.info(
        `\n⏹️  Received ${signal} signal. Shutting down gracefully...`,
      );

      server.close(async () => {
        logger.info("✅ HTTP server closed");

        try {
          await pool.end();
          logger.info("✅ Database connection closed");
        } catch (err) {
          logger.error("❌ Error closing database:", err);
        }

        logger.info("👋 Server stopped");
        process.exit(0);
      });

      // Force shutdown after 10 seconds
      setTimeout(() => {
        logger.error("⚠️  Forcing shutdown after 10 seconds");
        process.exit(1);
      }, 10000);
    };

    // Handle signals
    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));

    // Handle uncaught exceptions
    process.on("uncaughtException", (error) => {
      logger.error("❌ Uncaught Exception:", error);
      gracefulShutdown("uncaughtException");
    });

    // Handle unhandled rejections
    process.on("unhandledRejection", (reason, promise) => {
      logger.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
      gracefulShutdown("unhandledRejection");
    });
  } catch (error) {
    logger.error("❌ Failed to start server:", error.message);
    process.exit(1);
  }
}

startServer();

export { app };
