/**
 * PREDICTHQ EVENTS SERVICE
 *
 * Xử lý:
 * 1. Call PredictHQ API lấy events theo vị trí
 * 2. Transform response thành Event entity format
 * 3. Lưu events vào database + tạo hotel_event associations
 * 4. Track crawl history (CrawlLocation)
 */

import { query } from "../config/database.js";
import { EventRepository } from "../modules/event/event.repository.js";
import { createLogger } from "../shared/utils/logger.js";
import axios from "axios";
import { v4 as uuidv4 } from "uuid";

const logger = createLogger("PredictHqEventsService");

export class PredictHqEventsService {
  constructor(accessToken) {
    this.accessToken = accessToken;
    this.baseUrl = "https://api.predicthq.com/v1";
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      timeout: 30000,
    });
  }

  /**
   * Lấy events từ PredictHQ theo vị trí địa lý
   */
  async searchEventsByLocation(lat, lng, radius_km, options = {}) {
    try {
      const {
        startDate = new Date(),
        endDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        limit = 100,
      } = options;

      logger.info(
        `🔍 Calling PredictHQ API: lat=${lat}, lng=${lng}, radius=${radius_km}km`,
      );

      // Format: "8km@39.5193217,-104.7726713"
      const within = `${radius_km}km@${lat},${lng}`;
      const formatDate = (date) => date.toISOString().split("T")[0];

      const params = {
        within,
        "active.gte": formatDate(startDate),
        "active.lte": formatDate(endDate),
        limit: Math.min(limit, 500),
      };

      logger.debug(`Query params:`, params);

      const response = await this.client.get("/events", { params });

      logger.info(
        `✅ PredictHQ returned ${response.data.results?.length || 0} events`,
      );

      return {
        count: response.data.count,
        overflow: response.data.overflow,
        results: response.data.results || [],
      };
    } catch (error) {
      logger.error(`❌ PredictHQ API error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Lưu events vào database + tạo hotel_event associations
   */
  async saveEventsToDatabase(rawEvents, locationData) {
    const results = {
      saved_events: [],
      hotel_events_created: [],
      duplicates_skipped: 0,
      errors: [],
    };

    try {
      for (const rawEvent of rawEvents) {
        try {
          // Transform event data
          const eventData = this._transformPredictHqEvent(rawEvent);

          // Check xem event đã tồn tại (theo external_id từ PredictHQ)
          const existingEvent = await query(
            `SELECT id, name FROM events WHERE external_id = $1 LIMIT 1`,
            [eventData.external_id],
          );

          let eventId;
          if (existingEvent.rows.length === 0) {
            // Tạo event mới
            const createResult = await EventRepository.create(eventData);
            eventId = createResult.id;
            results.saved_events.push({
              id: eventId,
              name: eventData.name,
              status: "created",
            });
            logger.info(`✅ Saved event: ${eventData.name}`);
          } else {
            eventId = existingEvent.rows[0].id;
            results.duplicates_skipped++;
            logger.debug(
              `⏭️  Event already exists: ${existingEvent.rows[0].name}`,
            );
          }

          // Tạo liên kết hotel - event
          if (locationData.hotelId) {
            const hotelEventCheck = await query(
              `SELECT id FROM hotel_events WHERE hotel_id = $1 AND event_id = $2 LIMIT 1`,
              [locationData.hotelId, eventId],
            );

            if (hotelEventCheck.rows.length === 0) {
              const distance = this._calculateDistance(
                locationData.lat,
                locationData.lng,
                eventData.lat,
                eventData.lng,
              );

              await query(
                `INSERT INTO hotel_events 
                 (hotel_id, event_id, relationship_type, distance_km, source_name, confidence_score)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [
                  locationData.hotelId,
                  eventId,
                  "nearby",
                  distance,
                  "predicthq",
                  0.95,
                ],
              );

              results.hotel_events_created.push({
                hotel_id: locationData.hotelId,
                event_id: eventId,
                distance_km: distance,
              });

              logger.info(
                `🔗 Created hotel-event link: distance=${distance}km`,
              );
            }
          }
        } catch (error) {
          logger.error(`❌ Error saving event: ${error.message}`);
          results.errors.push({
            event_title: rawEvent.title,
            error: error.message,
          });
        }
      }
    } catch (error) {
      logger.error(`❌ Error in saveEventsToDatabase:`, error.message);
      throw error;
    }

    return results;
  }

  /**
   * Transform PredictHQ response thành Event entity format
   * @private
   */
  _transformPredictHqEvent(rawEvent) {
    const startDate = new Date(rawEvent.start);
    const endDate = rawEvent.end ? new Date(rawEvent.end) : null;
    const now = new Date();

    let status = "past";
    if (startDate > now) {
      status = "upcoming";
    } else if (endDate && endDate > now) {
      status = "ongoing";
    }

    // Lấy address từ geo.address hoặc fallback
    const address =
      rawEvent.geo?.address?.formatted_address ||
      `${rawEvent.location[1]},${rawEvent.location[0]}`;

    return {
      id: uuidv4(),
      name: rawEvent.title,
      normalized_name: rawEvent.title.toLowerCase(),
      description: rawEvent.description || null,
      event_type: rawEvent.category || "general",
      organizer: null,
      organizer_email: null,
      organizer_phone: null,
      organizer_website: null,
      location: address,
      venue_name: rawEvent.title,
      lat: rawEvent.location[1], // GeoJSON: [lng, lat]
      lng: rawEvent.location[0],
      url: rawEvent.url || null,
      sources: {
        predicthq: {
          event_id: rawEvent.id,
          url: rawEvent.url,
          rank: rawEvent.rank,
          phq_attendance: rawEvent.phq_attendance,
        },
      },
      start_date: startDate,
      end_date: endDate,
      eventbrite_event_id: null,
      external_source: "predicthq",
      external_id: rawEvent.id,
      status: status,
      attendees_count: rawEvent.phq_attendance || 0,
      raw_data: {
        predicthq: rawEvent,
      },
    };
  }

  /**
   * Calculate distance (Haversine formula)
   * @private
   */
  _calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return parseFloat((R * c).toFixed(2));
  }

  /**
   * Main orchestration method - gọi API, lưu DB, track crawl
   */
  async crawlLocationAndSaveEvents(lat, lng, radius_km, locationData = {}) {
    try {
      logger.info(`\n${"=".repeat(60)}`);
      logger.info(
        `🚀 Start PredictHQ crawl: ${lat}, ${lng}, radius=${radius_km}km`,
      );
      logger.info(`${"=".repeat(60)}`);

      // Check xem location đã crawl chưa (chưa expire)
      const existingCrawlResult = await query(
        `SELECT * FROM crawl_locations 
         WHERE lat = $1 AND lng = $2 AND radius_km = $3 AND source = $4
         AND last_crawl_at > NOW() - INTERVAL '7 days'
         LIMIT 1`,
        [lat, lng, radius_km, "predicthq"],
      );

      if (existingCrawlResult.rows.length > 0) {
        const existingCrawl = existingCrawlResult.rows[0];
        logger.warn(
          `⚠️  Location already crawled (${existingCrawl.crawl_count}x). Skipping...`,
        );
        return {
          status: "skipped",
          message: "Location already crawled recently",
          existing_crawl: existingCrawl,
        };
      }

      // Call PredictHQ API
      const apiResponse = await this.searchEventsByLocation(
        lat,
        lng,
        radius_km,
      );

      // Lưu events vào DB
      const saveResults = await this.saveEventsToDatabase(apiResponse.results, {
        lat,
        lng,
        radius_km,
        hotelId: locationData.hotelId,
      });

      // Update crawl tracking
      const crawlRecord = await query(
        `INSERT INTO crawl_locations 
         (lat, lng, radius_km, source, hotel_id, location_name, events_found, status, error_message, last_crawl_at, crawl_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), 1)
         ON CONFLICT (lat, lng, radius_km, source) DO UPDATE SET
           events_found = $7,
           status = $8,
           error_message = $9,
           last_crawl_at = NOW(),
           crawl_count = crawl_locations.crawl_count + 1
         RETURNING *`,
        [
          lat,
          lng,
          radius_km,
          "predicthq",
          locationData.hotelId || null,
          locationData.location_name || null,
          saveResults.saved_events.length,
          saveResults.errors.length === 0 ? "success" : "partial",
          saveResults.errors.length > 0
            ? JSON.stringify(saveResults.errors.slice(0, 2))
            : null,
        ],
      );

      logger.info(`\n📊 Crawl Summary:`);
      logger.info(`   📡 API returned: ${apiResponse.count} total events`);
      logger.info(`   ✅ New events saved: ${saveResults.saved_events.length}`);
      logger.info(
        `   ⏭️  Duplicates skipped: ${saveResults.duplicates_skipped}`,
      );
      logger.info(
        `   🔗 Hotel-event links: ${saveResults.hotel_events_created.length}`,
      );
      logger.info(`   ❌ Errors: ${saveResults.errors.length}`);
      logger.info(`${"=".repeat(60)}\n`);

      return {
        status: "success",
        message: "Events crawled and saved",
        api_response: {
          total_found: apiResponse.count,
          events_processed: apiResponse.results.length,
        },
        save_results: saveResults,
        crawl_record: crawlRecord,
      };
    } catch (error) {
      logger.error(`❌ Error in crawlLocationAndSaveEvents:`, error.message);

      // Update crawl record with error
      try {
        await query(
          `INSERT INTO crawl_locations 
           (lat, lng, radius_km, source, hotel_id, events_found, status, error_message, last_crawl_at, crawl_count)
           VALUES ($1, $2, $3, $4, $5, 0, $6, $7, NOW(), 1)
           ON CONFLICT (lat, lng, radius_km, source) DO UPDATE SET
             status = $6,
             error_message = $7,
             last_crawl_at = NOW(),
             crawl_count = crawl_locations.crawl_count + 1`,
          [
            lat,
            lng,
            radius_km,
            "predicthq",
            locationData.hotelId || null,
            "failed",
            error.message,
          ],
        );
      } catch (e) {
        logger.error(`Failed to update crawl record:`, e.message);
      }

      throw error;
    }
  }
}
