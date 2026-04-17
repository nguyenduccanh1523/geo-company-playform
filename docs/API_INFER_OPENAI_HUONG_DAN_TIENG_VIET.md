# 📚 Hướng Dẫn API /api/events/infer-openai (v2) - Tiếng Việt

## 📖 Giới Thiệu

API này sử dụng **OpenAI** để tìm kiếm và xác minh các sự kiện của công ty từ các nguồn công cộng (website công ty, LinkedIn, báo chí, v.v.).

### ✨ Tính năng chính:

- 🤖 Sử dụng OpenAI để suy luận (infer) sự kiện của công ty
- 💾 Tự động lưu vào database (không cần gọi API import riêng)
- 🔄 Gọi lại để kiểm tra sự kiện **mới**
- 🚫 Lọc bỏ dữ liệu "không có thông tin"
- 📊 Báo cáo chi tiết về kết quả lưu trữ

---

## 🎯 Use Case

### Lần gọi đầu tiên: Tìm kiếm và lưu sự kiện

```
1. Client gửi request với company_id + auto_save: true
2. API gọi OpenAI để tìm sự kiện
3. Lọc bỏ "no information"
4. Lưu sự kiện vào database
5. Trả về: {"success": true, "total_saved_to_db": 2, ...}
```

### Lần gọi lần 2+: Kiểm tra sự kiện mới + Lấy toàn bộ

```
1. Client gọi lại API với cùng company_id
2. API gọi OpenAI lần nữa để tìm sự kiện
3. Kiểm tra xem có sự kiện mới không:
   ✅ Nếu có mới → Lưu thêm vào DB
   ⏭️ Nếu không có mới → Bỏ qua
4. Lấy TẤT CẢ sự kiện đã lưu từ database
5. Trả về: {"new_events": [...], "existing_events": [...], "total_in_db": 5}
```

---

## 📝 Định Dạng Request

### Endpoint

```
POST /api/events/infer-openai
Content-Type: application/json
```

### Request Body

```json
{
  "companies": [
    {
      "company_id": "550e8400-e29b-41d4-a716-446655440000",
      "company_name": "Flushing Bank",
      "website": "https://www.flushingbank.com",
      "industry": "BANK",
      "address": "1044 William Floyd Pkwy, Shirley, NY 11967, USA",
      "distance_from_center": 51.4
    }
  ],
  "auto_save": true
}
```

### Giải thích các trường

| Trường                             | Kiểu          | Bắt buộc | Mô tả                               |
| ---------------------------------- | ------------- | -------- | ----------------------------------- |
| `companies`                        | array         | ✅       | Danh sách công ty                   |
| `companies[].company_id`           | string (UUID) | ✅       | ID công ty trong database           |
| `companies[].company_name`         | string        | ✅       | Tên công ty                         |
| `companies[].website`              | string        | ❌       | Website công ty                     |
| `companies[].industry`             | string        | ❌       | Ngành công nghiệp                   |
| `companies[].address`              | string        | ❌       | Địa chỉ                             |
| `companies[].distance_from_center` | number        | ❌       | Khoảng cách (km)                    |
| `auto_save`                        | boolean       | ❌       | Tự động lưu vào DB (mặc định: true) |

---

## 📤 Định Dạng Response

### Khi gọi lần đầu tiên (hoặc auto_save: false)

