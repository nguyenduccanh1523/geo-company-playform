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
import {
  sendSuccess,
  sendError,
  sendPaginatedSuccess,
  sendNotFound,
  sendValidationError,
} from "../../shared/utils/response.js";

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

      return sendSuccess(res, response, "Company created successfully", 201);
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
      if (!company) {
        return sendNotFound(res, `Company not found: ${id}`);
      }

      const response = new CompanyResponseDto(company);
      return sendSuccess(res, response, "Company retrieved successfully");
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
      const { industry, name, limit = 20, page = 1 } = req.query;

      const pageSize = Math.min(parseInt(limit) || 20, 100);
      const pageNum = Math.max(1, parseInt(page) || 1);
      const offset = (pageNum - 1) * pageSize;

      const result = await CompanyService.searchCompanies(
        { industry, name },
        { limit: pageSize, offset },
      );

      const responses = result.companies.map((c) => new CompanyResponseDto(c));

      return sendPaginatedSuccess(
        res,
        responses,
        {
          page: pageNum,
          pageSize,
          total: result.total,
          totalPages: Math.ceil(result.total / pageSize),
        },
        "Companies retrieved successfully",
      );
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

      return sendSuccess(
        res,
        {
          companies: responses,
          statistics: {
            total: responses.length,
            location: result.location,
            radiusKm: result.radiusKm,
          },
        },
        "Companies retrieved successfully",
      );
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

      return sendSuccess(res, response, "Company updated successfully");
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

      return sendSuccess(res, null, "Company deleted successfully");
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
        return sendValidationError(res, "Missing required: companies array");
      }

      if (!sourceId) {
        return sendValidationError(res, "Missing required: sourceId");
      }

      const result = await CompanyService.importCompanies(companies, sourceId);

      return sendSuccess(
        res,
        {
          count: result.count,
          companies: result.companies.map((c) => new CompanyResponseDto(c)),
        },
        `${result.count} companies imported successfully`,
        201,
      );
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

      return sendSuccess(res, stats, "Statistics retrieved successfully");
    } catch (error) {
      next(error);
    }
  }
}
