/**
 * MCP (Model Context Protocol) Server
 * Cung cấp context gateway cho AI Agents
 */

import http from "http";
import dotenv from "dotenv";
import {
  searchSimilarCompanies,
  searchSimilarEvents,
  searchSimilarPersons,
  searchAllEntities,
  searchCompaniesByLocation,
  searchEventsByLocation,
} from "../services/vectorSearchService.js";
import { generateEmbedding } from "../services/embeddingService.js";
import * as companyRepository from "../database/repositories/companyRepository.js";

dotenv.config();

const PORT = process.env.MCP_PORT || 8000;

// MCP Tools/Functions được expose
const mcpTools = {
  "companies.search": searchCompaniesByText,
  "events.search": searchEventsByText,
  "persons.search": searchPersonsByText,
  "entities.search_all": searchAllEntitiesHandler,
  "companies.by_location": getCompaniesByLocationHandler,
  "events.by_location": getEventsByLocationHandler,
  "companies.details": getCompanyDetailsHandler,
};

/**
 * Tìm kiếm công ty bằng text
 */
async function searchCompaniesByText(params) {
  try {
    const { text, limit = 10, threshold = 0.5 } = params;

    if (!text) {
      return { error: "Thiếu parameter text" };
    }

    const embedding = await generateEmbedding(text);
    const results = await searchSimilarCompanies(embedding, limit, threshold);

    return {
      success: true,
      query: text,
      count: results.length,
      results,
    };
  } catch (error) {
    console.error("Lỗi tìm kiếm công ty:", error.message);
    return { error: error.message };
  }
}

/**
 * Tìm kiếm sự kiện bằng text
 */
async function searchEventsByText(params) {
  try {
    const { text, limit = 10, threshold = 0.5 } = params;

    if (!text) {
      return { error: "Thiếu parameter text" };
    }

    const embedding = await generateEmbedding(text);
    const results = await searchSimilarEvents(embedding, limit, threshold);

    return {
      success: true,
      query: text,
      count: results.length,
      results,
    };
  } catch (error) {
    console.error("Lỗi tìm kiếm sự kiện:", error.message);
    return { error: error.message };
  }
}

/**
 * Tìm kiếm người bằng text
 */
async function searchPersonsByText(params) {
  try {
    const { text, limit = 10, threshold = 0.5 } = params;

    if (!text) {
      return { error: "Thiếu parameter text" };
    }

    const embedding = await generateEmbedding(text);
    const results = await searchSimilarPersons(embedding, limit, threshold);

    return {
      success: true,
      query: text,
      count: results.length,
      results,
    };
  } catch (error) {
    console.error("Lỗi tìm kiếm người:", error.message);
    return { error: error.message };
  }
}

/**
 * Tìm kiếm tất cả entities
 */
async function searchAllEntitiesHandler(params) {
  try {
    const { text, limit = 10, threshold = 0.5 } = params;

    if (!text) {
      return { error: "Thiếu parameter text" };
    }

    const embedding = await generateEmbedding(text);
    const results = await searchAllEntities(embedding, limit, threshold);

    return {
      success: true,
      query: text,
      count: results.length,
      results,
    };
  } catch (error) {
    console.error("Lỗi tìm kiếm toàn bộ:", error.message);
    return { error: error.message };
  }
}

/**
 * Lấy công ty theo vị trí địa lý
 */
async function getCompaniesByLocationHandler(params) {
  try {
    const { lat, lng, radius_km = 100, limit = 20 } = params;

    if (!lat || !lng) {
      return { error: "Thiếu parameters lat/lng" };
    }

    const results = await searchCompaniesByLocation(lat, lng, radius_km, limit);

    return {
      success: true,
      location: { lat, lng, radius_km },
      count: results.length,
      results,
    };
  } catch (error) {
    console.error("Lỗi tìm công ty theo vị trí:", error.message);
    return { error: error.message };
  }
}

/**
 * Lấy sự kiện theo vị trí địa lý
 */
async function getEventsByLocationHandler(params) {
  try {
    const { lat, lng, radius_km = 100, limit = 20 } = params;

    if (!lat || !lng) {
      return { error: "Thiếu parameters lat/lng" };
    }

    const results = await searchEventsByLocation(lat, lng, radius_km, limit);

    return {
      success: true,
      location: { lat, lng, radius_km },
      count: results.length,
      results,
    };
  } catch (error) {
    console.error("Lỗi tìm sự kiện theo vị trí:", error.message);
    return { error: error.message };
  }
}

/**
 * Lấy chi tiết công ty
 */
async function getCompanyDetailsHandler(params) {
  try {
    const { company_id } = params;

    if (!company_id) {
      return { error: "Thiếu parameter company_id" };
    }

    const company = await companyRepository.getCompanyById(company_id);
    if (!company) {
      return { error: "Không tìm thấy công ty" };
    }

    const vectors = await companyRepository.getCompanyVectors(company_id);

    return {
      success: true,
      company,
      vectors_count: vectors.length,
    };
  } catch (error) {
    console.error("Lỗi lấy chi tiết công ty:", error.message);
    return { error: error.message };
  }
}

/**
 * HTTP Request Handler
 */
async function handleRequest(req, res) {
  // CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
  });

  req.on("end", async () => {
    try {
      const parsedBody = JSON.parse(body);
      const { tool, params } = parsedBody;

      if (!tool || !mcpTools[tool]) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: `Unknown tool: ${tool}` }));
        return;
      }

      console.log(`🔧 Calling tool: ${tool}`);
      const result = await mcpTools[tool](params || {});

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
    } catch (error) {
      console.error("Request error:", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: error.message }));
    }
  });
}

/**
 * Health check endpoint
 */
function handleHealthCheck(req, res) {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "ok",
        service: "geo-company-platform-mcp-server",
        tools: Object.keys(mcpTools),
      }),
    );
  }
}

/**
 * Start MCP Server
 */
const server = http.createServer((req, res) => {
  handleHealthCheck(req, res);

  if (req.url === "/call") {
    handleRequest(req, res);
  } else {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  }
});

server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════╗
║  🚀 MCP (Model Context Protocol) Server đang chạy    ║
║  📍 URL: http://localhost:${PORT}                         ║
║  🔧 Available Tools:                                   ║
${Object.keys(mcpTools)
  .map((tool) => `║    - ${tool.padEnd(45)} ║`)
  .join("\n")}
║                                                        ║
║  Health Check: http://localhost:${PORT}/health          ║
║  Call Tool: POST http://localhost:${PORT}/call           ║
╚════════════════════════════════════════════════════════╝
  `);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`❌ Port ${PORT} đã được sử dụng`);
  } else {
    console.error("Server error:", err);
  }
  process.exit(1);
});
