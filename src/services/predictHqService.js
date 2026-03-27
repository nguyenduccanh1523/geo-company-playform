/**
 * PredictHQ API Service
 * Tìm sự kiện bất kỳ theo tên công ty, keywords, location từ trước tới nay
 *
 * Tài liệu: https://docs.predicthq.com/
 */

import axios from "axios";

class PredictHqService {
  constructor(accessToken) {
    this.accessToken = accessToken;
    this.baseUrl = "https://api.predicthq.com/v1";
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });
  }

  /**
   * Tìm sự kiện theo tên công ty + date range
   * @param {Object} params - Tham số
   * @param {string} params.companyName - Tên công ty (bắt buộc)
   * @param {string} params.location - Địa điểm (mặc định: Vietnam)
   * @param {number} params.lat - Latitude (tuỳ chọn)
   * @param {number} params.lng - Longitude (tuỳ chọn)
   * @param {number} params.radius - Bán kính (km, mặc định: 50)
   * @param {Date} params.startDate - Ngày bắt đầu (mặc định: hôm nay)
   * @param {Date} params.endDate - Ngày kết thúc (mặc định: 12 tháng từ hôm nay)
   * @param {number} params.limit - Số lượng kết quả (mặc định: 100)
   * @returns {Promise<Object>} Danh sách sự kiện đầy đủ
   */
  async searchEventsByCompany(params) {
    try {
      const {
        companyName,
        location,
        lat,
        lng,
        radius = 50,
        startDate = new Date(),
        endDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        limit = 100,
      } = params;

      if (!companyName) {
        throw new Error("Phải cung cấp companyName");
      }

      const formatDate = (date) => date.toISOString().split("T")[0];

      console.log(`\n🔍 Searching events for company: "${companyName}"`);

      // Build query - Search for company in title OR description
      // Using Lucene query syntax for PredictHQ
      const searchTerms = companyName
        .split(" ")
        .map((term) => `(title:${term} OR description:${term})`)
        .join(" OR ");

      let query = `active:true AND (${searchTerms})`;

      // Add date range
      query += ` AND (start:[${formatDate(startDate)} TO ${formatDate(endDate)}])`;

      console.log(`📋 Query: ${query}`);

      // Nếu có coordinates, thêm điều kiện vị trí
      if (lat && lng) {
        const latMin = lat - radius / 111;
        const latMax = lat + radius / 111;
        const lngMin = lng - radius / (111 * Math.cos((lat * Math.PI) / 180));
        const lngMax = lng + radius / (111 * Math.cos((lat * Math.PI) / 180));

        query += ` AND (venue_geo:[${latMin},${lngMin} TO ${latMax},${lngMax}])`;
        console.log(`📍 Location: (${lat}, ${lng}), Radius: ${radius}km`);
      }

      const response = await this.client.get("/events", {
        params: {
          q: query,
          limit: Math.min(limit, 500),
          sort: "start",
        },
      });

      if (!response.data.results || response.data.results.length === 0) {
        console.log(
          `⚠️ Không tìm thấy sự kiện nào cho "${companyName}" (${response.data.count || 0} results)`,
        );

        // Fallback: Suggest searching by keywords or location instead
        console.log(
          `💡 Suggestion: Try POST /api/events/search-keywords with: "${companyName.split(" ")[0]}"`,
        );

        return {
          totalEvents: 0,
          events: [],
          metadata: {
            companyName,
            location,
            dateRange: {
              start: formatDate(startDate),
              end: formatDate(endDate),
            },
            predictHqCount: response.data.count || 0,
            suggestion: `Try searching keywords instead`,
            searchedAt: new Date().toISOString(),
          },
        };
      }

      const formattedEvents = response.data.results.map((event) =>
        this._formatEvent(event),
      );

      console.log(`✅ Found ${formattedEvents.length} events`);

      return {
        totalEvents: formattedEvents.length,
        events: formattedEvents,
        metadata: {
          companyName,
          location,
          dateRange: {
            start: formatDate(startDate),
            end: formatDate(endDate),
          },
          predictHqCount: response.data.count || formattedEvents.length,
          searchedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      console.error("Error in searchEventsByCompany:", error.message);
      throw error;
    }
  }

  /**
   * Tìm sự kiện theo vị trí địa lý
   * @param {Object} params - Tham số
   * @param {number} params.lat - Latitude (bắt buộc)
   * @param {number} params.lng - Longitude (bắt buộc)
   * @param {number} params.radius - Bán kính (km, mặc định: 50)
   * @param {Date} params.startDate - Ngày bắt đầu
   * @param {Date} params.endDate - Ngày kết thúc
   * @param {number} params.limit - Số lượng kết quả
   * @returns {Promise<Object>}
   */
  async searchEventsByLocation(params) {
    try {
      const {
        lat,
        lng,
        radius = 50,
        startDate = new Date(),
        endDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        limit = 100,
      } = params;

      if (!lat || !lng) {
        throw new Error("Phải cung cấp latitude và longitude");
      }

      const formatDate = (date) => date.toISOString().split("T")[0];

      console.log(`\n🔍 Searching events near (${lat}, ${lng})`);

      // Tính bounding box
      const latMin = lat - radius / 111;
      const latMax = lat + radius / 111;
      const lngMin = lng - radius / (111 * Math.cos((lat * Math.PI) / 180));
      const lngMax = lng + radius / (111 * Math.cos((lat * Math.PI) / 180));

      const query = `active:true AND venue_geo:[${latMin},${lngMin} TO ${latMax},${lngMax}] AND start:[${formatDate(startDate)} TO ${formatDate(endDate)}]`;

      const response = await this.client.get("/events", {
        params: {
          q: query,
          limit: Math.min(limit, 500),
          sort: "start",
        },
      });

      if (!response.data.results || response.data.results.length === 0) {
        return {
          totalEvents: 0,
          events: [],
          metadata: {
            location: { lat, lng, radius },
            dateRange: {
              start: formatDate(startDate),
              end: formatDate(endDate),
            },
            searchedAt: new Date().toISOString(),
          },
        };
      }

      const formattedEvents = response.data.results.map((event) =>
        this._formatEvent(event),
      );

      console.log(`✅ Found ${formattedEvents.length} events`);

      return {
        totalEvents: formattedEvents.length,
        events: formattedEvents,
        metadata: {
          location: { lat, lng, radius },
          dateRange: {
            start: formatDate(startDate),
            end: formatDate(endDate),
          },
          predictHqCount: response.data.count || formattedEvents.length,
          searchedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      console.error("Error in searchEventsByLocation:", error.message);
      throw error;
    }
  }

  /**
   * Tìm sự kiện theo keywords + filters
   * @param {Object} params
   * @param {string} params.keywords - Từ khóa tìm kiếm
   * @param {string} params.category - Loại event (conference, workshop, meetup, etc)
   * @param {string} params.location - Địa điểm
   * @returns {Promise<Object>}
   */
  async searchEventsByKeywords(params) {
    try {
      const {
        keywords,
        category,
        location = "Vietnam",
        startDate = new Date(),
        endDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        limit = 100,
      } = params;

      if (!keywords) {
        throw new Error("Phải cung cấp keywords");
      }

      const formatDate = (date) => date.toISOString().split("T")[0];

      console.log(`\n🔍 Searching events for keywords: "${keywords}"`);

      let query = `active:true AND (title:"${keywords}" OR description:"${keywords}")`;

      if (category) {
        query += ` AND category:"${category}"`;
      }

      if (location) {
        query += ` AND location:"${location}"`;
      }

      query += ` AND start:[${formatDate(startDate)} TO ${formatDate(endDate)}]`;

      const response = await this.client.get("/events", {
        params: {
          q: query,
          limit: Math.min(limit, 500),
          sort: "start",
        },
      });

      if (!response.data.results || response.data.results.length === 0) {
        return {
          totalEvents: 0,
          events: [],
          metadata: {
            keywords,
            category,
            location,
            searchedAt: new Date().toISOString(),
          },
        };
      }

      const formattedEvents = response.data.results.map((event) =>
        this._formatEvent(event),
      );

      return {
        totalEvents: formattedEvents.length,
        events: formattedEvents,
        metadata: {
          keywords,
          category,
          location,
          predictHqCount: response.data.count || formattedEvents.length,
          searchedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      console.error("Error in searchEventsByKeywords:", error.message);
      throw error;
    }
  }

  /**
   * Lấy chi tiết sự kiện
   * @param {string} eventId - Event ID
   */
  async getEventDetails(eventId) {
    try {
      const response = await this.client.get(`/events/${eventId}`);
      return this._formatEvent(response.data);
    } catch (error) {
      console.error(
        `Error getting event details for ${eventId}:`,
        error.message,
      );
      throw error;
    }
  }

  /**
   * Format event từ PredictHQ API response
   * @private
   */
  _formatEvent(rawEvent) {
    const startDate = new Date(rawEvent.start);
    const endDate = rawEvent.end ? new Date(rawEvent.end) : null;
    const now = new Date();

    let status = "past";
    if (startDate > now) {
      status = "upcoming";
    } else if (endDate && endDate > now) {
      status = "ongoing";
    }

    return {
      id: rawEvent.id,
      title: rawEvent.title,
      description: rawEvent.description || null,
      category: rawEvent.category ? rawEvent.category.name : null,
      labels: rawEvent.labels || [],
      startDate: rawEvent.start,
      endDate: rawEvent.end || null,
      timezone: rawEvent.timezone || null,
      status: status,
      location: {
        address: rawEvent.venue ? rawEvent.venue.name : rawEvent.location.name,
        city: rawEvent.location.city || null,
        country: rawEvent.location.country || null,
        latitude: rawEvent.location.lat,
        longitude: rawEvent.location.lon,
      },
      venue: rawEvent.venue
        ? {
            id: rawEvent.venue.id,
            name: rawEvent.venue.name,
            address: rawEvent.venue.address || null,
            latitude: rawEvent.venue.lat || null,
            longitude: rawEvent.venue.lon || null,
          }
        : null,
      organizer: rawEvent.organizer || null,
      ticketing: {
        url: rawEvent.ticketing ? rawEvent.ticketing.url : null,
        status: rawEvent.ticketing ? rawEvent.ticketing.status : null,
      },
      url: rawEvent.url || null,
      rank: rawEvent.rank || null,
      phq_attend: rawEvent.phq_attend || 0, // Dự kiến số người tham dự
      phq_viewership: rawEvent.phq_viewership || 0,
      created: rawEvent.created || null,
      updated: rawEvent.updated || null,
      impact: {
        rank: rawEvent.rank,
        magnitude: rawEvent.magnitude || 0,
        potential_reach: rawEvent.phq_attend || 0,
      },
    };
  }

  /**
   * Kiểm tra kết nối API
   */
  async testConnection() {
    try {
      const response = await this.client.get("/events", {
        params: { limit: 1 },
      });
      console.log(`✅ PredictHQ API connected successfully!`);
      return true;
    } catch (error) {
      console.error("❌ Failed to connect to PredictHQ API:", error.message);
      return false;
    }
  }
}

export default PredictHqService;
