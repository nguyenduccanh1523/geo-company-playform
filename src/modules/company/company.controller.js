/**
 * COMPANY CONTROLLER
 *
 * HTTP request/response handling
 * - Parse request params
 * - Validate input
 * - Call service
 * - Format response
 */

import { CompanyService } from "./company.service.js";
import { CompanyResponseDto } from "./dto/company-response.dto.js";
import { createLogger } from "../../shared/utils/logger.js";

const logger = createLogger("CompanyController");

export class CompanyController {
  /**
   * POST /api/companies
   * Tạo company mới
   */
  static async createCompany(req, res, next) {
    try {
      const company = await CompanyService.createCompany(req.body);
      const response = new CompanyResponseDto(company);

      res.status(201).json({
        success: true,
        data: response,
        message: "Company created successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/companies/:id
   * Lấy chi tiết company
   */
  static async getCompany(req, res, next) {
    try {
      const { id } = req.params;

      const company = await CompanyService.getCompany(id);
      const response = new CompanyResponseDto(company);

      res.json({
        success: true,
        data: response,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/companies
   * Tìm kiếm companies
   */
  static async listCompanies(req, res, next) {
    try {
      const { industry, name, limit = 20, offset = 0 } = req.query;

      const result = await CompanyService.searchCompanies(
        { industry, name },
        { limit: Math.min(parseInt(limit), 100), offset: parseInt(offset) },
      );

      const responses = result.companies.map((c) => new CompanyResponseDto(c));

      res.json({
        success: true,
        data: responses,
        pagination: {
          limit: result.limit,
          offset: result.offset,
          total: result.total,
          hasMore: result.hasMore,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/companies/nearby
   * Tìm companies gần vị trí
   */
  static async getCompaniesByLocation(req, res, next) {
    try {
      const { lat, lng, radius = 50, limit = 20 } = req.query;

      const result = await CompanyService.findCompaniesByLocation(
        parseFloat(lat),
        parseFloat(lng),
        parseInt(radius),
        parseInt(limit),
      );

      const responses = result.companies.map((c) => new CompanyResponseDto(c));

      res.json({
        success: true,
        data: responses,
        statistics: {
          total: responses.length,
          location: result.location,
          radiusKm: result.radiusKm,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/companies/:id
   * Cập nhật company
   */
  static async updateCompany(req, res, next) {
    try {
      const { id } = req.params;

      const company = await CompanyService.updateCompany(id, req.body);
      const response = new CompanyResponseDto(company);

      res.json({
        success: true,
        data: response,
        message: "Company updated successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/companies/:id
   * Xóa company
   */
  static async deleteCompany(req, res, next) {
    try {
      const { id } = req.params;

      await CompanyService.deleteCompany(id);

      res.json({
        success: true,
        message: "Company deleted successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/companies/import
   * Bulk import companies
   */
  static async importCompanies(req, res, next) {
    try {
      const { companies, sourceId } = req.body;

      if (!companies || !Array.isArray(companies)) {
        return res.status(400).json({
          success: false,
          error: {
            code: "INVALID_INPUT",
            message: "companies array is required",
          },
        });
      }

      if (!sourceId) {
        return res.status(400).json({
          success: false,
          error: {
            code: "INVALID_INPUT",
            message: "sourceId is required",
          },
        });
      }

      const result = await CompanyService.importCompanies(companies, sourceId);

      res.status(201).json({
        success: true,
        data: {
          count: result.count,
          companies: result.companies.map((c) => new CompanyResponseDto(c)),
        },
        message: `${result.count} companies imported successfully`,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/companies/stats
   * Lấy thống kê
   */
  static async getStatistics(req, res, next) {
    try {
      const stats = await CompanyService.getStatistics();

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  }
}