```json
{
  "success": true,
  "provider": "openai",
  "mode": "verify",
  "total_companies": 1,
  "inferred_data": [
    {
      "company_id": "550e8400-e29b-41d4-a716-446655440000",
      "company_name": "Flushing Bank",
      "total_verified_events": 2,
      "total_saved_to_db": 2,
      "events": [
        {
          "event_id": "a1b2c3d4e5f6",
          "event_name": "Banking Conference 2025",
          "event_type": "Conference",
          "description": "Hội nghị ngân hàng tập trung vào chuyển đổi số",
          "date_verified": "2025-06-15",
          "source": "company website",
          "source_url": "https://www.flushingbank.com/events",
          "estimated_scale": "large",
          "estimated_attendees": 500,
          "estimated_budget_usd": 250000,
          "frequency": "annual",
          "confidence_score": 0.95
        },
        {
          "event_id": "b2c3d4e5f6g7",
          "event_name": "Financial Innovation Workshop",
          "event_type": "Workshop",
          "description": "Workshop về fintech và blockchain",
          "date_verified": "2025-09-20",
          "source": "LinkedIn",
          "source_url": "https://linkedin.com/company/flushing-bank",
          "estimated_scale": "medium",
          "estimated_attendees": 150,
          "estimated_budget_usd": 50000,
          "frequency": "one-time",
          "confidence_score": 0.87
        }
      ]
    }
  ],
  "database_result": {
    "total_events_saved": 2,
    "total_company_events_saved": 2,
    "skipped_no_data": 0,
    "errors": 0,
    "details": [
      {
        "company_name": "Flushing Bank",
        "company_id": "550e8400-e29b-41d4-a716-446655440000",
        "events_saved": 2,
        "company_events_saved": 2,
        "errors": 0
      }
    ]
  },
  "timestamp": "2026-04-17T10:30:00.000Z"
}
```

### Khi gọi lại lần 2+ (để kiểm tra sự kiện mới)

**💡 Dự kiến Response (sau khi implement):**

```json
{
  "success": true,
  "provider": "openai",
  "mode": "verify",
  "total_companies": 1,
  "call_type": "follow_up",
  "inferred_data": [
    {
      "company_id": "550e8400-e29b-41d4-a716-446655440000",
      "company_name": "Flushing Bank",
      "total_verified_events": 3,
      "new_events_found": 1,
      "events_from_openai": [
        {
          "event_id": "a1b2c3d4e5f6",
          "event_name": "Banking Conference 2025",
          "confidence_score": 0.95
        },
        {
          "event_id": "b2c3d4e5f6g7",
          "event_name": "Financial Innovation Workshop",
          "confidence_score": 0.87
        },
        {
          "event_id": "c3d4e5f6g7h8",
          "event_name": "Blockchain & Fintech Summit 2025",
          "confidence_score": 0.92
        }
      ]
    }
  ],
  "database_result": {
    "new_events_added": 1,
    "existing_events": 2,
    "total_events_in_db": 3,
    "new_saved": 1,
    "errors": 0,
    "details": [
      {
        "company_name": "Flushing Bank",
        "new_events": [
          {
            "event_id": "c3d4e5f6g7h8",
            "event_name": "Blockchain & Fintech Summit 2025",
            "status": "newly_saved"
          }
        ],
        "existing_events": 2
      }
    ]
  },
  "timestamp": "2026-04-17T10:45:00.000Z"
}
```

### Khi công ty không có dữ liệu (bỏ qua)

```json
{
  "success": true,
  "inferred_data": [
    {
      "company_id": "550e8400-e29b-41d4-a716-446655440001",
      "company_name": "Unknown Company",
      "total_verified_events": 0,
      "total_saved_to_db": 0,
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
          "confidence_score": 0
        }
      ]
    }
  ],
  "database_result": {
    "total_events_saved": 0,
    "skipped_no_data": 1,
    "errors": 0
  }
}
```

---

## 🧪 Ví dụ Sử Dụng (Curl)

### Gọi lần 1: Tìm và lưu sự kiện

```bash
curl --location 'http://localhost:3000/api/events/infer-openai' \
  --header 'Content-Type: application/json' \
  --data '{
    "companies": [
      {
        "company_id": "550e8400-e29b-41d4-a716-446655440000",
        "company_name": "Flushing Bank",
        "website": "https://www.flushingbank.com",
        "industry": "BANK",
        "address": "1044 William Floyd Pkwy, Shirley, NY 11967, USA",
        "distance_from_center": 51.40
      }
    ],
    "auto_save": true
  }'
```

