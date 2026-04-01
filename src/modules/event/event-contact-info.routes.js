/**
 * EVENT CONTACT INFO ROUTES
 * API routes để tìm thông tin liên hệ công ty tổ chức sự kiện từ Perplexity
 *
 * BASE URL: /api/events
 *
 * ENDPOINTS:
 * POST   /api/events/find-organizer-contact                 - 🆕 Tìm contact info (TRUYỀN DỮ LIỆU BODY - DEMO)
 * POST   /api/events/find-organizer-contacts/bulk           - Tìm contact info cho nhiều sự kiện
 * POST   /api/events/:eventId/find-organizer-contact        - Tìm contact info cho 1 sự kiện (với eventId)
 * GET    /api/events/:eventId/organizer-contact             - Lấy contact info đã cache
 * POST   /api/events/:eventId/organizer-contact/save        - Lưu contact info vào cache
 */

import express from "express";
import EventContactInfoController from "./event-contact-info.controller.js";

const router = express.Router();

/**
 * POST /api/events/find-organizer-contact
 * 🆕 DEMO ENDPOINT - Không cần eventId, truyền dữ liệu sự kiện trực tiếp vào body
 * Dùng khi DB chưa có event, test bằng dữ liệu thủ công
 *
 * BODY:
 * {
 *   "title": "C3 Annual Summit",
 *   "description": "Sourced from predicthq.com",
 *   "location": [-104.815067, 39.563562],
 *   "geo": {
 *     "address": {
 *       "formatted_address": "Parker, CO, United States of America",
 *       "country_code": "US"
 *     }
 *   },
 *   "timezone": "America/Denver"
 * }
 *
 * CURL Example:
 * curl -X POST http://localhost:3000/api/events/find-organizer-contact \
 *   -H "Content-Type: application/json" \
 *   -d '{
 *     "title": "C3 Annual Summit",
 *     "description": "Sourced from predicthq.com",
 *     "location": [-104.815067, 39.563562],
 *     "geo": {
 *       "address": {
 *         "formatted_address": "Parker, CO, United States of America",
 *         "country_code": "US"
 *       }
 *     },
 *     "timezone": "America/Denver"
 *   }'
 */
router.post(
  "/find-organizer-contact",
  EventContactInfoController.findOrganizerContactFromBody,
);

/**
 * POST /api/events/find-organizer-contacts/bulk
 * Tìm thông tin liên hệ cho nhiều sự kiện
 *
 * CURL Example:
 * curl -X POST http://localhost:3000/api/events/find-organizer-contacts/bulk \
 *   -H "Content-Type: application/json" \
 *   -d '{
 *     "events": [
 *       {
 *         "id": "DZuj7VSNU6XvwnTWbj",
 *         "title": "C3 Annual Summit",
 *         "location": [-104.815067, 39.563562],
 *         "geo": {...},
 *         "timezone": "America/Denver"
 *       },
 *       {
 *         "id": "ABC123XYZ",
 *         "title": "Tech Conference 2026",
 *         ...
 *       }
 *     ]
 *   }'
 */
router.post(
  "/find-organizer-contacts/bulk",
  EventContactInfoController.findMultipleOrganizersContact,
);

/**
 * POST /api/events/:eventId/find-organizer-contact
 * Tìm thông tin liên hệ công ty tổ chức sự kiện
 *
 * MINIMAL INPUT ĐỂ TÌM ĐƯỢC:
 * - Event title (bắt buộc) - Tên sự kiện (VD: "C3 Annual Summit")
 * - Event location (tuỳ chọn) - Địa chỉ hoặc tọa độ
 * - Event description (tuỳ chọn) - Mô tả sự kiện
 * - Event timezone (tuỳ chọn)
 *
 * CURL Example:
 * curl -X POST http://localhost:3000/api/events/DZuj7VSNU6XvwnTWbj/find-organizer-contact \
 *   -H "Content-Type: application/json" \
 *   -d '{
 *     "title": "C3 Annual Summit",
 *     "description": "Sourced from predicthq.com",
 *     "location": [-104.815067, 39.563562],
 *     "geo": {
 *       "address": {
 *         "formatted_address": "Parker, CO, United States of America",
 *         "country_code": "US"
 *       }
 *     },
 *     "timezone": "America/Denver"
 *   }'
 */
router.post(
  "/:eventId/find-organizer-contact",
  EventContactInfoController.findOrganizerContact,
);

/**
 * GET /api/events/:eventId/organizer-contact
 * Lấy thông tin liên hệ đã cache
 *
 * CURL Example:
 * curl http://localhost:3000/api/events/DZuj7VSNU6XvwnTWbj/organizer-contact
 */
router.get(
  "/:eventId/organizer-contact",
  EventContactInfoController.getOrganizerContactFromCache,
);

/**
 * POST /api/events/:eventId/organizer-contact/save
 * Lưu thông tin liên hệ vào cache
 *
 * CURL Example:
 * curl -X POST http://localhost:3000/api/events/DZuj7VSNU6XvwnTWbj/organizer-contact/save \
 *   -H "Content-Type: application/json" \
 *   -d '{
 *     "organizer_info": {...},
 *     "confidence_score": 0.95,
 *     "sources": [...]
 *   }'
 */
router.post(
  "/:eventId/organizer-contact/save",
  EventContactInfoController.saveCachedOrganizerContact,
);

export default router;
