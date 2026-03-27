/**
 * Perplexity Event Search Service
 * Tìm sự kiện tổ chức bởi công ty sử dụng Perplexity AI
 *
 * Perplexity có khả năng tìm kiếm web real-time và tổng hợp thông tin
 * từ nhiều nguồn để tìm sự kiện và người tổ chức
 */

import axios from "axios";

class PerplexityEventService {
  constructor(perplexityApiKey) {
    this.apiKey = perplexityApiKey;
    this.baseUrl = "https://api.perplexity.ai";
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        Authorization: `Bearer ${perplexityApiKey}`,
        "Content-Type": "application/json",
      },
      timeout: 30000,
    });
  }

  /**
   * Infer events mà công ty có thể tổ chức dựa trên company profile
   * @param {array} companies - Danh sách company profiles JSON
   * @param {object} options - Options thêm
   */
  async inferCompanyEvents(companies, options = {}) {
    try {
      console.log(
        `🔍 Perplexity: Inferring events for ${companies.length} companies`,
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
        model: "sonar",
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
        max_tokens: 2000,
        temperature: 0.0,
      });

      content = response.data.choices[0].message.content.trim();

      console.log("\n🔍 Perplexity Raw Response Length:", content.length);

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
        provider: "perplexity",
        mode: "verify",
        total_companies: companies.length,
        inferred_data: inferredEvents,
      };
    } catch (error) {
      console.error("❌ Perplexity Event Inference Error:", error.message);
      console.error("Raw content:", content?.substring(0, 300) || "N/A");
      return {
        success: false,
        provider: "perplexity",
        error: error.message,
        inferred_data: [],
      };
    }
  }

  /**
   * Tìm sự kiện của công ty sử dụng Perplexity (legacy - tìm sự kiện lịch sử)
   * @param {string} companyName - Tên công ty
   * @param {string} website - Website của công ty
   * @param {string} location - Địa điểm công ty
   * @param {object} options - Options thêm
   */
  async findCompanyEvents(companyName, website, location, options = {}) {
    try {
      const { limit = 20, includeContacts = true, language = "vi" } = options;

      // Tạo query tìm kiếm thông minh
      const searchQuery = this._buildSearchQuery(
        companyName,
        website,
        location,
        includeContacts,
        language,
      );

      console.log(`🔍 Perplexity: Searching for events of "${companyName}"`);

      const response = await this.client.post("/chat/completions", {
        model: "sonar",
        messages: [
          {
            role: "system",
            content: `Bạn là một chuyên gia tìm kiếm sự kiện doanh nghiệp. 
Hãy tìm tất cả các sự kiện mà công ty này đã tổ chức hoặc tham gia từ trước đến nay.
Cung cấp thông tin chi tiết về:
1. Tên sự kiện
2. Ngày tổ chức
3. Địa điểm
4. Người tổ chức/người liên lạc
5. Loại sự kiện (conference, meetup, workshop, v.v.)
6. Số lượng tham gia (nếu có)
7. URL hoặc nguồn thông tin
Trả lại JSON structured format.`,
            content: searchQuery,
          },
          {
            role: "user",
            content: searchQuery,
          },
        ],
        max_tokens: 2000,
        temperature: 0.3,
      });

      const content = response.data.choices[0].message.content;

      // Parse JSON từ response
      const events = this._parsePerplexityResponse(
        content,
        companyName,
        location,
      );

      return {
        success: true,
        provider: "perplexity",
        company: {
          name: companyName,
          website: website,
          location: location,
        },
        events: events.slice(0, limit),
        total_events: events.length,
        search_query: searchQuery,
        raw_response: content,
      };
    } catch (error) {
      console.error("❌ Perplexity Error:", error.message);
      return {
        success: false,
        provider: "perplexity",
        error: error.message,
        events: [],
      };
    }
  }

  /**
   * Xây dựng query tìm kiếm thông minh
   */
  _buildSearchQuery(companyName, website, location, includeContacts, language) {
    let query = `Tìm tất cả các sự kiện được tổ chức bởi hoặc có sự tham gia của công ty "${companyName}"`;

    if (website) {
      query += ` (website: ${website})`;
    }

    if (location) {
      // Extract city/state from full address
      // Format: "18801 Mainstreet # 240, Parker, CO 80134, USA"
      // Output: "Parker, CO"
      const locationParts = location.split(",").map((p) => p.trim());
      let cityState = location; // Default to full location

      if (locationParts.length >= 3) {
        // Typically: [..., City, State ZIP, Country]
        const city = locationParts[locationParts.length - 3]; // Parker
        const stateZip = locationParts[locationParts.length - 2]; // CO 80134
        const state = stateZip.split(" ")[0]; // CO
        cityState = `${city}, ${state}`; // Parker, CO
      }

      query += ` ở ${cityState}`;
    }

    query += `. 
Liệt kê các sự kiện từ trước đến nay bao gồm:
- Tên sự kiện và ngày tổ chức
- Địa điểm tổ chức
- Người tổ chức chính hoặc người liên lạc`;

    if (includeContacts) {
      query += `
- Thông tin liên lạc của người tổ chức (email, điện thoại nếu có)
- Vai trò của công ty (tổ chức chính, đối tác, tài trợ)`;
    }

    query += `.
Trả lại kết quả dưới dạng JSON với cấu trúc:
{
  "events": [
    {
      "name": "tên sự kiện",
      "date": "YYYY-MM-DD",
      "location": "địa điểm",
      "organizer": "người/công ty tổ chức",
      "organizer_contact": "thông tin liên lạc",
      "event_type": "loại sự kiện",
      "description": "mô tả",
      "url": "link sự kiện",
      "company_role": "vai trò của công ty"
    }
  ],
  "summary": "tóm tắt về công ty tổ chức sự kiện"
}`;

    return query;
  }

  /**
   * Parse Perplexity response
   */
  _parsePerplexityResponse(content, companyName, location) {
    try {
      // Tìm JSON trong response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return this._extractEventsFromText(content, companyName, location);
      }

      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.events && Array.isArray(parsed.events)) {
        return parsed.events.map((event) => this._normalizeEvent(event));
      }

      return this._extractEventsFromText(content, companyName, location);
    } catch (error) {
      console.error("Error parsing response:", error.message);
      return this._extractEventsFromText(content, companyName, location);
    }
  }

  /**
   * Trích xuất sự kiện từ văn bản nếu parse JSON thất bại
   */
  _extractEventsFromText(text, companyName, location) {
    const events = [];

    // Regex pattern để tìm sự kiện
    const patterns = [
      /(?:sự kiện|event|hội nghị|conference|workshop|meetup|seminar)[:\s]+([^\n]+)/gi,
      /(?:ngày|date)[:\s]+([^\n]+)/gi,
    ];

    const lines = text.split("\n").filter((line) => line.trim().length > 0);

    let currentEvent = null;

    for (const line of lines) {
      if (
        line.includes("sự kiện") ||
        line.includes("event") ||
        line.match(/^\d+\.|^-\s/)
      ) {
        if (currentEvent && currentEvent.name) {
          events.push(currentEvent);
        }
        currentEvent = {
          name: line.replace(/^[-\d.]\s*/, "").trim(),
          location: location || "N/A",
          company_role: "organizer",
        };
      } else if (currentEvent && line.trim()) {
        // Add details to current event
        if (
          line.toLowerCase().includes("date") ||
          line.match(/\d{4}-\d{2}-\d{2}/)
        ) {
          const dateMatch = line.match(
            /(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4})/,
          );
          if (dateMatch) {
            currentEvent.date = dateMatch[1];
          }
        }
        if (line.toLowerCase().includes("contact") || line.includes("@")) {
          currentEvent.organizer_contact = line
            .replace(/contact[:\s]*/i, "")
            .trim();
        }
      }
    }

    if (currentEvent && currentEvent.name) {
      events.push(currentEvent);
    }

    return events;
  }

  /**
   * Normalize event object
   */
  _normalizeEvent(event) {
    return {
      name: event.name || "Unknown Event",
      date: event.date || event.eventDate || "N/A",
      location: event.location || event.eventLocation || "N/A",
      organizer: event.organizer || event.organizer_name || "N/A",
      organizer_contact: event.organizer_contact || event.contact || "N/A",
      event_type: event.event_type || event.type || "Conference/Event",
      description: event.description || "",
      url: event.url || event.event_url || "",
      company_role: event.company_role || "participant",
      attendees: event.attendees || event.participants || "N/A",
    };
  }

  /**
   * Tìm thông tin organizer chi tiết hơn
   */
  async findOrganizerDetails(organizerName, location) {
    try {
      const query = `Tìm thông tin chi tiết về người/công ty tổ chức sự kiện tên "${organizerName}" tại ${location}.
Cung cấp:
1. Tên đầy đủ
2. Email
3. Điện thoại
4. Website
5. Địa chỉ
6. Mô tả về công ty/tổ chức
Trả lại dạng JSON.`;

      const response = await this.client.post("/chat/completions", {
        model: "sonar",
        messages: [
          {
            role: "system",
            content:
              "Bạn là chuyên gia tìm kiếm tông tin liên lạc và chi tiết về các tổ chức sự kiện.",
            content: query,
          },
          {
            role: "user",
            content: query,
          },
        ],
        max_tokens: 1000,
        temperature: 0.2,
      });

      const content = response.data.choices[0].message.content;
      const jsonMatch = content.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      return { name: organizerName, location: location, status: "found" };
    } catch (error) {
      console.error("Error fetching organizer details:", error.message);
      return { name: organizerName, location: location, error: error.message };
    }
  }
}

export default PerplexityEventService;
