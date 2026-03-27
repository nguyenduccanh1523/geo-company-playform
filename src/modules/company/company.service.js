/**
 * COMPANY SERVICE
 *
 * Business logic layer
 * - Validation
 * - Authorization
 * - External API calls
 * - Data transformation
 */

import { CompanyRepository } from "./company.repository.js";
import { CreateCompanyDto } from "./dto/create-company.dto.js";
import {
  BusinessException,
  NotFoundException,
} from "../../shared/exceptions/base.exception.js";
import { createLogger } from "../../shared/utils/logger.js";
import GooglePlacesService from "../../services/googlePlacesService.js";
import { query } from "../../config/database.js";

const logger = createLogger("CompanyService");

export class CompanyService {
  /**
   * ✅ CREATE - Tạo company mới
   */
  static async createCompany(createCompanyDto) {
    try {
      logger.info(`Creating company: ${createCompanyDto.name}`);

      // Validate DTO
      const validatedDto = CreateCompanyDto.from(createCompanyDto);

      // Check if company already exists nearby
      const exists = await CompanyRepository.existsByNameAndLocation(
        validatedDto.name,
        validatedDto.lat,
        validatedDto.lng,
        5, // 5km radius
      );

      if (exists) {
        throw new BusinessException(
          "COMPANY_ALREADY_EXISTS",
          `Company "${validatedDto.name}" already exists in this location`,
        );
      }

      // Create company
      const company = await CompanyRepository.create(validatedDto.toDatabase());

      logger.info(`Company created successfully: ${company.id}`);
      return company;
    } catch (error) {
      logger.error(`Error creating company: ${error.message}`);
      throw error;
    }
  }

  /**
   * ✅ READ - Lấy company theo ID
   * Nếu có place_id và website/address chưa đầy đủ, lấy từ Google Places API
   */
  static async getCompany(id) {
    try {
      let company = await CompanyRepository.findById(id);

      if (!company) {
        throw new NotFoundException("Company", `id: ${id}`);
      }

      // ✅ NEW: Tự động lấy thêm details từ Google Places nếu cần
      if (
        company.place_id &&
        (!company.website ||
          company.address === "Unknown" ||
          !company.google_url)
      ) {
        try {
          logger.info(
            `📍 Fetching Google Places details for ${company.name} (place_id: ${company.place_id})`,
          );

          const googlePlaces = new GooglePlacesService(
            process.env.GOOGLE_PLACES_API_KEY,
          );

          const details = await googlePlaces.getPlaceDetails(company.place_id);

          logger.debug(`📦 Google Places returned:`, JSON.stringify(details));
          logger.debug(
            `Current company data: website=${company.website}, address="${company.address}", google_url=${company.google_url}`,
          );

          if (details) {
            // Prepare update data - chỉ update fields trống
            const updateData = {};

            if (!company.website && details.website) {
              updateData.website = details.website;
              logger.debug(`✅ Will update website: ${details.website}`);
            }

            if (company.address === "Unknown" && details.address) {
              updateData.address = details.address;
              logger.debug(`✅ Will update address: ${details.address}`);
            }

            if (!company.google_url && details.url) {
              updateData.google_url = details.url;
              logger.debug(`✅ Will update google_url: ${details.url}`);
            }

            // ✅ Update DB nếu có dữ liệu mới
            if (Object.keys(updateData).length > 0) {
              logger.info(
                `📝 Updating company ${id} with: ${JSON.stringify(updateData)}`,
              );

              try {
                const keys = Object.keys(updateData);
                const values = Object.values(updateData);

                // Build dynamic SET clause
                const setClause = keys
                  .map((key, idx) => `${key} = $${idx + 1}`)
                  .join(", ");

                const updateQuery = `
                  UPDATE companies 
                  SET ${setClause}, updated_at = NOW()
                  WHERE id = $${keys.length + 1}
                  RETURNING *
                `;

                const params = [...values, id];

                logger.info(`SQL: ${updateQuery}`);
                logger.info(`Params: ${JSON.stringify(params)}`);

                const result = await query(updateQuery, params);

                if (result.rows.length > 0) {
                  company = result.rows[0];
                  logger.info(
                    `✅ Company updated successfully! New values: website=${company.website}, address=${company.address}, google_url=${company.google_url}`,
                  );
                } else {
                  logger.warn(`⚠️  Update returned no rows`);
                }
              } catch (updateError) {
                logger.error(`❌ Update query failed: ${updateError.message}`);
                logger.error(`Error details:`, updateError);
                throw updateError;
              }
            } else {
              logger.debug(`ℹ️  No new data to update. Conditions:
  - website check: !${company.website} = ${!company.website}
  - address check: address === "Unknown" = ${company.address === "Unknown"} (actual: "${company.address}")
  - google_url check: !${company.google_url} = ${!company.google_url}`);
            }
          } else {
            logger.warn(`⚠️  Google Places returned null details`);
          }
        } catch (error) {
          logger.warn(
            `⚠️  Failed to fetch Google Places details: ${error.message}`,
          );
          logger.warn(`Error:`, error);
          // Continue anyway, return company with incomplete data
        }
      } else {
        logger.debug(`ℹ️  Skipping Google Places fetch:
  - Has place_id: ${!!company.place_id}
  - Needs website: ${!company.website}
  - Needs address: ${company.address === "Unknown"}
  - Needs google_url: ${!company.google_url}`);
      }

      return company;
    } catch (error) {
      logger.error(`Error getting company: ${error.message}`);
      throw error;
    }
  }

