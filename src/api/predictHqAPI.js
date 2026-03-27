/**
 * PredictHQ API Routes/Middleware Integration
 * Express handlers cho PredictHQ event search
 */

import PredictHqService from "../services/predictHqService.js";

export class PredictHqAPI {
  constructor(predictHqAccessToken) {
    this.predictHq = new PredictHqService(predictHqAccessToken);
  }

  /**
   * POST /api/events/search-company
   * Tìm sự kiện theo tên công ty
   *
   * Request Body:
   * {
   *   "companyName": "Google Vietnam",
   *   "location": "Vietnam" (optional),
   *   "startDate": "2026-01-01" (optional),
   *   "endDate": "2027-01-01" (optional),
   *   "limit": 100 (optional)
   * }
   */
  async handleSearchCompanyEvents(req, res) {
    try {
      const {
        companyName,
        location,
        startDate,
        endDate,
        lat,
        lng,
        radius,
        limit,
      } = req.body;

      if (!companyName) {
        return res.status(400).json({
          success: false,
          error: "companyName là bắt buộc",
        });
      }

      const params = {
        companyName,
        ...(location && { location }),
        ...(lat && lng && { lat, lng }),
        ...(radius && { radius }),
        ...(limit && { limit }),
      };

      // Convert date strings to Date objects
      if (startDate) {
        params.startDate = new Date(startDate);
      }
      if (endDate) {
        params.endDate = new Date(endDate);
      }

      const result = await this.predictHq.searchEventsByCompany(params);

      return res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error("Error in handleSearchCompanyEvents:", error.message);
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * POST /api/events/search-location
   * Tìm sự kiện theo vị trí địa lý
   *
   * Request Body:
   * {
   *   "lat": 10.7769,
   *   "lng": 106.7009,
   *   "radius": 50 (optional, default 50),
   *   "startDate": "2026-01-01" (optional),
   *   "endDate": "2027-01-01" (optional),
   *   "limit": 100 (optional)
   * }
   */
  async handleSearchLocationEvents(req, res) {
    try {
      const { lat, lng, radius, startDate, endDate, limit } = req.body;

      if (!lat || !lng) {
        return res.status(400).json({
          success: false,
          error: "lat và lng là bắt buộc",
        });
      }

      const params = {
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        ...(radius && { radius: parseFloat(radius) }),
        ...(limit && { limit }),
      };

      if (startDate) {
        params.startDate = new Date(startDate);
      }
      if (endDate) {
        params.endDate = new Date(endDate);
      }

      const result = await this.predictHq.searchEventsByLocation(params);

      return res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error("Error in handleSearchLocationEvents:", error.message);
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * POST /api/events/search-keywords
   * Tìm sự kiện theo keywords
   *
   * Request Body:
   * {
   *   "keywords": "technology conference",
   *   "category": "conference" (optional),
   *   "location": "Vietnam" (optional),
   *   "startDate": "2026-01-01" (optional),
   *   "endDate": "2027-01-01" (optional),
   *   "limit": 100 (optional)
   * }
   */
  async handleSearchKeywordsEvents(req, res) {
    try {
      const { keywords, category, location, startDate, endDate, limit } =
        req.body;

      if (!keywords) {
        return res.status(400).json({
          success: false,
          error: "keywords là bắt buộc",
        });
      }

      const params = {
        keywords,
        ...(category && { category }),
        ...(location && { location }),
        ...(limit && { limit }),
      };

      if (startDate) {
        params.startDate = new Date(startDate);
      }
      if (endDate) {
        params.endDate = new Date(endDate);
      }

      const result = await this.predictHq.searchEventsByKeywords(params);

      return res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error("Error in handleSearchKeywordsEvents:", error.message);
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * GET /api/events/details/:eventId
   * Lấy chi tiết sự kiện
   */
  async handleGetEventDetails(req, res) {
    try {
      const eventId = req.params.eventId;

      if (!eventId) {
        return res.status(400).json({
          success: false,
          error: "eventId là bắt buộc",
        });
      }

      const eventDetails = await this.predictHq.getEventDetails(eventId);

      return res.json({
        success: true,
        data: eventDetails,
      });
    } catch (error) {
      console.error("Error in handleGetEventDetails:", error.message);
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * GET /api/health/predictHq
   * Kiểm tra kết nối API
   */
  async handleHealthCheck(req, res) {
    try {
      const isConnected = await this.predictHq.testConnection();

      return res.json({
        success: isConnected,
        status: isConnected ? "connected" : "failed",
        message: isConnected
          ? "PredictHQ API is connected"
          : "Failed to connect to PredictHQ API",
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
}
