/**
 * Google Places API Service
 * Tìm công ty/doanh nghiệp gần khách sạn (100km radius)
 */

import axios from "axios";

class GooglePlacesService {
  // ===== SMART KEYWORDS - Tùy vào radius size =====
  static LITE_KEYWORDS = ["company", "office", "business"];

  static EXTENDED_KEYWORDS = [
    "company",
    "office",
    "business",
    "corporation",
    "enterprise",
    "headquarters",
    "branch office",
    "industrial",
    "manufacturing",
    "trading",
    "consulting",
    "firm",
  ];

  static FULL_KEYWORDS = [
    "company",
    "office",
    "business",
    "corporation",
    "enterprise",
    "headquarters",
    "branch office",
    "industrial",
    "manufacturing",
    "trading",
    "consulting",
    "firm",
    "workplace",
    "commercial",
    "service",
    "organization",
    "establishment",
  ];

  // ===== INDUSTRY-SPECIFIC TEXT SEARCH QUERIES =====
  // Dùng để fallback khi nearby results ít
  static INDUSTRY_SEARCH_QUERIES = [
    // Manufacturing & Industry
    "manufacturing companies",
    "factories",
    "industrial facilities",
    "production plants",

    // Services
    "service companies",
    "consulting firms",
    "business services",
    "professional services",

    // Trading & Commerce
    "trading companies",
    "import export businesses",
    "wholesale distribution",
    "B2B companies",

    // Technology & IT
    "tech companies",
    "software companies",
    "it services",
    "startups",

    // Corporate & General
    "corporate offices",
    "business centers",
    "company headquarters",
    "commercial establishments",
    "businesses near me",
  ];

  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = "https://maps.googleapis.com/maps/api/place";
  }

  /**
   * Chọn keyword set phù hợp dựa vào size của search radius
   * @private
   */
  _selectKeywordSet(radiusMeters) {
    if (radiusMeters > 100000) {
      return GooglePlacesService.LITE_KEYWORDS; // > 100km: lite (3 keywords)
    } else if (radiusMeters > 50000) {
      return GooglePlacesService.EXTENDED_KEYWORDS; // 50-100km: extended (12)
    } else {
      return GooglePlacesService.FULL_KEYWORDS; // <= 50km: full (17)
    }
  }

  /**
   * Tìm công ty gần khách sạn bằng Google Places API
   * Hỗ trợ vùng tìm kiếm rộng lớn bằng Grid Search
   *
   * @param {String} hotelName - Tên khách sạn (hoặc query)
   * @param {Number} latitude - Vĩ độ khách sạn
   * @param {Number} longitude - Kinh độ khách sạn
   * @param {Array<String>} types - Loại doanh nghiệp (mặc dù Google API không dùng param này)
   * @param {Number} radiusMeters - Bán kính tìm kiếm tối đa (tính bằng mét)
   * @param {Number} gridRadiusMeters - Kích thước grid tối ưu (mặc định 50000m = 50km). Nhỏ hơn = chính xác hơn nhưng API calls nhiều hơn
   * @returns {Array} - Danh sách công ty không trùng lặp
   */
  async searchNearbyBusinesses(
    hotelName,
    latitude,
    longitude,
    types = ["company", "establishment", "point_of_interest"],
    radiusMeters = 100000, // 100km
    gridRadiusMeters = 50000, // 50km (Google API max)
  ) {
    try {
      const results = [];
      const visited = new Set(); // Để tránh duplicate

      // gridRadiusMeters phải <= 50000 (Google API max)
      const MAX_API_RADIUS = Math.min(gridRadiusMeters, 50000);

      // STEP 1: Select appropriate keywords based on radius
      const selectedKeywords = this._selectKeywordSet(radiusMeters);
      const beforeNearby = results.length;

      // Nếu radius <= MAX_API_RADIUS: tìm kiếm trực tiếp
      if (radiusMeters <= MAX_API_RADIUS) {
        console.log(
          `📍 Direct search with radius: ${radiusMeters}m (grid_radius: ${MAX_API_RADIUS}m)`,
        );
        console.log(
          `📝 Using ${selectedKeywords.length} keywords for complete coverage`,
        );
        await this._searchNearbyInRadius(
          hotelName,
          latitude,
          longitude,
          radiusMeters,
          results,
          visited,
          selectedKeywords,
        );
      } else {
        // Nếu radius > MAX_API_RADIUS: chia thành grid nhiều điểm tìm kiếm
        console.log(
          `📊 Grid search: radius ${radiusMeters}m with grid_radius ${MAX_API_RADIUS}m`,
        );
        console.log(
          `📝 Using ${selectedKeywords.length} keywords: ${selectedKeywords.slice(0, 5).join(", ")}${selectedKeywords.length > 5 ? ", ..." : ""}`,
        );
        const gridPoints = this._generateGridPoints(
          latitude,
          longitude,
          radiusMeters,
          MAX_API_RADIUS,
        );
        console.log(`🔍 Generated ${gridPoints.length} grid points to search`);

        for (let i = 0; i < gridPoints.length; i++) {
          const point = gridPoints[i];
          console.log(
            `  [${i + 1}/${gridPoints.length}] Searching at (${point.lat.toFixed(4)}, ${point.lng.toFixed(4)})`,
          );

          await this._searchNearbyInRadius(
            hotelName,
            point.lat,
            point.lng,
            MAX_API_RADIUS,
            results,
            visited,
            selectedKeywords,
          );

          // Delay giữa các request để tránh rate limit
          if (i < gridPoints.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        }
      }

      const afterNearby = results.length;
      console.log(
        `✅ Nearby search found: ${afterNearby - beforeNearby} companies`,
      );

      // STEP 2: Industry-specific text search fallback
      // 🟢 OPTIMIZED: Giảm trigger threshold từ 300 → 150 + early stop
      // Tiết kiệm: 60-70% chi phí API khi dùng API cũ
      const FALLBACK_TRIGGER_THRESHOLD = 150; // ✅ Giảm từ 300
      const FALLBACK_TARGET_RESULTS = 250; // ✅ Dừng khi đủ results

      if (results.length < FALLBACK_TRIGGER_THRESHOLD) {
        console.log(
          `\n⚠️  Nearby search returned only ${results.length} results (< ${FALLBACK_TRIGGER_THRESHOLD} threshold)`,
        );
        console.log(
          `🔍 Activating Optimized Text Search (will stop early to save API cost)...\n`,
        );

        let textSearchQueriesExecuted = 0;

        for (const industryQuery of GooglePlacesService.INDUSTRY_SEARCH_QUERIES) {
          // 🟢 FIX: Early stop - không gọi thêm nếu đã đủ results
          if (results.length >= FALLBACK_TARGET_RESULTS) {
            console.log(
              `\n✅ Reached target ${results.length} results, stopping fallback (early stop optimization)`,
            );
            break;
          }

          textSearchQueriesExecuted++;

          try {
            const textResults = await this.textSearch(
              industryQuery,
              latitude,
              longitude,
              radiusMeters,
            );

            let newCount = 0;
            for (const place of textResults) {
              if (!visited.has(place.place_id)) {
                visited.add(place.place_id);
                results.push(place);
                newCount++;
              }
            }

            if (newCount > 0) {
              console.log(
                `    + "${industryQuery}": +${newCount} new (total: ${results.length})`,
              );
            }

            // Delay between text searches
            await new Promise((resolve) => setTimeout(resolve, 500));
          } catch (err) {
            console.warn(
              `    ⚠️  Text search "${industryQuery}" failed:`,
              err.message,
            );
          }
        }

        // 🟢 LOG: Tracking API usage
        const totalTextQueries =
          GooglePlacesService.INDUSTRY_SEARCH_QUERIES.length;
        const cost_saved_percent = (
          ((totalTextQueries - textSearchQueriesExecuted) / totalTextQueries) *
          100
        ).toFixed(1);
        console.log(
          `\n📊 Fallback Optimization: Executed ${textSearchQueriesExecuted}/${totalTextQueries} queries (${cost_saved_percent}% cost saved)`,
        );
        console.log(
          `   Added from fallback: ${results.length - afterNearby} companies`,
        );
      }

      const finalCount = results.length;
      console.log(`\n✅ Total unique companies found: ${finalCount}`);
      if (results.length > afterNearby) {
        const textSearchAdded = results.length - afterNearby;
        console.log(
          `   (Nearby: ${afterNearby - beforeNearby}, Text Search: ${textSearchAdded})`,
        );
      }

      return results;
    } catch (err) {
      console.error("Error in searchNearbyBusinesses:", err.message);
      throw err;
    }
  }

  /**
   * Tìm kiếm trong một radius cụ thể với pagination đầy đủ
   * @private
   */
  async _searchNearbyInRadius(
    query,
    latitude,
    longitude,
    radiusMeters,
    results,
    visited,
    keywords = GooglePlacesService.EXTENDED_KEYWORDS,
  ) {
    for (const keyword of keywords) {
      try {
        const response = await axios.get(`${this.baseUrl}/nearbysearch/json`, {
          params: {
            location: `${latitude},${longitude}`,
            radius: radiusMeters,
            keyword: keyword,
            key: this.apiKey,
          },
        });

        // Xử lý kết quả đầu tiên
        if (response.data.results) {
          for (const place of response.data.results) {
            if (!visited.has(place.place_id)) {
              visited.add(place.place_id);
              results.push(this._formatPlaceData(place));
            }
          }
        }

        // Xử lý tất cả trang tiếp theo (pagination)
        let nextPageToken = response.data.next_page_token;
        let pageCount = 1;
        const MAX_PAGES = 3; // Giới hạn tối đa 3 trang

        while (nextPageToken && pageCount < MAX_PAGES) {
          pageCount++;

          // Chờ lâu hơn trước trang tiếp theo (Google API requirement)
          // next_page_token cần delay 2-3s sau request đầu tiên
          const delayMs = pageCount === 2 ? 3000 : 2000;
          console.log(
            `    ⏳ Waiting ${delayMs}ms before fetching page ${pageCount}...`,
          );
          await new Promise((resolve) => setTimeout(resolve, delayMs));

          try {
            console.log(
              `    🔄 Fetching page ${pageCount} for "${keyword}"...`,
            );
            const pageResponse = await axios.get(
              `${this.baseUrl}/nearbysearch/json`,
              {
                params: {
                  pagetoken: nextPageToken,
                  key: this.apiKey,
                },
                timeout: 10000, // 10s timeout
              },
            );

            // ✅ Check API response status
            if (pageResponse.data.status !== "OK") {
              console.warn(
                `  ⚠️  Page ${pageCount} returned status: ${pageResponse.data.status}`,
              );
              if (pageResponse.data.error_message) {
                console.warn(`     Error: ${pageResponse.data.error_message}`);
              }
              break;
            }

            if (
              pageResponse.data.results &&
              pageResponse.data.results.length > 0
            ) {
              console.log(
                `    ✓ Page ${pageCount}: ${pageResponse.data.results.length} results`,
              );
              for (const place of pageResponse.data.results) {
                if (!visited.has(place.place_id)) {
                  visited.add(place.place_id);
                  results.push(this._formatPlaceData(place));
                }
              }
            } else {
              console.log(
                `    ℹ️  Page ${pageCount}: No results (end of pagination)`,
              );
              break; // No more results
            }

            nextPageToken = pageResponse.data.next_page_token;
            if (!nextPageToken) {
              console.log(`    ✓ No more pages`);
            }
          } catch (err) {
            console.error(
              `  ❌ Error processing page ${pageCount} for "${keyword}":`,
              err.message,
            );
            if (err.response?.data) {
              console.error(
                `     API Response:`,
                JSON.stringify(err.response.data),
              );
            }
            console.error(`     Will stop pagination for this keyword`);
            break; // Stop pagination on error
          }
        }

        if (pageCount > 1) {
          console.log(`    ✓ "${keyword}": ${pageCount} pages processed`);
        }
      } catch (err) {
        console.warn(`  ⚠️  Error searching "${keyword}": ${err.message}`);
      }
    }
  }

  /**
   * Tạo grid các điểm tìm kiếm để cover vùng lớn
   * Sử dụng "Hexagonal Grid" để coverage tối ưu
   * @private
   */
  _generateGridPoints(centerLat, centerLng, requestedRadius, apiMaxRadius) {
    const points = [];
    const earthRadiusKm = 6371;

    // Spacing giữa các điểm grid (dùng 80% của API radius để có overlap)
    const spacing = (apiMaxRadius * 0.8) / 1000; // Convert to km

    // Tính số điểm cần tạo dọc theo các trục
    const estimatedGridSize = Math.ceil(requestedRadius / 1000 / spacing);

    // Hex grid pattern (tối ưu hơn square grid)
    for (let row = -estimatedGridSize; row <= estimatedGridSize; row++) {
      for (let col = -estimatedGridSize; col <= estimatedGridSize; col++) {
        // Offset rows để tạo hex pattern
        const offsetCol = col + (row % 2) * 0.5;

        // Tính vị trí mới dựa trên spherical geometry
        const dLat = (row * spacing) / earthRadiusKm;
        const dLng =
          (offsetCol * spacing) /
          (earthRadiusKm * Math.cos((centerLat * Math.PI) / 180));

        const newLat = centerLat + (dLat * 180) / Math.PI;
        const newLng = centerLng + (dLng * 180) / Math.PI;

        // Kiểm tra điểm có nằm trong bán kính yêu cầu không
        const distance = this._haversineDistance(
          centerLat,
          centerLng,
          newLat,
          newLng,
        );

        if (distance * 1000 <= requestedRadius) {
          points.push({ lat: newLat, lng: newLng, distance });
        }
      }
    }

    // Sort theo khoảng cách từ tâm (tìm trung tâm trước)
    points.sort((a, b) => a.distance - b.distance);

    return points;
  }

  /**
   * Tính khoảng cách giữa 2 điểm (Haversine formula)
   * @private
   * @returns {Number} Khoảng cách tính bằng km
   */
  _haversineDistance(lat1, lng1, lat2, lng2) {
    const R = 6371; // Bán kính Trái Đất (km)
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Lấy chi tiết của một Place từ Google Places API
   * ⭐ IMPORTANT: requestFields chỉ để request những field cần thiết
   * Nếu request quá nhiều field, API sẽ trả về error hoặc incomplete data
   *
   * @param {String} placeId - Google Place ID
   * @returns {Object} - Chi tiết place (website, phone, hours, etc.)
   */
  async getPlaceDetails(placeId) {
    try {
      // 🔑 Chỉ request fields cần thiết - phải match Google Places API docs
      // review_count là INVALID, dùng user_ratings_total thay thế
      const fields =
        "name,formatted_address,geometry,formatted_phone_number,website,url,rating,user_ratings_total,opening_hours,business_status,place_id";

      const response = await axios.get(`${this.baseUrl}/details/json`, {
        params: {
          place_id: placeId,
          fields: fields,
          key: this.apiKey,
        },
      });

      console.log(`[getPlaceDetails] Response status: ${response.data.status}`);
      console.log(`[getPlaceDetails] Has result: ${!!response.data.result}`);

      if (response.data.result) {
        const formatted = this._formatPlaceDetailsData(response.data.result);

        console.log(
          `✅ [${formatted.name}] phone: ${formatted.phone}, website: ${formatted.website}, address: ${formatted.address}`,
        );

        return formatted;
      } else {
        console.error(
          `❌ No result in API response:`,
          JSON.stringify(response.data),
        );
        return null;
      }
    } catch (err) {
      console.error(
        `❌ Error getting place details for ${placeId}:`,
        err.message,
      );
      if (err.response?.data) {
        console.error(`API Error Response:`, JSON.stringify(err.response.data));
      }
      throw err;
    }
  }

  /**
   * Format dữ liệu từ Google Places API
   * @private
   */
  _formatPlaceData(place) {
    return {
      place_id: place.place_id,
      name: place.name,
      address: place.vicinity || place.formatted_address || "",
      lat: place.geometry?.location?.lat,
      lng: place.geometry?.location?.lng,
      types: place.types || [],
      opening_hours:
        place.opening_hours?.open_now !== undefined
          ? place.opening_hours.open_now
          : null,
      rating: place.rating || null,
      user_ratings_total: place.user_ratings_total || 0,
      phone: null, // Cần call getPlaceDetails
      website: null, // Cần call getPlaceDetails
      source: "google_places",
      raw_data: place,
    };
  }

  /**
   * Format chi tiết từ Place Details API
   * 🔍 Lấy website, phone, hours, etc. từ response
   * @private
   */
  _formatPlaceDetailsData(place) {
    return {
      place_id: place.place_id,
      name: place.name,
      address: place.formatted_address || "",
      lat: place.geometry?.location?.lat,
      lng: place.geometry?.location?.lng,
      phone: place.formatted_phone_number || null,
      website: place.website || null, // ✅ Website từ API
      url: place.url || null, // 📍 Google Maps URL
      rating: place.rating || null,
      user_ratings_total: place.user_ratings_total || 0,
      business_status: place.business_status || "OPERATIONAL",
      opening_hours: place.opening_hours || null,
      types: place.types || [],
      raw_data: place, // ✅ Include raw data
    };
  }

  /**
   * Tìm kiếm theo text query
   * @param {String} query - Từ khóa tìm kiếm
   * @param {Number} latitude
   * @param {Number} longitude
   * @param {Number} radiusMeters - Bán kính tìm kiếm (optional, default 50km)
   * @returns {Array} - Danh sách kết quả
   */
  async textSearch(query, latitude, longitude, radiusMeters = 50000) {
    try {
      const response = await axios.get(`${this.baseUrl}/textsearch/json`, {
        params: {
          query: query,
          location: `${latitude},${longitude}`,
          radius: Math.min(radiusMeters, 50000), // Cap at 50km for text search
          key: this.apiKey,
        },
      });

      const results = response.data.results || [];
      return results.map((r) => this._formatPlaceData(r));
    } catch (err) {
      console.error("Error in textSearch:", err.message);
      throw err;
    }
  }

  /**
   * Lấy chi tiết (bao gồm phone, website, email) cho nhiều places
   * ⭐ IMPORTANT: Nearby Search không trả về phone/website/email
   * Phải gọi Details API cho mỗi place riêng
   *
   * @param {Array} places - Danh sách places từ nearby search
   * @param {Number} limit - Số lượng details để lấy (default 20 để tránh rate limit)
   * @returns {Array} - Places kèm chi tiết contact
   */
  async enrichPlacesWithContactDetails(places, limit = 20) {
    if (!places || places.length === 0) return [];

    const enrichedPlaces = [];
    const toEnrich = places.slice(0, limit); // Giới hạn để tránh rate limit

    console.log(
      `\n📞 Enriching ${toEnrich.length} places with contact details...`,
    );

    for (let i = 0; i < toEnrich.length; i++) {
      const place = toEnrich[i];
      try {
        // Delay để tránh rate limit
        if (i > 0) {
          await new Promise((resolve) => setTimeout(resolve, 200));
        }

        const details = await this.getPlaceDetails(place.place_id);
        if (details) {
          enrichedPlaces.push({
            ...place,
            phone: details.phone,
            website: details.website,
            url: details.url, // ✅ Thêm Google Maps URL
            business_status: details.business_status,
            formatted_phone_number: details.phone, // Aliases
            opening_hours: details.opening_hours || place.opening_hours,
            user_ratings_total:
              details.user_ratings_total || place.user_ratings_total,
          });
        } else {
          enrichedPlaces.push(place);
        }
      } catch (err) {
        console.warn(
          `⚠️  Failed to enrich ${place.name}: ${err.message}. Using without details.`,
        );
        enrichedPlaces.push(place);
      }
    }

    // Thêm places còn lại (không enriched)
    if (places.length > limit) {
      console.log(
        `ℹ️  ${places.length - limit} places returned without enrichment (to avoid rate limit)`,
      );
      enrichedPlaces.push(...places.slice(limit));
    }

    return enrichedPlaces;
  }

  /**
   * ⭐ NEW: Search with streaming callback per grid point
   * Calls onGridComplete callback after each grid point is done
   * Perfect for real-time DB saving instead of waiting for all grids
   *
   * @param {String} hotelName
   * @param {Number} latitude
   * @param {Number} longitude
   * @param {Array} types
   * @param {Number} radiusMeters
   * @param {Number} gridRadiusMeters
   * @param {Function} onGridComplete - Callback(gridIndex, gridPoints, gridCount)
   */
  async searchNearbyBusinessesWithCallback(
    hotelName,
    latitude,
    longitude,
    types = ["company", "establishment", "point_of_interest"],
    radiusMeters = 100000,
    gridRadiusMeters = 50000,
    onGridComplete = null,
  ) {
    try {
      const visited = new Set(); // Global set to track all visited places
      const MAX_API_RADIUS = Math.min(gridRadiusMeters, 50000);
      const selectedKeywords = this._selectKeywordSet(radiusMeters);

      // If direct search (no grid needed)
      if (radiusMeters <= MAX_API_RADIUS) {
        console.log(
          `📍 Direct search with radius: ${radiusMeters}m (grid_radius: ${MAX_API_RADIUS}m)`,
        );
        const results = [];
        await this._searchNearbyInRadius(
          hotelName,
          latitude,
          longitude,
          radiusMeters,
          results,
          visited,
          selectedKeywords,
        );

        if (onGridComplete) {
          await onGridComplete(0, results, 1);
        }
        return results;
      }

      // Grid search - call callback after each grid point
      console.log(
        `📊 Grid search: radius ${radiusMeters}m with grid_radius ${MAX_API_RADIUS}m`,
      );
      const gridPoints = this._generateGridPoints(
        latitude,
        longitude,
        radiusMeters,
        MAX_API_RADIUS,
      );
      console.log(`🔍 Generated ${gridPoints.length} grid points to search`);

      const allResults = [];
      for (let i = 0; i < gridPoints.length; i++) {
        const point = gridPoints[i];
        console.log(
          `  [${i + 1}/${gridPoints.length}] Searching at (${point.lat.toFixed(4)}, ${point.lng.toFixed(4)})`,
        );

        const gridResults = [];
        await this._searchNearbyInRadius(
          hotelName,
          point.lat,
          point.lng,
          MAX_API_RADIUS,
          gridResults,
          visited,
          selectedKeywords,
        );

        // ✅ Call callback with results from this grid point
        if (onGridComplete) {
          await onGridComplete(i, gridResults, gridPoints.length);
        }

        allResults.push(...gridResults);

        // Delay to avoid rate limit
        if (i < gridPoints.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }

      console.log(`\n✅ Total unique companies found: ${allResults.length}`);
      return allResults;
    } catch (err) {
      console.error(
        "Error in searchNearbyBusinessesWithCallback:",
        err.message,
      );
      throw err;
    }
  }
}

export default GooglePlacesService;