  /**
   * ✅ READ - Tìm kiếm companies
   */
  static async searchCompanies(
    filters = {},
    pagination = { limit: 20, offset: 0 },
  ) {
    try {
      logger.info(
        `Searching companies with filters: ${JSON.stringify(filters)}`,
      );

      const companies = await CompanyRepository.findAll(filters, pagination);
      const total = await CompanyRepository.count(filters);

      return {
        companies,
        total,
        limit: pagination.limit,
        offset: pagination.offset,
        hasMore: pagination.offset + pagination.limit < total,
      };
    } catch (error) {
      logger.error(`Error searching companies: ${error.message}`);
      throw error;
    }
  }

  /**
   * ✅ READ - Tìm companies gần vị trí
   */
  static async findCompaniesByLocation(lat, lng, radiusKm = 50, limit = 20) {
    try {
      // Validation
      if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
        throw new BusinessException(
          "INVALID_LOCATION",
          "Invalid latitude or longitude",
        );
      }

      if (radiusKm < 1 || radiusKm > 500) {
        throw new BusinessException(
          "INVALID_RADIUS",
          "Radius must be between 1 and 500 km",
        );
      }

      logger.info(
        `Finding companies near: ${lat}, ${lng} (radius: ${radiusKm}km)`,
      );

      const companies = await CompanyRepository.findNearby(
        lat,
        lng,
        radiusKm,
        limit,
      );

      return {
        location: { lat, lng },
        radiusKm,
        total: companies.length,
        companies,
      };
    } catch (error) {
      logger.error(`Error finding nearby companies: ${error.message}`);
      throw error;
    }
  }

  /**
   * ✅ UPDATE - Cập nhật company
   */
  static async updateCompany(id, updateData) {
    try {
      logger.info(`Updating company: ${id}`);

      // Check if company exists
      const company = await CompanyRepository.findById(id);
      if (!company) {
        throw new NotFoundException("Company", `id: ${id}`);
      }

      // Update company
      const updated = await CompanyRepository.update(id, updateData);

      logger.info(`Company updated successfully: ${id}`);
      return updated;
    } catch (error) {
      logger.error(`Error updating company: ${error.message}`);
      throw error;
    }
  }

  /**
   * ✅ DELETE - Xóa company
   */
  static async deleteCompany(id) {
    try {
      logger.info(`Deleting company: ${id}`);

      // Check if company exists
      const company = await CompanyRepository.findById(id);
      if (!company) {
        throw new NotFoundException("Company", `id: ${id}`);
      }

      // Delete company
      const success = await CompanyRepository.delete(id);

      if (!success) {
        throw new BusinessException(
          "DELETE_FAILED",
          "Failed to delete company",
        );
      }

      logger.info(`Company deleted successfully: ${id}`);
      return true;
    } catch (error) {
      logger.error(`Error deleting company: ${error.message}`);
      throw error;
    }
  }

  /**
   * ✅ BULK - Import companies
   */
  static async importCompanies(companies, sourceId) {
    try {
      if (!Array.isArray(companies) || companies.length === 0) {
        throw new BusinessException(
          "INVALID_INPUT",
          "Companies array is required and must not be empty",
        );
      }

      logger.info(
        `Importing ${companies.length} companies from source ${sourceId}`,
      );

      // Add sourceId to each company
      const companiesWithSource = companies.map((c) => ({
        ...c,
        source_id: sourceId,
      }));

      // Bulk create
      const imported = await CompanyRepository.bulkCreate(companiesWithSource);

      logger.info(`Successfully imported ${imported.length} companies`);
      return {
        count: imported.length,
        companies: imported,
      };
    } catch (error) {
      logger.error(`Error importing companies: ${error.message}`);
      throw error;
    }
  }

  /**
   * ✅ UTILITY - Get statistics
   */
  static async getStatistics() {
    try {
      const byIndustry = await CompanyRepository.countByIndustry();
      const total = byIndustry.reduce(
        (sum, item) => sum + parseInt(item.count, 10),
        0,
      );

      return {
        total,
        byIndustry,
      };
    } catch (error) {
      logger.error(`Error getting statistics: ${error.message}`);
      throw error;
    }
  }
}
