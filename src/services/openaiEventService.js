/**
 * OpenAI Event Search Service
 * Tìm sự kiện tổ chức bởi công ty sử dụng OpenAI + Web Search
 *
 * Sử dụng OpenAI để phân tích, tổng hợp và trích xuất thông tin sự kiện
 * từ nhiều nguồn kết hợp với các API bên ngoài
 */

import axios from "axios";
import crypto from "crypto";
import EventbriteService from "./eventbriteService.js";
import PredictHqService from "./predictHqService.js";
import { query } from "../config/database.js";

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

      // ============================================
      // 💾 DATABASE PERSISTENCE LOGIC
      // ============================================
      const { auto_save = true } = options;
      const dbResult = {
        total_events_saved: 0,
        total_company_events_saved: 0,
        skipped_no_data: 0,
        errors: 0,
        details: [],
      };

      if (auto_save) {
        console.log(`\n💾 Auto-saving inferred events to database...`);

        // Process each company's events
        for (const companyData of inferredEvents) {
          try {
            const companyId = companies.find(
              (c) => c.company_name === companyData.company_name,
            )?.company_id;

            if (!companyId) {
              console.warn(
                `⚠️  No company_id found for ${companyData.company_name}`,
              );
              dbResult.skipped_no_data++;
              continue;
            }

            // Filter out "no information" events
            const realEvents = (companyData.events || []).filter(
              (e) => e.event_id !== "no-information",
            );

            if (realEvents.length === 0) {
              console.log(
                `⏭️  Skipping ${companyData.company_name} - No real events to save`,
              );
              dbResult.skipped_no_data++;
              continue;
            }

            // Save events for this company
            const savedResult = await this._saveEventsToDB(
              companyId,
              companyData.company_name,
              realEvents,
            );

            dbResult.total_events_saved += savedResult.events_saved;
            dbResult.total_company_events_saved +=
              savedResult.company_events_saved;
            dbResult.errors += savedResult.errors;

            // Track new vs existing events
            const newEventCount = savedResult.new_events.length;
            const existingEventCount = savedResult.existing_events.length;

            dbResult.details.push({
              company_name: companyData.company_name,
              company_id: companyId,
              events_saved: savedResult.events_saved,
              company_events_saved: savedResult.company_events_saved,
              errors: savedResult.errors,
              new_events_count: newEventCount,
              existing_events_count: existingEventCount,
              new_events: savedResult.new_events,
              existing_events: savedResult.existing_events,
            });
          } catch (error) {
            console.error(
              `❌ Error saving events for ${companyData.company_name}:`,
              error.message,
            );
            dbResult.errors++;
          }
        }

        console.log(`✅ Database persistence completed:`, dbResult);
      }

      // ============================================
      // ENRICH RESPONSE WITH COMPANY_ID AND DB INFO
      // ============================================
      const enrichedData = inferredEvents.map((company) => {
        const foundCompany = companies.find(
          (c) => c.company_name === company.company_name,
        );

        // Get new/existing event counts from dbResult
        const companyDetail = dbResult.details.find(
          (d) => d.company_id === foundCompany?.company_id,
        );

        return {
          ...company,
          company_id: foundCompany?.company_id || null,
          total_saved_to_db:
            company.events.filter((e) => e.event_id !== "no-information")
              .length || 0,
          new_events_found: companyDetail?.new_events_count || 0,
          existing_events_in_db: companyDetail?.existing_events_count || 0,
        };
      });

      // Calculate totals for database_result
      const totalNewEvents = dbResult.details.reduce(
        (sum, d) => sum + (d.new_events_count || 0),
        0,
      );
      const totalExistingEvents = dbResult.details.reduce(
        (sum, d) => sum + (d.existing_events_count || 0),
        0,
      );

      return {
        success: true,
        provider: "openai",
        mode: "verify",
        total_companies: companies.length,
        inferred_data: enrichedData,
        database_result: auto_save
          ? {
              ...dbResult,
              new_events_added: totalNewEvents,
              existing_events: totalExistingEvents,
              total_events_in_db:
                dbResult.total_company_events_saved +
                totalExistingEvents -
                totalNewEvents,
            }
          : null,
        timestamp: new Date().toISOString(),
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
        database_result: null,
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

  /**
   * ============================================
   * 💾 DATABASE PERSISTENCE HELPER
   * ============================================
   * Save inferred events to database
   * Detects new events vs existing events
   * @param {string} companyId - UUID of company
   * @param {string} companyName - Name of company
   * @param {array} events - Array of inferred events
   */
  async _saveEventsToDB(companyId, companyName, events) {
    const result = {
      events_saved: 0,
      company_events_saved: 0,
      errors: 0,
      new_events: [],
      existing_events: [],
      event_details: [],
    };

    try {
      for (const eventData of events) {
        try {
          // 1. Check if event already exists (by date_verified + event_type)
          // This prevents duplicates when OpenAI returns same event with different names
          const eventDate =
            eventData.date_verified && eventData.date_verified !== "N/A"
              ? eventData.date_verified
              : null;

          const existingEventQuery = await query(
            `SELECT id FROM events 
             WHERE event_type = $1 AND start_date::date = $2::date
             AND external_source = 'openai_inferred'
             LIMIT 1`,
            [eventData.event_type, eventDate],
          );

          let eventId;
          let isNewEvent = false;

          if (existingEventQuery.rows.length > 0) {
            // Event exists, use existing ID (same date + type = same event)
            eventId = existingEventQuery.rows[0].id;
            console.log(
              `   ℹ️  Event "${eventData.event_name}" already exists on ${eventDate} (reusing)`,
            );
          } else {
            // Create new event
            // Parse date - use date_verified if it's a valid date, otherwise use today
            let eventStartDate = new Date();
            if (
              eventData.date_verified &&
              eventData.date_verified !== "N/A" &&
              /^\d{4}-\d{2}-\d{2}$/.test(eventData.date_verified)
            ) {
              eventStartDate = new Date(eventData.date_verified);
            }

            const createEventQuery = await query(
              `INSERT INTO events (
                name, 
                event_type, 
                description, 
                location, 
                lat, 
                lng,
                start_date, 
                organizer, 
                url, 
                external_source, 
                status,
                raw_data
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
              RETURNING id`,
              [
                eventData.event_name,
                eventData.event_type,
                eventData.description || null,
                eventData.location || "Unknown",
                0, // lat - using 0 as placeholder
                0, // lng - using 0 as placeholder
                eventStartDate,
                eventData.source || "AI Inferred",
                eventData.source_url && eventData.source_url !== "N/A"
                  ? eventData.source_url
                  : null,
                "openai_inferred",
                "active",
                JSON.stringify(eventData), // Store full event data in raw_data
              ],
            );

            eventId = createEventQuery.rows[0].id;
            isNewEvent = true;
            result.events_saved++;
            console.log(`   ✅ Created new event: "${eventData.event_name}"`);
          }

          // 2. Check if company-event relationship already exists
          const existingCompanyEventQuery = await query(
            `SELECT id, last_seen_at FROM company_events 
             WHERE company_id = $1 AND event_id = $2
             LIMIT 1`,
            [companyId, eventId],
          );

          if (existingCompanyEventQuery.rows.length === 0) {
            // Create NEW company-event relationship
            const now = new Date();
            await query(
              `INSERT INTO company_events (
                company_id, 
                event_id, 
                status, 
                source_name, 
                source_url, 
                confidence_score,
                first_seen_at,
                last_seen_at
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
              [
                companyId,
                eventId,
                "inferred", // inferred status
                eventData.source || "AI Inferred",
                eventData.source_url && eventData.source_url !== "N/A"
                  ? eventData.source_url
                  : null,
                eventData.confidence_score || 0.5,
                now,
                now,
              ],
            );

            result.company_events_saved++;
            result.new_events.push({
              event_id: eventData.event_id,
              event_name: eventData.event_name,
              status: "newly_added",
            });
            console.log(
              `   🔗 Created NEW company-event relationship (confidence: ${eventData.confidence_score || 0.5})`,
            );
          } else {
            // Relationship already exists - UPDATE last_seen_at
            const existingCompanyEventId = existingCompanyEventQuery.rows[0].id;
            const now = new Date();

            await query(
              `UPDATE company_events 
               SET last_seen_at = $1
               WHERE id = $2`,
              [now, existingCompanyEventId],
            );

            result.existing_events.push({
              event_id: eventData.event_id,
              event_name: eventData.event_name,
              status: "existing",
              last_seen_at: existingCompanyEventQuery.rows[0].last_seen_at,
            });
            console.log(
              `   ⏭️  Company-event relationship already exists (updated last_seen_at)`,
            );
          }

          result.event_details.push({
            event_name: eventData.event_name,
            event_id: eventData.event_id,
            is_new: isNewEvent,
            has_new_relationship: existingCompanyEventQuery.rows.length === 0,
          });
        } catch (eventError) {
          console.error(
            `   ❌ Error saving event "${eventData.event_name}":`,
            eventError.message,
          );
          result.errors++;
        }
      }
    } catch (error) {
      console.error(`❌ Error in _saveEventsToDB:`, error.message);
      result.errors++;
    }

    return result;
  }
}

export default OpenAIEventService;