**Kết quả lần 1:**

- ✅ Tìm được 2 sự kiện
- ✅ Lưu vào database: 2 sự kiện

### Gọi lại lần 2: Kiểm tra sự kiện mới

```bash
# Gọi lại API cùng với cùng company_id
curl --location 'http://localhost:3000/api/events/infer-openai' \
  --header 'Content-Type: application/json' \
  --data '{
    "companies": [
      {
        "company_id": "550e8400-e29b-41d4-a716-446655440000",
        "company_name": "Flushing Bank",
        "website": "https://www.flushingbank.com",
        "industry": "BANK",
        "address": "1044 William Floyd Pkwy, Shirley, NY 11967, USA",
        "distance_from_center": 51.40
      }
    ],
    "auto_save": true
  }'
```

**Kết quả lần 2:**

- 🤖 OpenAI lại tìm được 3 sự kiện (2 cũ + 1 mới)
- 🔍 API kiểm tra: sự kiện mới?
  - ✅ Sự kiện C là mới → Lưu thêm vào DB
  - ⏭️ Sự kiện A, B đã có rồi → Bỏ qua
- 📊 Trả về: 1 sự kiện mới + 2 sự kiện cũ = tổng 3

---

## 🔄 Luồng Hoạt Động Chi Tiết

### Quy trình Gọi Lần Đầu

```
Client
  ↓ Gửi request (auto_save: true)
  ↓
API /api/events/infer-openai
  ↓
  1. Validate request (company_id bắt buộc)
  ↓
  2. Gọi OpenAI
     - Tìm kiếm sự kiện từ: website, LinkedIn, báo chí
     - Trả về max 3 sự kiện / công ty
  ↓
  3. Lọc dữ liệu
     - Loại bỏ "no information" events
  ↓
  4. Lưu vào Database
     - CREATE events (nếu chưa có)
     - CREATE company_events relationships
  ↓
  5. Trả về response
     - inferred_data: [sự kiện từ OpenAI]
     - database_result: {
       total_events_saved: 2,
       total_company_events_saved: 2
     }
  ↓
Client nhận được response
```

### Quy trình Gọi Lần 2+

```
Client
  ↓ Gửi request lại (cùng company_id)
  ↓
API /api/events/infer-openai
  ↓
  1. Validate request
  ↓
  2. Gọi OpenAI lần nữa
     - Tìm kiếm sự kiện (có thể tìm được cái mới)
  ↓
  3. So sánh với dữ liệu cũ trong DB
     - event_id mới? → Chưa lưu
     - event_id cũ? → Đã lưu rồi
  ↓
  4. Lưu sự kiện mới (nếu có)
     - CREATE events (chỉ cái mới)
     - CREATE company_events relationships
  ↓
  5. Trả về response
     - inferred_data: [sự kiện từ OpenAI lần này]
     - database_result: {
       new_events_added: 1,
       existing_events: 2,
       total_events_in_db: 3
     }
  ↓
Client nhận được response
```

## 🔍 Cách Detect Sự Kiện Trùng (Deduplication)

### ⚡ Smart Detection Logic

Hệ thống sử dụng **2 tiêu chí** để detect xem sự kiện đã tồn tại hay chưa:

```
1. date_verified (ngày sự kiện)
2. event_type (loại sự kiện)
```

**Tại sao không dùng `event_name`?**

Vì OpenAI có thể generate **cùng sự kiện nhưng name khác**:

```
Lần 1: "Verizon 5G Innovation Session" (Conference, 2023-09-15)
Lần 2: "5G Summit 2023" (Conference, 2023-09-15)
Lần 3: "5G Conference America" (Conference, 2023-09-15)
↓
Tất cả = CÙNG sự kiện (date + type giống)
→ Chỉ lưu 1 lần, không duplicate
```

