# 🚀 Event Inference API - Implementation Summary

**Date:** March 23, 2026  
**Status:** ✅ Complete

---

## 📋 Overview

Sửa lại API `/api/events/search-openai` và `/api/events/search-perplexity` để **INFER** các sự kiện tương lai dựa trên company profiles, kết hợp với prompt từ **prompt.txt**.

### Vấn đề Cũ ❌

- API chỉ **TÌM** sự kiện quá khứ (historical searches)
- Không có prompt structured
- Input: Chỉ text-based (companyName, website, location)

### Giải Pháp Mới ✅

- API **INFER** sự kiện tương lai (high-probability based on profile)
- Sử dụng prompt từ **prompt.txt** làm system instructions
- Input: Company profile JSON arrays
- Output: Structured JSON theo schema từ prompt.txt
- Cả **OpenAI** và **Perplexity** đều có capabilities này

---

## 📝 Files Modified/Created

### 1. **Modified Services**

#### `src/services/openaiEventService.js`

**Thêm method:** `inferCompanyEvents(companies, options)`

- Parameters: Array of company profiles
- Uses: prompt.txt logic + structured JSON parsing
- Returns: Inferred events array per schema

**Keep legacy:** `findCompanyEvents()` vẫn dùng để search sự kiện cũ

#### `src/services/perplexityEventService.js`

**Thêm method:** `inferCompanyEvents(companies, options)`

- Same functionality as OpenAI version
- Uses: Perplexity sonar model
- Returns: Same schema output

### 2. **Modified API Layer**

#### `src/api/eventSearchAPI.js`

**Thêm 3 handlers:**

- `handleInferOpenAI(req, res)` → POST /api/events/infer-openai
- `handleInferPerplexity(req, res)` → POST /api/events/infer-perplexity
- `handleInferCompare(req, res)` → POST /api/events/infer-compare

### 3. **Modified Server Configuration**

#### `src/api/server.js`

**Thêm 3 endpoints:**

```
POST /api/events/infer-openai       - Infer using OpenAI
POST /api/events/infer-perplexity   - Infer using Perplexity
POST /api/events/infer-compare      - Compare both providers
```

**Updated:** Root endpoint (`GET /`) → Added new endpoints to documentation

### 4. **New Documentation Files**

#### `docs/INFER_EVENTS_API_GUIDE.md`

- Complete guide to use new endpoints
- Input/output schemas
- Best practices
- Troubleshooting

#### `INFER_EVENTS_CURL_EXAMPLES.txt`

- 10 curl examples
- PowerShell examples
- Node.js examples
- Bulk requests
- Testing tips

#### `test-infer-events.js`

- Ready-to-run test suite
- Tests all 3 endpoints
- Sample companies with diverse industries
- Shows comparison analysis

---

## 🔄 Workflow

### Old API (Still Works)

```
Input: companyName, website, location (text)
         ↓
Search web for PAST events
         ↓
Output: Historical event data
```

### New API ⭐

```
Input: Company Profile JSON array
       - company_name
       - website
       - industry
       - address
       - distance_from_center
         ↓
Use prompt.txt logic to INFER future events
       ↓
Output: Structured JSON per schema
[
  {
    "company_name": "...",
    "events": [
      {
        "event_name": "...",
        "event_type": "Conference|Trade show|...",
        "description": "...",
        "estimated_scale": "small|medium|large",
        "frequency": "one-time|annual|quarterly|monthly",
        "estimated_timeframe": "Q3 2026, Late Spring, etc",
        "confidence_score": 0.75
      }
    ]
  }
]
```

---

## 📊 Output Schema

Per **prompt.txt** requirements:

```typescript
interface InferredEvent {
  event_name: string; // Generic, realistic title
  event_type: EventType; // One of 9 predefined types
  description: string; // 1-2 sentences max
  estimated_scale: "small" | "medium" | "large";
  frequency: "one-time" | "annual" | "quarterly" | "monthly";
  estimated_timeframe: string; // e.g., "Q3 2026", "June annual"
  confidence_score: number; // 0.0 - 1.0, only >= 0.60 included
}

interface InferredCompanyEvents {
  company_name: string;
  events: InferredEvent[];
}
```

---

## 🎯 Key Features

✅ **Intelligent Analysis** → Scans industry, website, address for clues
✅ **2-5 Events per Company** → Quality over quantity
✅ **Confidence Filtering** → Only high-probability events (>= 0.60)
✅ **Batch Processing** → Multiple companies in single request
✅ **Provider Comparison** → OpenAI vs Perplexity side-by-side
✅ **Future-Focused** → Infers next 12 months
✅ **Industry-Aware** → Map typical events for each industry

---

## 🧡 Usage Examples

### 1. Infer using OpenAI

```bash
curl -X POST http://localhost:3000/api/events/infer-openai \
  -H "Content-Type: application/json" \
  -d '{
    "companies": [
      {
        "company_name": "Google Vietnam",
        "website": "google.com.vn",
        "industry": "Technology / Cloud Computing",
        "address": "Ho Chi Minh City",
        "distance_from_center": 0
      }
    ]
  }'
```

