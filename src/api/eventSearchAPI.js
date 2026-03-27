/**
 * Event Search API Routes
 * Endpoints untuk mencari sự kiện menggunakan Perplexity dan OpenAI
 *
 * Endpoints:
 * POST /api/events/search-perplexity
 * POST /api/events/search-openai
 * POST /api/events/search-advanced
 * POST /api/events/compare
 */

import PerplexityEventService from "../services/perplexityEventService.js";
import OpenAIEventService from "../services/openaiEventService.js";

export class EventSearchAPI {
  constructor(perplexityApiKey, openaiApiKey, eventbriteToken, predictHqToken) {
    this.perplexity = perplexityApiKey
      ? new PerplexityEventService(perplexityApiKey)
      : null;
    this.openai = openaiApiKey
      ? new OpenAIEventService(openaiApiKey, eventbriteToken, predictHqToken)
      : null;
  }

  /**
   * Infer events using OpenAI
   * POST /api/events/infer-openai
   *
   * Body:
   * {
   *   "companies": [
   *     {
   *       "company_name": "Google Vietnam",
   *       "website": "google.com.vn",
   *       "industry": "Technology",
   *       "address": "Ho Chi Minh City, Vietnam",
   *       "distance_from_center": 0
   *     },
   *     ...
   *   ]
   * }
   */
  async handleInferOpenAI(req, res) {
    try {
      if (!this.openai) {
        return res.status(503).json({
          success: false,
          error: "OpenAI API not configured. Add OPENAI_API_KEY to .env",
        });
      }

      const { companies } = req.body;

      if (!companies || !Array.isArray(companies) || companies.length === 0) {
        return res.status(400).json({
          success: false,
          error: "companies array là bắt buộc và phải không rỗng",
        });
      }

      const result = await this.openai.inferCompanyEvents(companies);

      return res.json(result);
    } catch (error) {
      console.error("❌ OpenAI Infer Events Error:", error.message);
      return res.status(500).json({
        success: false,
        error: error.message,
        provider: "openai",
      });
    }
  }

  /**
   * Infer events using Perplexity
   * POST /api/events/infer-perplexity
   *
   * Body:
   * {
   *   "companies": [
   *     {
   *       "company_name": "Google Vietnam",
   *       "website": "google.com.vn",
   *       "industry": "Technology",
   *       "address": "Ho Chi Minh City, Vietnam",
   *       "distance_from_center": 0
   *     },
   *     ...
   *   ]
   * }
   */
  async handleInferPerplexity(req, res) {
    try {
      if (!this.perplexity) {
        return res.status(503).json({
          success: false,
          error:
            "Perplexity API not configured. Add PERPLEXITY_API_KEY to .env",
        });
      }

      const { companies } = req.body;

      if (!companies || !Array.isArray(companies) || companies.length === 0) {
        return res.status(400).json({
          success: false,
          error: "companies array là bắt buộc và phải không rỗng",
        });
      }

      const result = await this.perplexity.inferCompanyEvents(companies);

      return res.json(result);
    } catch (error) {
      console.error("❌ Perplexity Infer Events Error:", error.message);
      return res.status(500).json({
        success: false,
        error: error.message,
        provider: "perplexity",
      });
    }
  }

