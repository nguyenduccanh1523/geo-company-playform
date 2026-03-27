/**
 * COMPANY PERSISTENCE SERVICE
 *
 * Xử lý việc lưu companies từ Google Places API vào database
 * - Lấy chi tiết từ Place Details API
 * - Kiểm tra duplicate
 * - Lưu vào database
 */

import { CompanyRepository } from "../modules/company/company.repository.js";
import GooglePlacesService from "./googlePlacesService.js";
import { createLogger } from "../shared/utils/logger.js";

const logger = createLogger("CompanyPersistenceService");

export class CompanyPersistenceService {
  constructor(googlePlacesApiKey) {
    this.googlePlaces = new GooglePlacesService(googlePlacesApiKey);
  }

  /**
   * Lưu companies từ search result vào database
   *
   * Flow:
   * 1. Chi tiết hóa mỗi company từ Google Places Details API
   * 2. Kiểm tra duplicate giữa place_id
   * 3. Insert vào database
   *
   * @param {Array} companies - Danh sách companies từ search
   * @param {Object} options - Tuỳ chọn
   *   - enrichDetails: boolean (default: true) - có gọi Place Details API
   *   - maxDetailsToEnrich: number (default: 50) - số lượng details tối đa
   *   - skipDuplicates: boolean (default: true) - bỏ qua duplicate
   *
   * @returns {Object} {
   *   saved: [...], - Companies đã lưu
   *   skipped: [...], - Companies bỏ qua (duplicate, lỗi)
   *   errors: [...], - Danh sách lỗi
   *   summary: {...}
   * }
   */
  async persistCompanies(companies, options = {}) {
    const {
      enrichDetails = true,
      maxDetailsToEnrich = 50,
      skipDuplicates = true,
      source_id = "google_places",
    } = options;

    logger.info(
      `🔄 Starting persistence of ${companies.length} companies (enrichDetails: ${enrichDetails})`,
    );

    const result = {
      saved: [],
      skipped: [],
      errors: [],
      summary: {
        total_input: companies.length,
        total_saved: 0,
        total_skipped: 0,
        total_errors: 0,
        time_ms: 0,
      },
    };

    const startTime = Date.now();

    try {
      // Step 1: Enrich companies with detailed info
      let enrichedCompanies = companies;

      if (enrichDetails) {
        logger.info(`📞 Enriching up to ${maxDetailsToEnrich} companies...`);
        enrichedCompanies = await this._enrichCompaniesWithDetails(
          companies,
          maxDetailsToEnrich,
        );
      }

      // Step 2: Check for duplicates and prepare for saving
      logger.info("🔍 Checking for duplicates...");
      const toSave = [];

      for (const company of enrichedCompanies) {
        try {
          // Check if already exists by place_id
          if (company.place_id && skipDuplicates) {
            const existing = await CompanyRepository.findByPlaceId(
              company.place_id,
            );
            if (existing) {
              logger.debug(
                `⏭️  Skipping duplicate: ${company.name} (place_id: ${company.place_id})`,
              );
              result.skipped.push({
                name: company.name,
                place_id: company.place_id,
                reason: "duplicate_place_id",
              });
              continue;
            }
          }

          // Prepare data for saving
          const companyData = {
            name: company.name,
            industry: company.industry || null,
            address: company.address,
            lat: parseFloat(company.lat),
            lng: parseFloat(company.lng),
            website:
              company.website && company.website !== "N/A"
                ? company.website
                : null,
            email:
              company.email && company.email !== "N/A" ? company.email : null,
            phone:
              company.phone && company.phone !== "N/A" ? company.phone : null,
            place_id: company.place_id || null,
            business_status: company.business_status || "OPERATIONAL",
            rating: company.rating || null,
            reviews_count: company.reviews_count || 0,
            google_url:
              company.url && company.url !== "N/A" ? company.url : null,
            source_id: source_id,
            external_id: company.place_id || null,
            raw_data: {
              types: company.types || [],
              business_hours: company.business_hours || null,
              enriched_at: new Date().toISOString(),
            },
          };

          toSave.push(companyData);
        } catch (error) {
          logger.error(
            `Error preparing company ${company.name}: ${error.message}`,
          );
          result.errors.push({
            name: company.name,
            error: error.message,
            stage: "prepare",
          });
        }
      }

      // Step 3: Save to database
      if (toSave.length > 0) {
        logger.info(`💾 Saving ${toSave.length} companies to database...`);

        try {
          const savedCompanies = await CompanyRepository.bulkCreate(toSave);
          result.saved = savedCompanies;
          result.summary.total_saved = savedCompanies.length;

          logger.info(
            `✅ Successfully saved ${savedCompanies.length} companies`,
          );
        } catch (bulkError) {
          logger.error(
            `Failed bulk insert: ${bulkError.message}. Trying individual inserts...`,
          );

          // Fallback: Insert one by one
          for (const companyData of toSave) {
            try {
              const saved = await CompanyRepository.create(companyData);
              result.saved.push(saved);
              result.summary.total_saved++;
            } catch (error) {
              logger.error(
                `Failed to save ${companyData.name}: ${error.message}`,
              );
              result.errors.push({
                name: companyData.name,
                error: error.message,
                stage: "save",
              });
              result.summary.total_errors++;
            }
          }
        }
      }

      result.summary.total_skipped = result.skipped.length;
      result.summary.total_errors = result.errors.length;
      result.summary.time_ms = Date.now() - startTime;

      logger.info(`
✅ Persistence completed:
   - Saved: ${result.summary.total_saved}
   - Skipped: ${result.summary.total_skipped}
   - Errors: ${result.summary.total_errors}
   - Time: ${result.summary.time_ms}ms
      `);

      return result;
    } catch (error) {
      logger.error(`Fatal error during persistence: ${error.message}`);
      result.errors.push({
        error: error.message,
        stage: "general",
      });
      result.summary.time_ms = Date.now() - startTime;
      return result;
    }
  }

  /**
   * Enrich companies with detailed info from Place Details API
   * @private
   */
  async _enrichCompaniesWithDetails(companies, limit = 50) {
    const enriched = [];
    const toEnrich = companies.slice(0, limit);

    logger.info(
      `  Requesting details for ${toEnrich.length} companies (${companies.length - limit} will be kept as-is)`,
    );

    for (let i = 0; i < toEnrich.length; i++) {
      const company = toEnrich[i];

      try {
        // Rate limiting: 200ms delay between requests
        if (i > 0) {
          await new Promise((resolve) => setTimeout(resolve, 200));
        }

        if (i % 10 === 0) {
          logger.debug(`  Progress: ${i}/${toEnrich.length}`);
        }

        const details = await this.googlePlaces.getPlaceDetails(
          company.place_id,
        );

        if (details) {
          enriched.push({
            ...company,
            address: details.address || company.address,
            website: details.website || company.website,
            phone: details.phone || company.phone,
            url: details.url || company.url,
            opening_hours: details.opening_hours || company.opening_hours,
          });
        } else {
          enriched.push(company);
        }
      } catch (error) {
        logger.warn(
          `⚠️  Failed to get details for ${company.name}: ${error.message}`,
        );
        enriched.push(company);
      }
    }

    // Add remaining companies without enrichment
    if (companies.length > limit) {
      enriched.push(...companies.slice(limit));
    }

    logger.info(`  ✅ Enrichment completed for ${enriched.length} companies`);

    return enriched;
  }
}

export default CompanyPersistenceService;
