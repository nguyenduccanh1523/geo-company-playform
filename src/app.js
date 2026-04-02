import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createLogger } from "./shared/utils/logger.js";
import {
  errorHandlerMiddleware,
  notFoundMiddleware,
} from "./shared/middlewares/error-handler.middleware.js";
import { EventSearchAPI } from "./api/eventSearchAPI.js";

// Import routes
import hotelRoutes from "./modules/hotel/hotel.routes.js";
import companyRoutes from "./modules/company/company.routes.js";
import personRoutes from "./modules/person/person.routes.js";
import eventRoutes from "./modules/event/event.routes.js";
import crawlBatchRoutes from "./modules/crawl-batch/crawl-batch.routes.js";
import googlePlacesRoutes from "./modules/google-places/google-places.routes.js";
import googlePlacesStreamRoutes from "./modules/google-places/google-places-stream.routes.js";
import apifyRoutes from "./modules/apify-integration/apify.routes.js";

dotenv.config();

const logger = createLogger("App");
const app = express();

// ============================================
// INITIALIZE EVENT SEARCH API (Perplexity + OpenAI)
// ============================================
let eventSearchAPI = null;

try {
  eventSearchAPI = new EventSearchAPI(
    process.env.PERPLEXITY_API_KEY || null,
    process.env.OPENAI_API_KEY || null,
    process.env.EVENTBRITE_ACCESS_TOKEN || null,
    process.env.PREDICTHQ_ACCESS_TOKEN || null,
  );
  if (process.env.OPENAI_API_KEY || process.env.PERPLEXITY_API_KEY) {
    logger.info("✅ Event Search API (Perplexity + OpenAI) initialized");
  }
} catch (error) {
  logger.warn("⚠️  Event Search API initialization failed:", error.message);
  eventSearchAPI = null;
}

// Store in app context for use in routes
app.locals.eventSearchAPI = eventSearchAPI;

// ============================================
// MIDDLEWARES
// ============================================

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS
const corsOrigin = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((o) => o.trim())
  : ["http://localhost:3000", "http://localhost:5173", "http://localhost:5174"];

// Function to check ngrok URLs
const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    // Check if origin is in whitelist
    if (corsOrigin.includes(origin)) {
      return callback(null, true);
    }

    // Allow ngrok URLs in development
    if (
      process.env.NODE_ENV !== "production" &&
      origin &&
      origin.includes("ngrok")
    ) {
      return callback(null, true);
    }

    // Allow localhost in development
    if (
      process.env.NODE_ENV !== "production" &&
      origin &&
      origin.includes("localhost")
    ) {
      return callback(null, true);
    }

    // Reject other origins
    const msg = `CORS policy: ${origin} is not allowed`;
    callback(new Error(msg));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  exposedHeaders: ["Content-Length", "X-JSON-Response-Length"],
  maxAge: 86400,
  optionsSuccessStatus: 200,
  preflightContinue: false,
};

app.use(cors(corsOptions));

// ✅ Explicit OPTIONS handler for ngrok compatibility
app.options("*", cors(corsOptions));

// Request logging
app.use((req, res, next) => {
  logger.info(`[${req.method}] ${req.path}`);
  next();
});

// ============================================
// ROUTES
// ============================================

// Health check
app.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "Server is running",
    timestamp: new Date(),
    environment: process.env.NODE_ENV,
  });
});

// ============================================
// API ROUTES
// ============================================

/**
 * Core Entity Routes
 */
app.use("/api/hotels", hotelRoutes);
app.use("/api/people", personRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/companies", companyRoutes);
app.use("/api/apify", apifyRoutes);

/**
 * Data Pipeline Routes
 */
app.use("/api/crawl-batches", crawlBatchRoutes);

/**
 * Google Places Routes (Search, Details, etc.)
 */
app.use("/api", googlePlacesRoutes);

/**
 * Google Places Streaming Routes (Progressive Search + Save)
 */
app.use("/api", googlePlacesStreamRoutes);

/**
 * API Documentation
 * TODO: Thêm Swagger/OpenAPI documentation
 */
app.get("/api/docs", (req, res) => {
  res.json({
    success: true,
    message: "API Documentation",
    entities: {
      hotels: "/api/hotels",
      people: "/api/people",
      events: "/api/events",
      companies: "/api/companies",
      "crawl-batches": "/api/crawl-batches",
    },
    "google-places": {
      "POST /api/search-companies": "Search companies by location",
      "POST /api/search-companies-by-keyword": "Search companies by keyword",
      "GET /api/place-details/:place_id": "Get place details",
      "POST /api/text-search": "Text search",
    },
    "google-places-streaming": {
      "POST /api/search-companies-stream":
        "Progressive search + save (with cache detection)",
      "GET /api/search-session/:sessionId":
        "Query companies from search session",
      "GET /api/search-session/:sessionId/status": "Get search progress status",
    },
    cache_feature: {
      description: "Automatic cache detection - saves API costs",
      enabled: true,
      behavior:
        "If location (lat/lng) was previously searched, returns cached data immediately",
      force_refresh:
        "Use 'forceRefresh': true in POST body to search again despite cache",
      example_cached_response: {
        success: true,
        sessionId: "abc123",
        source: "CACHE",
        cached_data: true,
        companies_available: 125,
        message:
          "Data loaded from cache - 125 companies found in previous search",
      },
      example_new_search_response: {
        success: true,
        sessionId: "abc123",
        source: "NEW_SEARCH",
        message: "Search started in background...",
      },
    },
    docs: "See INTEGRATION_GUIDE.md for full documentation",
  });
});

// ============================================
// ERROR HANDLING
// ============================================

// 404 handler
app.use(notFoundMiddleware);

// Global error handler (MUST BE LAST)
app.use(errorHandlerMiddleware);

export default app;