### 2. Compare OpenAI vs Perplexity

```bash
curl -X POST http://localhost:3000/api/events/infer-compare \
  -H "Content-Type: application/json" \
  -d '{
    "companies": [...]
  }'
```

### 3. Run Test Suite

```bash
node test-infer-events.js
```

---

## ⚙️ Configuration

**Required .env variables:**

```env
OPENAI_API_KEY=sk-xxx...           # For infer-openai endpoint
PERPLEXITY_API_KEY=ppl-xxx...      # For infer-perplexity endpoint
```

If missing → Returns 503 error with helpful message

---

## 🔍 Analysis Logic (How AI Infers Events)

1. **Keyword Extraction**
   - Scan industry for keywords: conference, webinar, training, partner, etc.
   - Extract from website URL if possible

2. **Company Size Inference**
   - Large website → Corporate events
   - Local business → Neighborhood events
   - Global brand → National events

3. **Industry Pattern Matching**
   - Tech: Product launches, conferences, partner training
   - Manufacturing: Trade shows, supplier days
   - Retail: Seasonal promotions, store openings
   - Telecom: Industry conferences, roadshows
   - Finance: Annual shareholder meetings, seminars

4. **Confidence Scoring**
   - Strong signals → 0.80-1.00
   - Moderate signals → 0.60-0.79
   - Weak/speculative → < 0.60 (excluded)

5. **Output Filtering**
   - Only 2-5 events per company
   - Priority: High confidence + realistic + industry-appropriate
   - No invented event names (generic but realistic)

---

## 📈 Improvements Over Legacy API

| Aspect               | Old API            | New API                    |
| -------------------- | ------------------ | -------------------------- |
| **Purpose**          | Search past events | Infer future events        |
| **Input**            | Text query         | Structured profiles        |
| **Intelligence**     | Web search based   | Profile analysis based     |
| **Scale**            | Single company     | Batch processing           |
| **Output**           | Unstructured       | Strict JSON schema         |
| **Confidence**       | Not provided       | Explicit 0.0-1.0 scores    |
| **Industry Aware**   | No                 | Yes ⭐                     |
| **Provider Compare** | N/A                | Yes (OpenAI vs Perplexity) |

---

## 🧪 Testing

### Quick Test

```bash
node test-infer-events.js
```

### Manual Test

```bash
# Start server
node src/api/server.js

# In another terminal - Test endpoint
curl -X POST http://localhost:3000/api/events/infer-openai \
  -H "Content-Type: application/json" \
  -d @sample-companies.json
```

### Verify Response

- Check `success: true`
- Check all companies have events array
- Validate confidence_score between 0-1
- Verify event_type is one of 9 types
- Check description is 1-2 sentences

---

## 🛠️ Troubleshooting

| Issue                      | Solution                                                 |
| -------------------------- | -------------------------------------------------------- |
| 503 error                  | Add OPENAI_API_KEY or PERPLEXITY_API_KEY to .env         |
| "companies array required" | Ensure POST body has `{"companies": [...]}`              |
| Empty events               | Increase company profile details (add industry)          |
| Low confidence scores      | Add industry information, check company profile accuracy |
| Timeout                    | Large batch or slow API - wait 30+ seconds               |

---

## 📚 Documentation

- **Full Guide:** `docs/INFER_EVENTS_API_GUIDE.md`
- **Curl Examples:** `INFER_EVENTS_CURL_EXAMPLES.txt`
- **Test Suite:** `test-infer-events.js`
- **Original Prompt:** `prompt.txt` (AI instructions)

---

## ✨ Next Steps (Optional Future Enhancements)

- [ ] Add event clustering (group similar events from multiple companies)
- [ ] Add event recommendations (suggest events for company partnerships)
- [ ] Add historical comparison (compare inferred vs actual events)
- [ ] Cache inference results for performance
- [ ] Add webhook support for async processing
- [ ] Dashboard to visualize inferred events by industry/region
- [ ] Export to CSV/Excel format
- [ ] Integration with calendar systems (Google Calendar, Outlook)

---

## 🎓 Architecture

```
Request: Company Profiles JSON
    ↓
┌───────────────────────────────┐
│ eventSearchAPI.handleInferOpenAI() / handleInferPerplexity()
│ - Validate input
│ - Route to appropriate service
└───────────────────────────────┘
    ↓
┌───────────────────────────────┐
│ OpenAIEventService / PerplexityEventService
│ - Load prompt.txt instructions
│ - Call AI model with structured prompt
│ - Parse response JSON
└───────────────────────────────┘
    ↓
┌───────────────────────────────┐
│ Response: Structured JSON
│ - Company profiles with inferred events
│ - Confidence scores
│ - Timeframes & frequencies
└───────────────────────────────┘
    ↓
HTTP 200 JSON Response to Client
```

---

## 📞 Support

- Check documentation in `docs/`
- Review `prompt.txt` for AI reasoning
- Run test suite: `node test-infer-events.js`
- Check server logs for errors
- Verify .env variables

---

**Status:** ✅ Complete and Ready for Production  
**Last Updated:** March 23, 2026
