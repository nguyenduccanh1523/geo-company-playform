/**
 * OpenAI Event Search Service
 * Tìm sự kiện tổ chức bởi công ty sử dụng OpenAI + Web Search
 *
 * Sử dụng OpenAI để phân tích, tổng hợp và trích xuất thông tin sự kiện
 * từ nhiều nguồn kết hợp với các API bên ngoài
 */

import axios from "axios";
import EventbriteService from "./eventbriteService.js";
import PredictHqService from "./predictHqService.js";

class OpenAIEventService {
  constructor(openaiApiKey, eventbriteToken = null, predictHqToken = null) {
    this.apiKey = openaiApiKey;
    this.baseUrl = "https://api.openai.com/v1";
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      timeout: 30000,
    });

    // Initialize auxiliary services
    this.eventbriteService = eventbriteToken
      ? new EventbriteService(eventbriteToken)
      : null;
    this.predictHqService = predictHqToken
      ? new PredictHqService(predictHqToken)
      : null;
  }

  /**
   * Infer events mà công ty có thể tổ chức dựa trên company profile
   * @param {array} companies - Danh sách company profiles JSON
   * @param {object} options - Options thêm
   */
  async inferCompanyEvents(companies, options = {}) {
    try {
      console.log(
        `🤖 OpenAI: Inferring events for ${companies.length} companies`,
      );

      const systemPrompt = `You are a B2B event verification assistant. Extract VERIFIED events only from public sources.

CRITICAL CONSISTENCY RULES:
1. ALWAYS return objects in this EXACT order by date (newest first)
2. ALWAYS include event_id field = MD5(company_name + event_name + date) for deduplication
3. Return MINIMUM 1, MAXIMUM 3 verified events per company
4. If less than 1 verified event, return single "no information" placeholder only
5. Same company searched multiple times MUST return same events (deterministic)

VERIFICATION REQUIREMENTS:
- Event must exist in: company website OR LinkedIn OR press release OR news article
- Include direct evidence: URL or source name
- Confidence score proportional to evidence strength

JSON OUTPUT SCHEMA (REQUIRED):
{
  "company_name": "string",
  "total_verified_events": number,
  "events": [
    {
      "event_id": "unique-hash-md5",
      "event_name": "string",
      "event_type": "Conference|Trade show|Workshop|Community|Corporate retreat|Product launch|Nonprofit|Seasonal|Other",
      "description": "string (1-2 sentences, factual)",
      "date_verified": "YYYY-MM-DD",
      "source": "company website|LinkedIn|press release|news article",
      "source_url": "URL or 'N/A'",
      "estimated_scale": "small|medium|large",
      "estimated_attendees": number,
      "estimated_budget_usd": number,
      "frequency": "one-time|annual|quarterly|monthly",
      "confidence_score": 0.0-1.0
    }
  ]
}

If NO verified events found, return:
{
  "company_name": "string",
  "total_verified_events": 0,
  "events": [
    {
      "event_id": "no-information",
      "event_name": "no information",
      "event_type": "Other",
      "description": "No verified events found",
      "date_verified": "N/A",
      "source": "N/A",
      "source_url": "N/A",
      "estimated_scale": "small",
      "estimated_attendees": 0,
      "estimated_budget_usd": 0,
      "frequency": "one-time",
      "confidence_score": 0.0
    }
  ]
}

CRITICAL: Return ONLY JSON. No markdown. No explanation. No extra text.`;

      const userPrompt = `Verify and extract events for EACH company. Return ONLY JSON array:

${JSON.stringify(companies, null, 2)}

REQUIREMENTS:
- Return 1-3 VERIFIED events per company (sorted by date, newest first)
- Include event_id, source, and source_url for traceability
- Sort identically each time for same input (deterministic)
- Return exact schema above

Return valid JSON array only - no markdown or explanation.`;

      let content = null;
      const response = await this.client.post("/chat/completions", {
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: userPrompt,
          },
        ],
        temperature: 0.0,
        max_tokens: 2000,
      });

      content = response.data.choices[0].message.content.trim();

      console.log("\n🤖 OpenAI Raw Response Length:", content.length);

      let jsonString = content;

      // Remove markdown
      jsonString = jsonString
        .replace(/^```json\n?/gm, "")
        .replace(/^```\n?/gm, "")
        .replace(/\n?```$/gm, "")
        .trim();

      // Extract array
      const arrayMatch = jsonString.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        jsonString = arrayMatch[0];
      }

      const inferredEvents = JSON.parse(jsonString);

      return {
        success: true,
        provider: "openai",
        mode: "verify",
        total_companies: companies.length,
        inferred_data: inferredEvents,
      };
    } catch (error) {
      console.error("❌ OpenAI Event Inference Error:", error.message);
      if (error.response?.status === 400) {
        console.error("400 Bad Request - Check API key and request format");
      }
      console.error("Raw content:", content?.substring(0, 500) || "N/A");
      return {
        success: false,
        provider: "openai",
        error: error.message,
        inferred_data: [],
      };
    }
  }

  /**
   * Tìm sự kiện của công ty sử dụng OpenAI (legacy - tìm sự kiện lịch sử)
   * @param {string} companyName - Tên công ty
   * @param {string} website - Website của công ty
   * @param {string} location - Địa điểm công ty
   * @param {object} options - Options thêm
   */
  async findCompanyEvents(companyName, website, location, options = {}) {
    try {
      const {
        limit = 20,
        includeContacts = true,
        useExternalApis = true,
      } = options;

      console.log(
        `🤖 OpenAI: Searching for events of "${companyName}" with web context`,
      );

      // Parallel search từ các nguồn
      const searchPromises = [
        this._searchViaOpenAI(companyName, website, location, includeContacts),
      ];

      if (useExternalApis) {
        if (this.eventbriteService) {
          searchPromises.push(
            this._searchEventbrite(companyName, location).catch((e) => {
              console.warn("Eventbrite search failed:", e.message);
              return { events: [] };
            }),
          );
        }

        if (this.predictHqService) {
          searchPromises.push(
            this._searchPredictHQ(companyName, location).catch((e) => {
              console.warn("PredictHQ search failed:", e.message);
              return { events: [] };
            }),
          );
        }
      }

      const [openaiResults, eventbriteResults = {}, predictHqResults = {}] =
        await Promise.all(searchPromises);

      // Merge and deduplicate results
      const allEvents = this._mergeAndDedupEvents(
        openaiResults.events || [],
        eventbriteResults.events || [],
        predictHqResults.events || [],
      );

      // Enrich events with contact information
      const enrichedEvents = await Promise.all(
        allEvents.slice(0, limit).map((event) =>
          this._enrichEventWithContacts(event, companyName)
            .catch((e) => {
              console.warn("Event enrichment failed:", e.message);
              return event;
            })
            .then((enriched) => enriched),
        ),
      );

      return {
        success: true,
        provider: "openai",
        company: {
          name: companyName,
          website: website,
          location: location,
        },
        events: enrichedEvents,
        total_events: allEvents.length,
        sources: {
          openai: openaiResults.events?.length || 0,
          eventbrite: eventbriteResults.events?.length || 0,
          predicthq: predictHqResults.events?.length || 0,
        },
      };
    } catch (error) {
      console.error("❌ OpenAI Event Search Error:", error.message);
      return {
        success: false,
        provider: "openai",
        error: error.message,
        events: [],
      };
    }
  }

  /**
   * Search via OpenAI API with function calling
   */
  async _searchViaOpenAI(companyName, website, location, includeContacts) {
    try {
      const systemPrompt = `Bạn là chuyên gia tìm kiếm và phân tích sự kiện doanh nghiệp.
Nhiệm vụ: Tìm tất cả các sự kiện từ trước đến nay mà công ty đã tổ chức hoặc tham gia.
Cung cấp đầy đủ thông tin bao gồm:
- Tên sự kiện chi tiết
- Ngày tổ chức (nếu có dải thời gian, hãy cung cấp cả ngày bắt đầu và kết thúc)
- Địa điểm cụ thể
- Người tổ chức chính
${includeContacts ? "- Thông tin liên lạc của người tổ chức (email, điện thoại, website)" : ""}
- Mô tả về sự kiện
- Vai trò của công ty (tổ chức, tài trợ, đối tác, khách hàng)
- URL hoặc nguồn thông tin nếu có

Trả lại kết quả dưới dạng JSON structured.`;

      const userPrompt = `Tìm thông tin về các sự kiện của công ty:
- Tên công ty: "${companyName}"
${website ? `- Website: ${website}` : ""}
${location ? `- Địa điểm: ${location}` : ""}

Hãy tìm kiếm từ các nguồn tin đáng tin cậy như:
1. Website của công ty
2. Các trang sự kiện (Eventbrite, Facebook Events, LinkedIn)
3. Các bài báo và tin tức về công ty
4. Các báo cáo ngành
5. Các hồ sơ công cộng

Trả lại tối đa 30 sự kiện, sắp xếp theo thời gian giảm dần (mới nhất trước).`;

      const functions = [
        {
          name: "extract_events",
          description: "Trích xuất danh sách các sự kiện từ dữ liệu tìm kiếm",
          parameters: {
            type: "object",
            properties: {
              events: {
                type: "array",
                description: "Danh sách các sự kiện",
                items: {
                  type: "object",
                  properties: {
                    name: {
                      type: "string",
                      description: "Tên sự kiện",
                    },
                    date: {
                      type: "string",
                      description: "Ngày tổ chức (YYYY-MM-DD)",
                    },
                    date_end: {
                      type: "string",
                      description: "Ngày kết thúc nếu là sự kiện multi-day",
                    },
                    location: {
                      type: "string",
                      description: "Địa điểm tổ chức",
                    },
                    organizer: {
                      type: "string",
                      description: "Người/Công ty tổ chức",
                    },
                    organizer_email: {
                      type: "string",
                      description: "Email người tổ chức",
                    },
                    organizer_phone: {
                      type: "string",
                      description: "Điện thoại người tổ chức",
                    },
                    organizer_website: {
                      type: "string",
                      description: "Website người tổ chức",
                    },
                    event_type: {
                      type: "string",
                      description:
                        "Loại sự kiện (Conference, Meetup, Workshop, Seminar, etc)",
                    },
                    description: {
                      type: "string",
                      description: "Mô tả sự kiện",
                    },
                    url: {
                      type: "string",
                      description: "URL sự kiện",
                    },
                    company_role: {
                      type: "string",
                      description:
                        "Vai trò của công ty (organizer, sponsor, exhibitor, participant)",
                    },
                    attendees: {
                      type: "string",
                      description: "Số người tham gia hoặc phạm vi",
                    },
                    source: {
                      type: "string",
                      description: "Nguồn thông tin",
                    },
                  },
                  required: ["name", "organizer", "event_type"],
                },
              },
              summary: {
                type: "string",
                description: "Tóm tắt về các sự kiện của công ty",
              },
            },
            required: ["events"],
          },
        },
      ];

      const response = await this.client.post("/chat/completions", {
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: userPrompt,
          },
        ],
        functions: functions,
        function_call: { name: "extract_events" },
        temperature: 0.3,
        max_tokens: 4000,
      });

      const message = response.data.choices[0].message;

      if (
        message.function_call &&
        message.function_call.name === "extract_events"
      ) {
        const parsedArgs = JSON.parse(message.function_call.arguments);
        return {
          events: parsedArgs.events || [],
          summary: parsedArgs.summary,
        };
      }

      // Fallback: parse content if function call didn't work
      return {
        events: this._parseOpenAIContent(message.content),
        summary: message.content,
      };
    } catch (error) {
      console.error("Error in OpenAI search:", error.message);
      return { events: [] };
    }
  }

  /**
   * Search via Eventbrite
   */
  async _searchEventbrite(companyName, location) {
    try {
      if (!this.eventbriteService) return { events: [] };

      const events = await this.eventbriteService.searchCompanyEvents(
        companyName,
        location,
        50,
      );

      return {
        events: events.map((e) => ({
          name: e.name,
          date: e.start?.utc?.split("T")[0] || "N/A",
          location: e.location || location,
          organizer: e.organizer_name || "Unknown",
          event_type: "Conference/Event",
          description: e.description,
          url: e.url,
          company_role: "participant",
          source: "eventbrite",
        })),
      };
    } catch (error) {
      console.error("Eventbrite search error:", error.message);
      return { events: [] };
    }
  }

  /**
   * Search via PredictHQ
   */
  async _searchPredictHQ(companyName, location) {
    try {
      if (!this.predictHqService) return { events: [] };

      const events = await this.predictHqService.searchCompanyEvents(
        companyName,
        location,
      );

      return {
        events: events.map((e) => ({
          name: e.title,
          date: e.start?.split("T")[0] || "N/A",
          location: e.location || location,
          organizer: e.organizer || "Unknown",
          event_type: e.category || "Event",
          description: e.description,
          url: e.url,
          company_role: "participant",
          source: "predicthq",
        })),
      };
    } catch (error) {
      console.error("PredictHQ search error:", error.message);
      return { events: [] };
    }
  }

  /**
   * Parse OpenAI content if function calling fails
   */
  _parseOpenAIContent(content) {
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return parsed.events || [];
      }
    } catch (error) {
      console.warn("Could not parse OpenAI content:", error.message);
    }
    return [];
  }

  /**
   * Merge and deduplicate events from multiple sources
   */
  _mergeAndDedupEvents(...eventArrays) {
    const map = new Map();

    for (const events of eventArrays) {
      for (const event of events) {
        const key = `${(event.name || "").toLowerCase()}-${(event.date || "").substring(0, 7)}`;

        if (!map.has(key)) {
          map.set(key, {
            ...event,
            sources: [event.source || "unknown"],
          });
        } else {
          // Merge information from multiple sources
          const existing = map.get(key);
          if (!existing.organizer_email && event.organizer_email) {
            existing.organizer_email = event.organizer_email;
          }
          if (!existing.organizer_phone && event.organizer_phone) {
            existing.organizer_phone = event.organizer_phone;
          }
          if (!existing.url && event.url) {
            existing.url = event.url;
          }
          existing.sources.push(event.source || "unknown");
        }
      }
    }

    return Array.from(map.values());
  }

  /**
   * Enrich event with additional contact information via OpenAI
   */
  async _enrichEventWithContacts(event, companyName) {
    try {
      if (event.organizer_email && event.organizer_phone) {
        return event; // Already has contact info
      }

      const prompt = `Based on the event information below, find additional contact details for the organizer:

Event: ${event.name}
Date: ${event.date}
Organizer: ${event.organizer}
Location: ${event.location}

If you can find:
1. Email address
2. Phone number
3. Website
4. Organization details
5. Social media handles

Return as JSON. If information is not available, return null for those fields.`;

      const response = await this.client.post("/chat/completions", {
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content:
              "You are an expert at finding contact information for event organizers.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.2,
        max_tokens: 500,
      });

      try {
        const content = response.data.choices[0].message.content;
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const enriched = JSON.parse(jsonMatch[0]);
          return {
            ...event,
            organizer_email: enriched.email || event.organizer_email,
            organizer_phone: enriched.phone || event.organizer_phone,
            organizer_website: enriched.website || event.organizer_website,
          };
        }
      } catch (parseError) {
        console.warn("Could not parse enrichment response");
      }

      return event;
    } catch (error) {
      console.warn("Event enrichment error:", error.message);
      return event;
    }
  }

  /**
   * Advanced search combining multiple filters
   */
  async advancedSearch(companyName, website, location, filters = {}) {
    try {
      const {
        eventTypes = [],
        dateRange = {},
        keywords = [],
        minAttendees = 0,
      } = filters;

      console.log(`🔎 OpenAI Advanced Search for "${companyName}"`);

      let filterDescription = "";

      if (eventTypes.length > 0) {
        filterDescription += `\nEvent types: ${eventTypes.join(", ")}`;
      }
      if (dateRange.from) {
        filterDescription += `\nDate range: from ${dateRange.from}`;
      }
      if (dateRange.to) {
        filterDescription += ` to ${dateRange.to}`;
      }
      if (keywords.length > 0) {
        filterDescription += `\nKeywords: ${keywords.join(", ")}`;
      }

      const results = await this.findCompanyEvents(
        companyName,
        website,
        location,
        {
          limit: 50,
          includeContacts: true,
        },
      );

      // Apply additional filters
      let filtered = results.events;

      if (eventTypes.length > 0) {
        filtered = filtered.filter((e) =>
          eventTypes.some((t) =>
            (e.event_type || "").toLowerCase().includes(t.toLowerCase()),
          ),
        );
      }

      if (dateRange.from) {
        filtered = filtered.filter((e) => (e.date || "") >= dateRange.from);
      }

      if (dateRange.to) {
        filtered = filtered.filter((e) => (e.date || "") <= dateRange.to);
      }

      if (keywords.length > 0) {
        filtered = filtered.filter((e) =>
          keywords.some((k) =>
            (e.name + e.description).toLowerCase().includes(k.toLowerCase()),
          ),
        );
      }

      return {
        ...results,
        events: filtered,
        total_events: filtered.length,
        filters_applied: filterDescription,
      };
    } catch (error) {
      console.error("Advanced search error:", error.message);
      throw error;
    }
  }
}

export default OpenAIEventService;
