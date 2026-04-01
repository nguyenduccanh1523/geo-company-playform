/**
 * Perplexity Contact Info Service
 * Tìm thông tin liên hệ (contact info) của công ty tổ chức sự kiện
 * sử dụng Perplexity AI để tìm kiếm web real-time
 */

import axios from "axios";

class PerplexityContactInfoService {
  constructor(perplexityApiKey) {
    this.apiKey = perplexityApiKey;
    this.baseUrl = "https://api.perplexity.ai/v1";
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        Authorization: `Bearer ${perplexityApiKey}`,
        "Content-Type": "application/json",
      },
      timeout: 45000,
    });
    // Using sonar-pro (Perplexity's advanced search model for complex queries)
    // Alternative models: sonar (faster, cheaper), sonar-reasoning-pro (better reasoning)
    this.model = "sonar-pro";
  }

  /**
   * Tìm thông tin liên hệ công ty tổ chức sự kiện
   * @param {object} eventData - Data sự kiện (title, description, location, geo address)
   * @param {object} options - Options thêm
   * @returns {Promise<object>} Contact info của công ty Organization
   */
  async findEventOrganizerContactInfo(eventData, options = {}) {
    try {
      const { title, description, location, geo, timezone } = eventData;

      console.log(
        `📞 Perplexity: Finding contact info for organizer of event: "${title}"`,
      );

      // Xây dựng prompt tìm kiếm
      const searchContext = this._buildSearchContext(
        title,
        description,
        location,
        geo,
      );

      const systemPrompt = `You are a B2B contact information specialist. Your task is to find the company/organization that is organizing/hosting the event and extract their contact information.

STRICT REQUIREMENTS:
1. Find the ACTUAL ORGANIZER/HOST organization of the event
2. Extract ONLY verified and available contact information from public sources
3. Information must come from: official website | official social media | business directories | press releases | news articles
4. Return EXACTLY in the JSON schema provided below, no exceptions
5. If information is not found, use "Not found" or "N/A" string value

CONTACT INFORMATION PRIORITY:
- Priority 1: Official website contact page
- Priority 2: LinkedIn company page
- Priority 3: Business directories (Crunchbase, Apollo, RocketReach)
- Priority 4: Press releases or news articles mentioning organizer
- Priority 5: Event registration page

JSON OUTPUT SCHEMA (STRICTLY REQUIRED):
{
  "event_title": "string",
  "event_location": "string",
  "organizer_found": boolean,
  "organizer_info": {
    "organization_name": "string or 'Not found'",
    "organization_type": "Company|Non-profit|Government|Educational|Association|Other|Unknown",
    "website": "string (URL) or 'Not found'",
    "address": "string (full address) or 'Not found'",
    "city": "string or 'Not found'",
    "state_province": "string or 'Not found'",
    "country": "string or 'Not found'",
    "zip_code": "string or 'Not found'",
    "email": "string (contact email) or 'Not found'",
    "phone": "string (phone number with country code) or 'Not found'",
    "contact_person_name": "string or 'Not found'",
    "contact_person_title": "string or 'Not found'",
    "linkedin_url": "string (URL) or 'Not found'",
    "industry": "string or 'Not found'",
    "company_size": "string (Startup|Small|Medium|Large|Enterprise) or 'Not found'"
  },
  "sources": [
    {
      "source_type": "Official Website|LinkedIn|Business Directory|Press Release|News Article|Other",
      "source_url": "string or 'N/A'",
      "extracted_information": "what was found from this source"
    }
  ],
  "confidence_score": 0.0-1.0,
  "search_notes": "any relevant notes about the search"
}

RETURN ONLY VALID JSON. No markdown code blocks. No explanations. No extra text.`;

      const userPrompt = `Find and extract all available contact information for the organization that is organizing/hosting this event:

EVENT DETAILS:
- Title: ${title}
- Description: ${description || "Not provided"}
- Location: ${searchContext}
- Timezone: ${timezone || "Not specified"}

TASK:
1. Identify the actual company/organization that is organizing this event
2. Search for their contact information (address, email, phone, website)
3. Use web search to find verified, publicly available information only
4. Return ONLY the JSON object in the exact schema provided

DO NOT make up information. Use "Not found" if you cannot find the data.`;

      console.log("📡 Calling Perplexity API with sonar-pro...");

      const response = await this.client.post("/sonar", {
        model: this.model,
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
        temperature: 0.3, // Lower temperature for more consistent results
      });

      const responseContent = response.data.choices[0].message.content.trim();

      // Parse JSON response - handle markdown code blocks
      let jsonContent = responseContent;

      // Extract JSON from markdown code blocks if present
      const jsonMatch = jsonContent.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonContent = jsonMatch[1].trim();
      }

      let contactInfo = JSON.parse(jsonContent);

      // Add metadata
      contactInfo.searched_at = new Date().toISOString();
      contactInfo.event_id = eventData.id || "unknown";

      console.log(
        `✅ Found contact info for: ${contactInfo.organizer_info.organization_name}`,
      );

      return contactInfo;
    } catch (error) {
      console.error("❌ Error finding contact info:", error.message);

      if (error.response?.data) {
        console.error("API Error:", error.response.data);
      }

      throw new Error(`Failed to find contact info: ${error.message}`);
    }
  }

  /**
   * Bulk tìm contact info cho nhiều sự kiện
   * @param {array} events - Array các event data
   * @returns {Promise<array>} Array contact info
   */
  async findMultipleEventOrganizersContactInfo(events) {
    try {
      console.log(
        `📞 Perplexity: Finding contact info for ${events.length} event organizers`,
      );

      const results = [];

      // Process với rate limit
      for (let i = 0; i < events.length; i++) {
        const event = events[i];
        console.log(`Processing ${i + 1}/${events.length}...`);

        const contactInfo = await this.findEventOrganizerContactInfo(event);
        results.push(contactInfo);

        // Rate limit: delay 1 second between requests
        if (i < events.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      return results;
    } catch (error) {
      console.error("❌ Error in bulk search:", error.message);
      throw error;
    }
  }

  /**
   * Xây dựng context tìm kiếm từ location data
   * @private
   */
  _buildSearchContext(title, description, location, geo) {
    let context = title;

    if (geo?.address?.formatted_address) {
      context += ` at ${geo.address.formatted_address}`;
    } else if (location && Array.isArray(location) && location.length === 2) {
      context += ` at coordinates [${location[0]}, ${location[1]}]`;
    }

    if (description) {
      context += `. Description: ${description.substring(0, 200)}`;
    }

    return context;
  }

  /**
   * Validate contact info response
   * @private
   */
  _validateContactInfo(contactInfo) {
    if (!contactInfo.organizer_info) {
      throw new Error("Invalid response: missing organizer_info");
    }

    if (typeof contactInfo.confidence_score !== "number") {
      contactInfo.confidence_score = 0;
    }

    return contactInfo;
  }
}

export default PerplexityContactInfoService;
