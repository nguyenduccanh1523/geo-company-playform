/**
 * CRAWL LOCATION REPOSITORY
 * Quản lý CRUD operations cho CrawlLocation
 */

import { MoreThanOrEqual } from "typeorm";
import { AppDataSource } from "../typeorm.config.ts";
import { CrawlLocation } from "../entities/crawl-location.entity.js";

export class CrawlLocationRepository {
  static getRepository() {
    return AppDataSource.getRepository(CrawlLocation);
  }

  /**
   * Tìm crawl location theo lat, lng, radius
   */
  static async findByLocation(lat, lng, radius_km, source = "predicthq") {
    const repository = this.getRepository();
    return await repository.findOne({
      where: {
        lat,
        lng,
        radius_km,
        source,
      },
    });
  }

  /**
   * Tạo hoặc cập nhật crawl location
   */
  static async upsertCrawlLocation(data) {
    const repository = this.getRepository();
    const existing = await this.findByLocation(
      data.lat,
      data.lng,
      data.radius_km,
      data.source,
    );

    if (existing) {
      existing.events_found = data.events_found || existing.events_found;
      existing.last_crawl_at = new Date();
      existing.crawl_count = (existing.crawl_count || 0) + 1;
      existing.status = data.status || "success";
      existing.error_message = data.error_message || null;
      existing.location_name = data.location_name || existing.location_name;
      existing.filters = data.filters || existing.filters;
      existing.hotel_id = data.hotel_id || existing.hotel_id;

      return await repository.save(existing);
    } else {
      const crawlLocation = new CrawlLocation({
        lat: data.lat,
        lng: data.lng,
        radius_km: data.radius_km,
        source: data.source || "predicthq",
        hotel_id: data.hotel_id,
        location_name: data.location_name,
        events_found: data.events_found || 0,
        status: data.status || "success",
        error_message: data.error_message,
        filters: data.filters,
        last_crawl_at: new Date(),
        crawl_count: 1,
      });

      return await repository.save(crawlLocation);
    }
  }

  /**
   * Lấy tất cả crawl locations
   */
  static async findAll(source = "predicthq") {
    const repository = this.getRepository();
    return await repository.find({
      where: { source },
      order: { last_crawl_at: "DESC" },
    });
  }

  /**
   * Lấy crawl locations chưa expire
   */
  static async findNonExpired(daysThreshold = 7, source = "predicthq") {
    const repository = this.getRepository();
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() - daysThreshold);

    return await repository.find({
      where: {
        source,
        last_crawl_at: MoreThanOrEqual(thresholdDate),
      },
    });
  }

  /**
   * Lấy crawl location theo ID
   */
  static async findById(id) {
    const repository = this.getRepository();
    return await repository.findOne({
      where: { id },
    });
  }

  /**
   * Get statistics
   */
  static async getStatistics(source = "predicthq") {
    const repository = this.getRepository();
    const crawlLocations = await repository.find({
      where: { source },
    });

    return {
      total_locations: crawlLocations.length,
      total_events_found: crawlLocations.reduce(
        (sum, c) => sum + c.events_found,
        0,
      ),
      average_events_per_location:
        crawlLocations.length > 0
          ? Math.round(
              crawlLocations.reduce((sum, c) => sum + c.events_found, 0) /
                crawlLocations.length,
            )
          : 0,
      successful_crawls: crawlLocations.filter((c) => c.status === "success")
        .length,
      failed_crawls: crawlLocations.filter((c) => c.status === "failed").length,
    };
  }
}
