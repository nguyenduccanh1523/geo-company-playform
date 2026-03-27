/**
 * Eventbrite API Service
 * Tìm sự kiện dựa vào tên công ty, keywords từ quá khứ đến tương lai
 */

import axios from "axios";

class EventbriteService {
  constructor(accessToken) {
    this.accessToken = accessToken;
    this.baseUrl = "https://www.eventbriteapi.com/v3";
    this.organizationId = null;
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });
  }

  /**
   * Lấy organization ID từ account
   */
  async getOrganizationId() {
    if (this.organizationId) return this.organizationId;

    try {
      const response = await this.client.get("/users/me/");
      const userId = response.data.id;

      // Lấy organizations của user
      const orgsResponse = await this.client.get(
        `/users/${userId}/organizations/`,
      );

      if (
        orgsResponse.data.organizations &&
        orgsResponse.data.organizations.length > 0
      ) {
        this.organizationId = orgsResponse.data.organizations[0].id;
        console.log(`✅ Organization ID: ${this.organizationId}`);
        return this.organizationId;
      }

      throw new Error(
        "Không tìm thấy organization. Hãy tạo event hoặc organization trên Eventbrite trước.",
      );
    } catch (error) {
      console.error("❌ Error getting organization:", error.message);
      throw error;
    }
  }

  /**
   * Tìm sự kiện theo công ty/keywords
   * @param {Object} params - Tham số tìm kiếm
   * @param {string} params.companyName - Tên công ty
   * @param {string[]} params.keywords - Keywords bổ sung
   * @param {string} params.location - Vị trí (tên thành phố, quốc gia)
   * @param {number} params.lat - Latitude (nếu có)
   * @param {number} params.lng - Longitude (nếu có)
   * @param {number} params.radius - Bán kính tìm kiếm (km) - chỉ dùng cho Eventbrite US
   * @param {Date} params.startDate - Ngày bắt đầu (mặc định từ ngày hôm nay)
   * @param {Date} params.endDate - Ngày kết thúc (mặc định 1 năm từ hôm nay)
   * @param {number} params.limit - Số lượng kết quả (mặc định 50)
   * @returns {Promise<Object>} Danh sách sự kiện
   */
  async searchEventsByCompany(params) {
    try {
      const {
        companyName,
        keywords = [],
        location = "Vietnam",
        lat,
        lng,
        radius = 50,
        startDate = new Date(),
        endDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        limit = 50,
      } = params;

      // Lấy organization ID
      const organizationId = await this.getOrganizationId();

      const formatDate = (date) => {
        return date.toISOString().split("T")[0];
      };

      console.log(`\n🔍 Searching events in organization ${organizationId}`);

      // Lấy events từ organization
      const response = await this.client.get(
        `/organizations/${organizationId}/events/`,
        {
          params: {
            status: "live",
            order_by: "created",
            expand: "venue,category,organizer",
            page_size: Math.min(limit, 200),
          },
        },
      );

      let results = response.data.events || [];

      // Filter theo searchQueries nếu có
      const searchQueries = [companyName, ...keywords].filter(Boolean);
      if (searchQueries.length > 0) {
        const queryLower = searchQueries.map((q) => q.toLowerCase());
        results = results.filter((event) =>
          queryLower.some(
            (query) =>
              event.name.text.toLowerCase().includes(query) ||
              (event.description &&
                event.description.text.toLowerCase().includes(query)),
          ),
        );
      }

      // Filter theo date
      results = results.filter((event) => {
        const eventStart = new Date(event.start.utc);
        return eventStart >= startDate && eventStart <= endDate;
      });

      // Sort theo ngày
      results.sort((a, b) => new Date(a.start.utc) - new Date(b.start.utc));

      console.log(`✅ Found ${results.length} events`);

      return {
        totalEvents: results.length,
        events: this._formatEvents(results),
        metadata: {
          searchQueries,
          location,
          organizationId,
          dateRange: {
            start: formatDate(startDate),
            end: formatDate(endDate),
          },
          searchedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      console.error("Error in searchEventsByCompany:", error.message);
      throw error;
    }
  }

  /**
   * Tìm sự kiện ở một địa điểm cụ thể
   * @param {Object} params - Tham số
   * @param {number} params.lat - Latitude
   * @param {number} params.lng - Longitude
   * @param {number} params.radius - Bán kính (km)
   * @param {Date} params.startDate - Ngày bắt đầu
   * @param {Date} params.endDate - Ngày kết thúc
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
        limit = 50,
      } = params;

      if (!lat || !lng) {
        throw new Error("Phải cung cấp latitude và longitude");
      }

      // Lấy organization ID
      const organizationId = await this.getOrganizationId();

      const formatDate = (date) => {
        return date.toISOString().split("T")[0];
      };

      console.log(
        `\n🔍 Searching events near (${lat}, ${lng}) in organization ${organizationId}`,
      );

      // Lấy events từ organization
      const response = await this.client.get(
        `/organizations/${organizationId}/events/`,
        {
          params: {
            status: "live",
            order_by: "created",
            expand: "venue,category,organizer",
            page_size: Math.min(limit, 200),
          },
        },
      );

      let results = response.data.events || [];

      // Filter theo vị trí (nếu venue có coordinates)
      results = results.filter((event) => {
        if (!event.venue || !event.venue.latitude || !event.venue.longitude) {
          return false;
        }

        const distance = this._calculateDistance(
          lat,
          lng,
          event.venue.latitude,
          event.venue.longitude,
        );

        return distance <= radius;
      });

      // Filter theo date
      results = results.filter((event) => {
        const eventStart = new Date(event.start.utc);
        return eventStart >= startDate && eventStart <= endDate;
      });

      // Sort theo ngày
      results.sort((a, b) => new Date(a.start.utc) - new Date(b.start.utc));

      console.log(`✅ Found ${results.length} events`);

      if (results.length === 0) {
        return {
          totalEvents: 0,
          events: [],
          metadata: {
            location: { lat, lng, radius },
            organizationId,
            dateRange: {
              start: formatDate(startDate),
              end: formatDate(endDate),
            },
            searchedAt: new Date().toISOString(),
          },
        };
      }

      return {
        totalEvents: results.length,
        events: this._formatEvents(results),
        metadata: {
          location: { lat, lng, radius },
          organizationId,
          dateRange: {
            start: formatDate(startDate),
            end: formatDate(endDate),
          },
          searchedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      console.error("Error in searchEventsByLocation:", error.message);
      throw error;
    }
  }

  /**
   * Tính khoảng cách giữa 2 điểm (Haversine formula)
   */
  _calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Bán kính Trái Đất (km)
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Lấy thông tin chi tiết sự kiện
   * @param {string} eventId - Event ID từ Eventbrite
   * @returns {Promise<Object>}
   */
  async getEventDetails(eventId) {
    try {
      const response = await this.client.get(`/events/${eventId}`, {
        params: {
          expand: "venue,category,organizer",
        },
      });

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
   * Loại bỏ sự kiện trùng lặp
   * @private
   */
  _deduplicateEvents(events) {
    const seen = new Set();
    return events.filter((event) => {
      if (seen.has(event.id)) {
        return false;
      }
      seen.add(event.id);
      return true;
    });
  }

  /**
   * Format một sự kiện
   * @private
   */
  _formatEvent(rawEvent) {
    // Xử lý cả start.local và start.utc
    const startDateStr = rawEvent.start.local || rawEvent.start.utc;
    const endDateStr = rawEvent.end.local || rawEvent.end.utc;

    const startDate = new Date(startDateStr);
    const endDate = new Date(endDateStr);
    const now = new Date();

    let status = "past";
    if (startDate > now) {
      status = "upcoming";
    } else if (endDate > now) {
      status = "ongoing";
    }

    return {
      id: rawEvent.id,
      name: rawEvent.name.text,
      description: rawEvent.description ? rawEvent.description.text : null,
      startDate: startDateStr,
      endDate: endDateStr,
      timezone: rawEvent.start.timezone,
      status: status,
      url: rawEvent.url,
      organizer: rawEvent.organizer
        ? {
            id: rawEvent.organizer.id,
            name: rawEvent.organizer.name,
          }
        : null,
      venue: rawEvent.venue
        ? {
            name: rawEvent.venue.name,
            address: rawEvent.venue.address
              ? rawEvent.venue.address.address_1
              : null,
            city: rawEvent.venue.address ? rawEvent.venue.address.city : null,
            region: rawEvent.venue.address
              ? rawEvent.venue.address.region
              : null,
            latitude: rawEvent.venue.latitude,
            longitude: rawEvent.venue.longitude,
          }
        : null,
      category: rawEvent.category
        ? {
            id: rawEvent.category.id,
            name: rawEvent.category.name,
          }
        : null,
      currency: rawEvent.currency,
      online: rawEvent.online_event,
      capacity: rawEvent.capacity,
    };
  }

  /**
   * Format danh sách sự kiện
   * @private
   */
  _formatEvents(events) {
    return events.map((event) => this._formatEvent(event));
  }

  /**
   * Kiểm tra kết nối API
   * @returns {Promise<boolean>}
   */
  async testConnection() {
    try {
      const response = await this.client.get("/users/me/");
      console.log(`✅ Eventbrite API connected! User: ${response.data.name}`);
      return true;
    } catch (error) {
      console.error("❌ Failed to connect to Eventbrite API:", error.message);
      return false;
    }
  }
}

export default EventbriteService;
