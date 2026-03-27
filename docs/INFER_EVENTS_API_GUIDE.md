# Event Inference API - Hướng Dẫn Sử Dụng

## 🎯 Mục Đích

Infer các sự kiện mà công ty có thể **tổ chức trong tương lai** dựa trên profiling công ty (bao gồm ngành nghề, website, địa điểm, quy mô...).

**Khác biệt với Search:**

- ❌ `search-openai`, `search-perplexity` → Tìm sự kiện **quá khứ** mà công ty đã tổ chức
- ✅ `infer-openai`, `infer-perplexity` → **Suy đoán** sự kiện **tương lai** (high-probability based on profile)

## 📊 Endpoints Mới

### 1. POST `/api/events/infer-openai`

**Infer events using OpenAI**

```bash
curl -X POST http://localhost:3000/api/events/infer-openai \
  -H "Content-Type: application/json" \
  -d '{
    "companies": [
      {
        "company_name": "Google Vietnam",
        "website": "google.com.vn",
        "industry": "Technology / Cloud Computing",
        "address": "Ho Chi Minh City, Vietnam",
        "distance_from_center": 0
      },
      {
        "company_name": "FPT Software",
        "website": "fpt-software.com",
        "industry": "Software Development",
        "address": "Da Nang, Vietnam",
        "distance_from_center": 100
      }
    ]
  }'
```

**Response:**

```json
{
  "success": true,
  "provider": "openai",
  "mode": "infer",
  "total_companies": 2,
  "inferred_data": [
    {
      "company_name": "Google Vietnam",
      "events": [
        {
          "event_name": "Annual Cloud Summit Vietnam",
          "event_type": "Conference",
          "description": "Showcase latest Google Cloud solutions and connect with enterprise customers.",
          "estimated_scale": "large",
          "frequency": "annual",
          "estimated_timeframe": "Q3 2026",
          "confidence_score": 0.92
        },
        {
          "event_name": "Quarterly Partner Training",
          "event_type": "Workshop / training",
          "description": "Training for authorized resellers and partners on new product features.",
          "estimated_scale": "medium",
          "frequency": "quarterly",
          "estimated_timeframe": "March, June, September, December",
          "confidence_score": 0.85
        }
      ]
    }
  ]
}
```

### 2. POST `/api/events/infer-perplexity`

**Infer events using Perplexity**

Same input format as above, but uses Perplexity AI:

```bash
curl -X POST http://localhost:3000/api/events/infer-perplexity \
  -H "Content-Type: application/json" \
  -d '{
    "companies": [...]
  }'
```

### 3. POST `/api/events/infer-compare`

**Compare inferred events from both OpenAI and Perplexity**

```bash
curl -X POST http://localhost:3000/api/events/infer-compare \
  -H "Content-Type: application/json" \
  -d '{
    "companies": [...]
  }'
```

**Response:**

```json
{
  "success": true,
  "total_companies": 2,
  "providers": {
    "openai": {
      "success": true,
      "total_inferred": 4,
      "data": [...]
    },
    "perplexity": {
      "success": true,
      "total_inferred": 5,
      "data": [...]
    }
  },
  "timestamp": "2026-03-23T10:30:00.000Z"
}
```

## 📝 Input Format

### Company Profile Schema

```typescript
{
  company_name: string; // Tên công ty (bắt buộc)
  website: string; // Website (optional)
  industry: string; // Ngành nghề (optional nhưng rất quan trọng)
  address: string; // Địa chỉ (optional)
  distance_from_center: number; // Khoảng cách từ center (optional)
}
```

**Ví dụ đầy đủ:**

```json
{
  "companies": [
    {
      "company_name": "Google Vietnam",
      "website": "google.com.vn",
      "industry": "Technology / Cloud Computing",
      "address": "12F, Tao Đàn Tower, Ho Chi Minh City",
      "distance_from_center": 5.2
    },
    {
      "company_name": "Sony Vietnam",
      "website": "sony.com.vn",
      "industry": "Electronics / Consumer Products",
      "address": "Hanoi, Vietnam",
      "distance_from_center": 1700
    },
    {
      "company_name": "Viettel",
      "website": "viettel.com.vn",
      "industry": "Telecommunications",
      "address": "65 Tran Hung Dao, Hanoi",
      "distance_from_center": 1700
    }
  ]
}
```

## 📋 Output Schema

Kết quả trả về theo schema từ **prompt.txt**:

```json
[
  {
    "company_name": "string",
    "events": [
      {
        "event_name": "string",
        "event_type": "Conference | Trade show | Workshop / training | Community event | Corporate retreat | Product launch | Nonprofit / religious | Seasonal | Other",
        "description": "string (1-2 sentences max)",
        "estimated_scale": "small (< 100) | medium (100-1000) | large (1000+)",
        "frequency": "one-time | annual | quarterly | monthly",
        "estimated_timeframe": "string (Q3 2026, Late Spring, June annual, Next quarter, etc)",
        "confidence_score": 0.00 - 1.00
      }
    ]
  }
]
```

### Giải thích fields:

| Field                 | Mô tả                                      | Ví dụ                                                           |
| --------------------- | ------------------------------------------ | --------------------------------------------------------------- |
| `event_name`          | Tên sự kiện generic (không invented names) | "Annual Customer Appreciation Day"                              |
| `event_type`          | Một trong 9 loại sự kiện                   | "Conference"                                                    |
| `description`         | Ngắn gọn 1-2 câu                           | "Connect with enterprise customers to discuss latest solutions" |
| `estimated_scale`     | Quy mô dự kiến                             | "large" (1000+ attendees)                                       |
| `frequency`           | Tần suất tái diễn                          | "annual"                                                        |
| `estimated_timeframe` | Thời gian dự kiến                          | "Q3 2026" hoặc "June (annual)"                                  |
| `confidence_score`    | Độ tin cậy (0-1)                           | 0.85 (từ 0.60 trở lên)                                          |

## 🔍 Ví Dụ Thực Tế

### Test Command (Node.js)

```bash
node test-infer-events.js
```

Hoặc sử dụng curl:

```bash
# OpenAI
curl -X POST http://localhost:3000/api/events/infer-openai \
  -H "Content-Type: application/json" \
  -d @companies.json

# Perplexity
curl -X POST http://localhost:3000/api/events/infer-perplexity \
  -H "Content-Type: application/json" \
  -d @companies.json

# Compare
curl -X POST http://localhost:3000/api/events/infer-compare \
  -H "Content-Type: application/json" \
  -d @companies.json
```

### Tạo file companies.json:

```json
{
  "companies": [
    {
      "company_name": "Google Vietnam",
      "website": "google.com.vn",
      "industry": "Technology / Cloud Computing",
      "address": "Ho Chi Minh City, Vietnam",
      "distance_from_center": 0
    },
    {
      "company_name": "Microsoft Vietnam",
      "website": "microsoft.com",
      "industry": "Technology / Software",
      "address": "Hanoi, Vietnam",
      "distance_from_center": 1700
    }
  ]
}
```

## ⚙️ Cấu hình

**Yêu cầu environment variables:**

```env
OPENAI_API_KEY=sk-xxx...
PERPLEXITY_API_KEY=ppl-xxx...
```

Hoặc nếu không có, endpoint sẽ return 503:

```json
{
  "success": false,
  "error": "OpenAI API not configured. Add OPENAI_API_KEY to .env"
}
```

## 🎓 Reasoning Logic (AI Uses)

AI sẽ scan company profile để:

1. **Keyword extraction** → Tìm clues từ industry, website
   - "Conference", "webinar", "demo", "training", "partners", "careers" → Potential events

2. **Company size inference** → Từ website signals
   - Careers page → Larger company (corporate events)
   - Local presence → Neighborhood events
   - Global presence → National/regional events

3. **Industry pattern matching** → Map typical events for industry
   - **Tech**: Product launches, user conferences, partner training
   - **Manufacturing**: Trade shows, supplier days
   - **Retail**: Seasonal promotions, store openings
   - **Telecom**: Industry conferences, roadshows

4. **Event filtering** → Chỉ giữ high-probability events (confidence ≥ 0.60)

## 📊 Confidence Score Guidelines

| Score     | Meaning                | Example                                                  |
| --------- | ---------------------- | -------------------------------------------------------- |
| 0.80-1.00 | **Strong evidence**    | Large tech company + website signals → Annual conference |
| 0.60-0.79 | **Moderate-to-strong** | Industry pattern + company fit                           |
| < 0.60    | **Speculative**        | ❌ Avoid (not included in results)                       |

## 🚀 Key Features

✅ **Intelligent Inference** → Based on industry patterns + company profile
✅ **Confidence Scores** → Filter for high-probability events only
✅ **Concise Descriptions** → Max 1-2 sentences per event
✅ **Timeframe Guidance** → Near-term focus (next 12 months)
✅ **Batch Processing** → Multiple companies in one request
✅ **Provider Comparison** → OpenAI vs Perplexity insights

## 📌 Best Practices

1. **Provide industry info** → More accurate inference

   ```json
   "industry": "Technology / Cloud Computing"  // ✅ GOOD
   "industry": "Tech"                          // ❌ Too vague
   ```

2. **Include website** → Helps with company size detection

   ```json
   "website": "google.com.vn"  // ✅ Good for analysis
   ```

3. **Use real company addresses** → For location-based events

   ```json
   "address": "Ho Chi Minh City, Vietnam"  // ✅ GOOD
   "distance_from_center": 5.2              // ✅ Helps with event scale
   ```

4. **Batch multiple companies** → More efficient
   ```json
   "companies": [c1, c2, c3, c4, c5]  // ✅ Batch processing
   ```

## 🐛 Troubleshooting

### Error: "companies array is required"

```json
❌ {"companies": {}}
✅ {"companies": [{...}, {...}]}
```

### Error: "OpenAI API not configured"

```bash
# Check .env
echo $OPENAI_API_KEY
# Update .env if missing
```

### Low confidence scores

- Add more detailed industry information
- Ensure company profile is accurate
- Check if company website is available

## 📞 Support

For issues or questions, check:

- `prompt.txt` → Original AI instructions
- `test-infer-events.js` → Working examples
- API logs → Debug information