### 🧪 Ví Dụ Thực Tế

#### Scenario: Verizon Event (3 lần gọi API)

**Lần 1:**

```
OpenAI: "Verizon 5G Innovation Session" (Conference, 2023-09-15)
Check: date=2023-09-15 + type=Conference → Chưa có
→ Tạo event mới (event_id_1)
```

**Lần 2 (1 tuần sau):**

```
OpenAI: "5G Summit 2023" (Conference, 2023-09-15) ← Name khác!
Check: date=2023-09-15 + type=Conference → Đã có (event_id_1)
→ Dùng lại event_id_1 (không tạo event mới)
Response: "existing_events: 1" ✅
```

**Lần 3 (2 tuần sau):**

```
OpenAI: "5G Conference America" (Conference, 2023-09-15) ← Name lại khác!
Check: date=2023-09-15 + type=Conference → Đã có (event_id_1)
→ Dùng lại event_id_1 (vẫn không tạo event mới)
Response: "existing_events: 1" ✅
```

### 📊 Database Result

```
events table: 1 record (event_id_1)
  - name: "Verizon 5G Innovation Session" (lưu tên từ lần 1)
  - raw_data: {
      "variations": [
        "Verizon 5G Innovation Session",  // Lần 1
        "5G Summit 2023",                  // Lần 2
        "5G Conference America"            // Lần 3
      ]
    }

company_events table: 1 record (ce_1)
  - company_id: verizon-uuid
  - event_id: event_id_1
  - first_seen_at: 2026-04-17T10:00:00 (Lần 1)
  - last_seen_at: 2026-05-01T11:00:00 (Lần 3 - cập nhật)
```

### 🔑 Key Points

| Aspect                  | Cũ              | Mới           |
| ----------------------- | --------------- | ------------- |
| Check trùng             | `name + type`   | `date + type` |
| "Same event, diff name" | ❌ Duplicate    | ✅ Detected   |
| Name variations         | ❌ Tạo multiple | ✅ Lưu 1x     |
| Raw data                | Có              | Có (đầy đủ)   |

---

### Bảng: events

Lưu thông tin sự kiện

```sql
CREATE TABLE events (
  id UUID PRIMARY KEY,
  name VARCHAR(500),
  event_type VARCHAR(100),
  description TEXT,
  location VARCHAR(500),
  start_date TIMESTAMP,
  organizer VARCHAR(255),
  url VARCHAR(500),
  external_source VARCHAR(100),  -- "openai_inferred"
  status VARCHAR(50),            -- "active"
  raw_data JSONB,               -- Dữ liệu chi tiết từ OpenAI
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

### Bảng: company_events

Mối quan hệ giữa công ty và sự kiện

```sql
CREATE TABLE company_events (
  id UUID PRIMARY KEY,
  company_id UUID,              -- Công ty
  event_id UUID,                -- Sự kiện
  status VARCHAR(100),          -- "inferred"
  source_name VARCHAR(100),     -- "company website", "LinkedIn"
  source_url VARCHAR(500),
  confidence_score DECIMAL,     -- 0.0 - 1.0
  first_seen_at TIMESTAMP,
  last_seen_at TIMESTAMP,
  created_at TIMESTAMP
);
```

---

## 🎯 Use Case Thực Tế

### Scenario: Theo dõi sự kiện của ngân hàng

**Tuần 1:**

```
POST /api/events/infer-openai
{
  "companies": [{"company_id": "bank-123", "company_name": "Flushing Bank"}]
}

Response:
- Tìm được: 2 sự kiện
- Lưu vào DB: 2 sự kiện ✅
```

**Tuần 2:**

```
POST /api/events/infer-openai (gọi lại cùng company_id)
{
  "companies": [{"company_id": "bank-123", "company_name": "Flushing Bank"}]
}