  /**
   * Compare inference from both providers
   * POST /api/events/infer-compare
   *
   * Body:
   * {
   *   "companies": [...]
   * }
   */
  async handleInferCompare(req, res) {
    try {
      const { companies } = req.body;

      if (!companies || !Array.isArray(companies) || companies.length === 0) {
        return res.status(400).json({
          success: false,
          error: "companies array là bắt buộc và phải không rỗng",
        });
      }

      const openaiPromise =
        this.openai &&
        this.openai.inferCompanyEvents(companies).catch((e) => ({
          success: false,
          error: e.message,
          inferred_data: [],
        }));

      const perplexityPromise =
        this.perplexity &&
        this.perplexity.inferCompanyEvents(companies).catch((e) => ({
          success: false,
          error: e.message,
          inferred_data: [],
        }));

      const [openaiResult, perplexityResult] = await Promise.all([
        openaiPromise || Promise.resolve({ inferred_data: [] }),
        perplexityPromise || Promise.resolve({ inferred_data: [] }),
      ]);

      return res.json({
        success: true,
        total_companies: companies.length,
        providers: {
          openai: {
            success: openaiResult.success,
            total_inferred: openaiResult.inferred_data?.length || 0,
            data: openaiResult.inferred_data,
          },
          perplexity: {
            success: perplexityResult.success,
            total_inferred: perplexityResult.inferred_data?.length || 0,
            data: perplexityResult.inferred_data,
          },
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("❌ Infer Compare Error:", error.message);
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Search using Perplexity
   * POST /api/events/search-perplexity
   *
   * Body:
   * {
   *   "companyName": "Google Vietnam",
   *   "website": "google.com.vn",
   *   "location": "Ho Chi Minh City",
   *   "limit": 20,
   *   "includeContacts": true
   * }
   */
  async handleSearchPerplexity(req, res) {
    try {
      if (!this.perplexity) {
        return res.status(503).json({
          success: false,
          error:
            "Perplexity API not configured. Add PERPLEXITY_API_KEY to .env",
        });
      }

      const {
        companyName,
        website,
        location,
        limit = 20,
        includeContacts = true,
      } = req.body;

      if (!companyName) {
        return res.status(400).json({
          success: false,
          error: "companyName là bắt buộc",
        });
      }

      const result = await this.perplexity.findCompanyEvents(
        companyName,
        website || "",
        location || "Vietnam",
        {
          limit,
          includeContacts,
        },
      );

      return res.json(result);
    } catch (error) {
      console.error("❌ Perplexity API Error:", error.message);
      return res.status(500).json({
        success: false,
        error: error.message,
        provider: "perplexity",
      });
    }
  }

  /**
   * Search using OpenAI
   * POST /api/events/search-openai
   *
   * Body:
   * {
   *   "companyName": "Google Vietnam",
   *   "website": "google.com.vn",
   *   "location": "Ho Chi Minh City",
   *   "limit": 20,
   *   "includeContacts": true,
   *   "useExternalApis": true
   * }
   */
  async handleSearchOpenAI(req, res) {
    try {
      if (!this.openai) {
        return res.status(503).json({
          success: false,
          error: "OpenAI API not configured. Add OPENAI_API_KEY to .env",
        });
      }

      const {
        companyName,
        website,
        location,
        limit = 20,
        includeContacts = true,
        useExternalApis = true,
      } = req.body;

      if (!companyName) {
        return res.status(400).json({
          success: false,
          error: "companyName là bắt buộc",
        });
      }

      const result = await this.openai.findCompanyEvents(
        companyName,
        website || "",
        location || "Vietnam",
        {
          limit,
          includeContacts,
          useExternalApis,
        },
      );

      // Add warning about potential hallucination
      return res.json({
        ...result,
        notes: {
          warning:
            "OpenAI uses training data (cutoff April 2024) - results may include hallucinated events",
          recommendation:
            "Cross-verify events with Perplexity or external APIs for accuracy",
          confidence_levels:
            "Each event has 'confidence' field: high/medium/low",
        },
      });
    } catch (error) {
      console.error("❌ OpenAI API Error:", error.message);
      return res.status(500).json({
        success: false,
        error: error.message,
        provider: "openai",
      });
    }
  }

  /**
   * Advanced search with filters using OpenAI
   * POST /api/events/search-advanced
   *
   * Body:
   * {
   *   "companyName": "Google Vietnam",
   *   "website": "google.com.vn",
   *   "location": "Ho Chi Minh City",
   *   "filters": {
   *     "eventTypes": ["Conference", "Meetup"],
   *     "dateRange": {
   *       "from": "2024-01-01",
   *       "to": "2026-12-31"
   *     },
   *     "keywords": ["technology", "AI"],
   *     "minAttendees": 100
   *   }
   * }
   */
  async handleAdvancedSearch(req, res) {
    try {
      if (!this.openai) {
        return res.status(503).json({
          success: false,
          error: "OpenAI API not configured. Add OPENAI_API_KEY to .env",
        });
      }

      const { companyName, website, location, filters = {} } = req.body;

      if (!companyName) {
        return res.status(400).json({
          success: false,
          error: "companyName là bắt buộc",
        });
      }

      const result = await this.openai.advancedSearch(
        companyName,
        website || "",
        location || "Vietnam",
        filters,
      );

      return res.json(result);
    } catch (error) {
      console.error("❌ Advanced Search Error:", error.message);
      return res.status(500).json({
        success: false,
        error: error.message,
        provider: "openai",
      });
    }
  }

  /**
   * Compare results from Perplexity and OpenAI
   * POST /api/events/compare
   *
   * Body:
   * {
   *   "companyName": "Google Vietnam",
   *   "website": "google.com.vn",
   *   "location": "Ho Chi Minh City",
   *   "limit": 15
   * }
   *
   * Response:
   * {
   *   "company": {...},
   *   "perplexity_results": [...],
   *   "openai_results": [...],
   *   "comparison": {
   *     "unique_in_perplexity": [...],
   *     "unique_in_openai": [...],
   *     "found_in_both": [...],
   *     "common_events_count": N
   *   },
   *   "analysis": "..."
   * }
   */
  async handleCompareProviders(req, res) {
    try {
      const { companyName, website, location, limit = 15 } = req.body;

      if (!companyName) {
        return res.status(400).json({
          success: false,
          error: "companyName là bắt buộc",
        });
      }

      const perplexityPromise =
        this.perplexity &&
        this.perplexity.findCompanyEvents(
          companyName,
          website || "",
          location || "Vietnam",
          {
            limit,
            includeContacts: true,
          },
        );

      const openaiPromise =
        this.openai &&
        this.openai.findCompanyEvents(
          companyName,
          website || "",
          location || "Vietnam",
          {
            limit,
            includeContacts: true,
            useExternalApis: false, // Only use OpenAI for fair comparison
          },
        );

      const [perplexityResult, openaiResult] = await Promise.all([
        perplexityPromise || Promise.resolve({ events: [] }),
        openaiPromise || Promise.resolve({ events: [] }),
      ]);

      // Analyze differences
      const comparison = this._compareResults(
        perplexityResult.events || [],
        openaiResult.events || [],
      );

      return res.json({
        success: true,
        company: {
          name: companyName,
          website: website,
          location: location,
        },
        perplexity_results: {
          total: (perplexityResult.events || []).length,
          events: (perplexityResult.events || []).slice(0, limit),
        },
        openai_results: {
          total: (openaiResult.events || []).length,
          events: (openaiResult.events || []).slice(0, limit),
        },
        comparison: comparison,
        analysis: this._generateComparison(comparison),
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("❌ Compare Error:", error.message);
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Compare two result sets
   */
  _compareResults(perplexityEvents, openaiEvents) {
    const normalizeKey = (event) => {
      const name = (event.name || "").toLowerCase().trim();
      const date = (event.date || "").substring(0, 7); // YYYY-MM
      return `${name}|${date}`;
    };

    const perplexityKeys = new Set(perplexityEvents.map(normalizeKey));
    const openaiKeys = new Set(openaiEvents.map(normalizeKey));

    const commonKeys = new Set(
      [...perplexityKeys].filter((k) => openaiKeys.has(k)),
    );

    const uniqueInPerplexity = perplexityEvents
      .filter((e) => !commonKeys.has(normalizeKey(e)))
      .slice(0, 10);

    const uniqueInOpenAI = openaiEvents
      .filter((e) => !commonKeys.has(normalizeKey(e)))
      .slice(0, 10);

    const foundInBoth = perplexityEvents
      .filter((e) => commonKeys.has(normalizeKey(e)))
      .slice(0, 10);

    return {
      total_perplexity: perplexityEvents.length,
      total_openai: openaiEvents.length,
      common_events_count: commonKeys.size,
      unique_in_perplexity: uniqueInPerplexity,
      unique_in_openai: uniqueInOpenAI,
      found_in_both: foundInBoth,
      similarity_percentage: {
        perplexity_coverage: (
          (commonKeys.size / Math.max(perplexityEvents.length, 1)) *
          100
        ).toFixed(1),
        openai_coverage: (
          (commonKeys.size / Math.max(openaiEvents.length, 1)) *
          100
        ).toFixed(1),
      },
    };
  }

  /**
   * Generate analysis text comparing both providers
   */
  _generateComparison(comparison) {
    const {
      total_perplexity,
      total_openai,
      common_events_count,
      similarity_percentage,
    } = comparison;

    let analysis = `## So Sánh Kết Quả Tìm Kiếm Sự Kiện\n\n`;

    analysis += `**Tóm Tắt:**\n`;
    analysis += `- Perplexity tìm được: ${total_perplexity} sự kiện\n`;
    analysis += `- OpenAI tìm được: ${total_openai} sự kiện\n`;
    analysis += `- Sự kiện chung có ở cả hai: ${common_events_count} sự kiện\n\n`;

    analysis += `**Độ Bao Phủ:**\n`;
    analysis += `- Perplexity coverage: ${similarity_percentage.perplexity_coverage}%\n`;
    analysis += `- OpenAI coverage: ${similarity_percentage.openai_coverage}%\n\n`;

    if (total_perplexity > total_openai) {
      analysis += `📊 **Nhận Xét:** Perplexity tìm được nhiều sự kiện hơn (${total_perplexity - total_openai} thêm), có thể do nó có khả năng tìm kiếm web tốt hơn.\n`;
    } else if (total_openai > total_perplexity) {
      analysis += `📊 **Nhận Xét:** OpenAI kết hợp nhiều nguồn tìm được nhiều hơn (${total_openai - total_perplexity} thêm), bao gồm Eventbrite và PredictHQ.\n`;
    } else {
      analysis += `📊 **Nhận Xét:** Cả hai nền tảng tìm được số lượng sự kiện tương đương.\n`;
    }

    return analysis;
  }

  /**
   * Get organizer details
   * POST /api/events/organizer-details
   *
   * Body:
   * {
   *   "organizerName": "Tech Meetup Vietnam",
   *   "location": "Ho Chi Minh",
   *   "provider": "perplexity" // or "openai"
   * }
   */
  async handleGetOrganizerDetails(req, res) {
    try {
      const { organizerName, location, provider = "perplexity" } = req.body;

      if (!organizerName) {
        return res.status(400).json({
          success: false,
          error: "organizerName là bắt buộc",
        });
      }

      let details;

      if (provider === "perplexity" && this.perplexity) {
        details = await this.perplexity.findOrganizerDetails(
          organizerName,
          location,
        );
      } else if (provider === "openai" && this.openai) {
        // OpenAI doesn't have dedicated organizer lookup, return message
        details = {
          organizer_name: organizerName,
          location: location,
          message:
            "Use search endpoint to get organizer details embedded in event results",
        };
      } else {
        return res.status(400).json({
          success: false,
          error: `Provider "${provider}" not available or not configured`,
        });
      }

      return res.json({
        success: true,
        organizer: details,
        provider: provider,
      });
    } catch (error) {
      console.error("❌ Organizer Details Error:", error.message);
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
}

export default EventSearchAPI;
