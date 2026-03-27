/**
 * COMPANY ROUTES
 *
 * Định nghĩa HTTP endpoints
 */

import express from "express";
import { CompanyController } from "./company.controller.js";

const router = express.Router();

/**
 * POST /api/companies
 * Tạo company mới
 *
 * Body:
 * {
 *   "name": "TechCorp",
 *   "address": "123 Main St",
 *   "lat": 16.06,
 *   "lng": 108.22,
 *   "industry": "Technology",
 *   "website": "techcorp.com",
 *   "email": "info@techcorp.com",
 *   "phone": "+84123456789"
 * }
 */
router.post("/", CompanyController.createCompany);

/**
 * GET /api/companies
 * Tìm kiếm companies
 *
 * Query params:
 * - industry (optional): Filter by industry
 * - name (optional): Search by name (like search)
 * - limit (optional, default: 20): Limit results
 * - offset (optional, default: 0): Offset for pagination
 */
router.get("/", CompanyController.listCompanies);

/**
 * GET /api/companies/nearby
 * Tìm companies gần vị trí
 *
 * Query params:
 * - lat (required): Latitude
 * - lng (required): Longitude
 * - radius (optional, default: 50): Search radius in km
 * - limit (optional, default: 20): Limit results
 *
 * Route phải trước :id - để không bị matched với /api/companies/:id
 */
router.get("/nearby", CompanyController.getCompaniesByLocation);

/**
 * GET /api/companies/stats
 * Lấy thống kê companies
 */
router.get("/stats", CompanyController.getStatistics);

/**
 * GET /api/companies/:id
 * Lấy chi tiết company
 */
router.get("/:id", CompanyController.getCompany);

/**
 * PUT /api/companies/:id
 * Cập nhật company
 *
 * Body: Các field cần update
 */
router.put("/:id", CompanyController.updateCompany);

/**
 * DELETE /api/companies/:id
 * Xóa company
 */
router.delete("/:id", CompanyController.deleteCompany);

/**
 * POST /api/companies/import
 * Bulk import companies
 *
 * Body:
 * {
 *   "sourceId": "uuid-of-source",
 *   "companies": [
 *     {
 *       "name": "Company 1",
 *       "address": "123 St",
 *       "lat": 16.06,
 *       "lng": 108.22
 *     },
 *     ...
 *   ]
 * }
 *
 * Route phải sau POST / - để không conflict
 */
router.post("/import", CompanyController.importCompanies);

export default router;