Response:
- Tìm được: 3 sự kiện (2 cũ + 1 mới)
- Kiểm tra: sự kiện mới?
  - ✅ Event C (Blockchain Summit) chưa có → Lưu thêm
  - ⏭️ Event A, B đã có → Bỏ qua
- Trả về:
  {
    "new_events_found": 1,
    "existing_events_in_db": 2,
    "total_in_db": 3
  }
```

**Tuần 3:**

```
POST /api/events/infer-openai (gọi lại lần 3)

Response:
- Tìm được: 3 sự kiện (không có thêm)
- Kiểm tra: có sự kiện mới không?
  - ❌ Không có mới
- Trả về:
  {
    "new_events_found": 0,
    "existing_events_in_db": 3,
    "total_in_db": 3
  }
```

---

## ⚙️ Cấu Hình

### Biến Môi Trường

```bash
# .env
OPENAI_API_KEY=sk-xxxxx...
DATABASE_URL=postgresql://user:pass@localhost/dbname
```

### Database Connection

Đảm bảo đã tạo tables:

- ✅ `events`
- ✅ `company_events`
- ✅ `companies`

---

## 🚨 Lỗi Thường Gặp

### 1. Lỗi: "company_id is required"

**Nguyên nhân:** Quên truyền `company_id`

**Giải pháp:**

```json
{
  "companies": [
    {
      "company_id": "550e8400-e29b-41d4-a716-446655440000", // ← Thêm dòng này
      "company_name": "Flushing Bank"
    }
  ]
}
```

### 2. Lỗi: "OpenAI API not configured"

**Nguyên nhân:** Quên set biến `OPENAI_API_KEY`

**Giải pháp:**

```bash
# .env
OPENAI_API_KEY=sk-xxxxx...
```

### 3. Database errors khi lưu

**Nguyên nhân:** Tables chưa tạo hoặc UUID format sai

**Giải pháp:**

- Kiểm tra database connection
- Chạy migrations để tạo tables

---

## 📊 Thống Kê & Monitoring

### Quan sát Kết Quả

```javascript
const response = await fetch('http://localhost:3000/api/events/infer-openai', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({...})
});

const data = await response.json();

// Kiểm tra lần gọi đầu tiên
if (data.database_result.total_events_saved > 0) {
  console.log(`✅ Lưu ${data.database_result.total_events_saved} sự kiện mới`);
}

// Kiểm tra lần gọi tiếp theo
if (data.call_type === 'follow_up') {
  if (data.database_result.new_events_added > 0) {
    console.log(`✨ Phát hiện ${data.database_result.new_events_added} sự kiện mới`);
  } else {
    console.log(`ℹ️  Không có sự kiện mới (tổng: ${data.database_result.total_in_db})`);
  }
}
```

---

## 📚 Tài Liệu Liên Quan

- [Database Schema](./DATABASE_SCHEMA.md)
- [Company Event Entity](../src/database/entities/company-event.entity.ts)
- [Event Entity](../src/modules/event/entities/event.entity.ts)

---

## 💡 Tips & Tricks

### 1. Gọi API định kỳ để cập nhật sự kiện mới

```javascript
// Cứ 1 tuần gọi 1 lần để check sự kiện mới
setInterval(
  () => {
    fetchInferOpenAI(companyId);
  },
  7 * 24 * 60 * 60 * 1000,
); // 7 days
```

### 2. Batch processing nhiều công ty cùng lúc

```javascript
const companies = await getCompaniesList(); // 100 công ty

const response = await fetch("/api/events/infer-openai", {
  body: JSON.stringify({
    companies: companies, // Truyền cả 100
    auto_save: true,
  }),
});

// Lấy thống kê tổng
console.log(response.database_result.total_events_saved);
```

### 3. Kiểm tra độ tin cậy của sự kiện

```javascript
// Chỉ xem sự kiện có confidence_score >= 0.8
const reliableEvents = data.inferred_data[0].events.filter(
  (e) => e.confidence_score >= 0.8,
);
```
