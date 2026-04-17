# 📚 API /api/events/infer-openai - Cập Nhật v2

## 🎉 Những Gì Đã Thay Đổi

### ✨ Tính Năng Mới (v2)

#### 1. ✅ Yêu Cầu `company_id`

- Bắt buộc truyền `company_id` (UUID) cho mỗi công ty
- Dùng để truy vết công ty trong database
- Validation kiểm tra tất cả companies đều có `company_id`

#### 2. ✅ Tự Động Lưu vào Database

- Không cần gọi API import riêng
- Tự động tạo records trong `events` table
- Tự động tạo relationships trong `company_events` table
- Chỉ lưu khi có **real events** (bỏ qua "no information")

#### 3. ✅ Detect Sự Kiện Mới vs Cũ

- **Lần gọi đầu:** Lưu tất cả sự kiện
- **Lần gọi sau:** Kiểm tra sự kiện mới vs cũ, chỉ lưu cái mới
- **Lần gọi tiếp:** Không có mới → chỉ update `last_seen_at`

#### 4. ✅ Smart Duplication Detection (v2.1)

**Vấn đề cũ:** OpenAI có thể generate cùng sự kiện nhưng **name khác nhau**

- "Verizon 5G Innovation Session" (Lần 1)
- "5G Summit 2023" (Lần 2)
- → Cũ = detect duplicate, Mới = tạo 2 event

**Giải pháp mới:** Check bằng `date_verified + event_type` thay vì `name + type`

- Same date (2023-09-15) + Same type (Conference) = **Cùng sự kiện**
- ✅ Không duplicate mặc dù name khác
- ✅ Raw data lưu đầy đủ (bao gồm tất cả name variations)

📖 Chi tiết: [DUPLICATION_LOGIC_V2.md](./DUPLICATION_LOGIC_V2.md)

#### 5. ✅ Response Format Thống Nhất

- Trả về exact count sự kiện lưu/skip
- Thông tin về new_events vs existing_events
- Chi tiết mỗi sự kiện (tên, loại, đúng/sai)

---

## 📝 Files Documentation Bằng Tiếng Việt

### 📖 Hướng Dẫn Chi Tiết

**File:** `docs/API_INFER_OPENAI_HUONG_DAN_TIENG_VIET.md`

Nội dung:

- 📌 Giới thiệu và use case
- 📝 Định dạng request/response chi tiết
- 🔄 Luồng hoạt động (lần 1, 2, 3+)
- 💾 Database schema
- 🧪 Ví dụ Curl + JavaScript + Python
- 🚨 Troubleshooting

**Dùng khi:** Muốn hiểu chi tiết cách hoạt động

---

### 📝 Ví Dụ Thực Tế

**File:** `docs/VI_DU_SU_DUNG_API_INFER_OPENAI.md`

Nội dung:

- ⏰ Tuần 1: Gọi lần đầu (tìm + lưu 2 sự kiện)
- ⏰ Tuần 2: Gọi lần 2 (tìm được 1 mới + 2 cũ)
- ⏰ Tuần 3: Gọi lần 3 (không có mới)
- 🧪 Code examples xử lý response
- 💡 Các trường hợp sử dụng

**Dùng khi:** Muốn thấy ví dụ thực tế flow

---

### ⚡ Quick Start

**File:** `docs/QUICK_START_TIENG_VIET.md`

Nội dung:

- 🚀 Copy-paste Curl examples
- 📊 Bảng so sánh
- 🔑 Các trường bắt buộc
- 🧪 Các use cases
- ⚡ Tips & Tricks

**Dùng khi:** Muốn nhanh chóng bắt đầu

---

## 🔧 Code Updates (Python Backend)

### File: `src/services/openaiEventService.js`

#### Thay Đổi 1: Import crypto + database module

```javascript
import crypto from "crypto";
import { query } from "../config/database.js";
```

#### Thay Đổi 2: Update `inferCompanyEvents()`

- Thêm logic detect new vs existing events
- Lưu new events vào DB
- Update `last_seen_at` cho existing
- Return detailed stats

#### Thay Đổi 3: Update `_saveEventsToDB()`

- Check xem event đã tồn tại không
- Check xem company-event relationship đã tồn tại không
- Nếu mới → Tạo event + relationship
- Nếu cũ → Update `last_seen_at`
- Return: `{events_saved, new_events, existing_events, ...}`

#### Thay Đổi 4: Enrich Response

- Thêm `new_events_found` trong inferred_data
- Thêm `existing_events_in_db` trong inferred_data
- Thêm `new_events_added`, `existing_events`, `total_events_in_db` trong database_result

---

## 📊 Response Format Comparison

### Response Lần 1 (Gọi đầu tiên)

```json
{
  "success": true,
  "database_result": {
    "new_events_added": 2,
    "existing_events": 0,
    "total_events_in_db": 2
  },
  "inferred_data": [
    {
      "new_events_found": 2,
      "existing_events_in_db": 0,
      "events": [{ "event_id": "a1b2...", "event_name": "Event 1" }]
    }
  ]
}
```

### Response Lần 2 (Có sự kiện mới)

```json
{
  "success": true,
  "database_result": {
    "new_events_added": 1,
    "existing_events": 2,
    "total_events_in_db": 3
  },
  "inferred_data": [
    {
      "new_events_found": 1,
      "existing_events_in_db": 2,
      "events": [
        { "event_id": "a1b2...", "status": "existing" },
        { "event_id": "b2c3...", "status": "existing" },
        { "event_id": "c3d4...", "status": "newly_added" }
      ]
    }
  ]
}
```

### Response Lần 3 (Không có mới)

```json
{
  "success": true,
  "database_result": {
    "new_events_added": 0,
    "existing_events": 3,
    "total_events_in_db": 3
  }
}
```

---

## 🎯 Cách Sử Dụng

### Step 1: Gọi lần đầu

```bash
curl -X POST http://localhost:3000/api/events/infer-openai \
  -H 'Content-Type: application/json' \
  -d '{
    "companies": [{
      "company_id": "550e8400-e29b-41d4-a716-446655440000",
      "company_name": "Flushing Bank"
    }],
    "auto_save": true
  }'
```

**Kết quả:** Lưu tất cả sự kiện tìm được

---

### Step 2: Gọi lại tuần sau

```bash
# Cùng request, chỉ gọi lại
curl -X POST http://localhost:3000/api/events/infer-openai \
  -H 'Content-Type: application/json' \
  -d '{
    "companies": [{
      "company_id": "550e8400-e29b-41d4-a716-446655440000",
      "company_name": "Flushing Bank"
    }],
    "auto_save": true
  }'
```

**Kết quả:**

- Nếu có sự kiện mới → Lưu thêm
- Nếu không có mới → Chỉ update `last_seen_at`

---

## 🧪 Testing

### Test Case 1: Lần gọi đầu

```bash
POST /api/events/infer-openai
{
  "companies": [{"company_id": "uuid1", "company_name": "Company A"}],
  "auto_save": true
}
```

**Expect:**

- `new_events_added: > 0`
- `existing_events: 0`
- Events saved to DB

---

### Test Case 2: Gọi lại

```bash
POST /api/events/infer-openai
{
  "companies": [{"company_id": "uuid1", "company_name": "Company A"}],
  "auto_save": true
}
```

**Expect:**

- `new_events_added: >= 0`
- `existing_events: > 0`
- Only new events saved

---

### Test Case 3: Preview mode

```bash
POST /api/events/infer-openai
{
  "companies": [{"company_id": "uuid1", "company_name": "Company A"}],
  "auto_save": false
}
```

**Expect:**

- `database_result: null`
- No DB operations

---

## 📚 Các File Liên Quan

### Documentation

- ✅ `docs/API_INFER_OPENAI_HUONG_DAN_TIENG_VIET.md` - Hướng dẫn chi tiết
- ✅ `docs/VI_DU_SU_DUNG_API_INFER_OPENAI.md` - Ví dụ chi tiết
- ✅ `docs/QUICK_START_TIENG_VIET.md` - Quick start
- 📄 `docs/DATABASE_SCHEMA.md` - Database schema
- 📄 `docs/INFER_EVENTS_API_GUIDE.md` - Old guide (reference)

### Code

- 📝 `src/api/eventSearchAPI.js` - Handler (updated)
- 📝 `src/services/openaiEventService.js` - Service (updated)
- 📄 `src/database/entities/company-event.entity.ts` - Entity
- 📄 `src/modules/event/entities/event.entity.ts` - Event entity

---

## ✅ Checklist

- [x] Update `handleInferOpenAI()` để validate `company_id`
- [x] Update `inferCompanyEvents()` để detect new vs existing
- [x] Update `_saveEventsToDB()` để save with checks
- [x] Return detailed stats (new_events_added, existing_events, total)
- [x] Create `API_INFER_OPENAI_HUONG_DAN_TIENG_VIET.md`
- [x] Create `VI_DU_SU_DUNG_API_INFER_OPENAI.md`
- [x] Create `QUICK_START_TIENG_VIET.md`
- [x] Create this README

---

## 🚀 Next Steps

1. **Test** các scenarios (lần 1, lần 2, lần 3)
2. **Verify** events lưu vào database chính xác
3. **Monitor** log để chắc chắn flow hoạt động
4. **Deploy** thay đổi code lên production
5. **Notify** users về tính năng mới

---

## 📞 Support

Nếu có câu hỏi, hãy xem:

1. `QUICK_START_TIENG_VIET.md` - Nhanh chóng bắt đầu
2. `VI_DU_SU_DUNG_API_INFER_OPENAI.md` - Ví dụ cụ thể
3. `API_INFER_OPENAI_HUONG_DAN_TIENG_VIET.md` - Chi tiết đầy đủ

---

**Version:** v2.0  
**Updated:** 2026-04-17  
**Language:** Tiếng Việt
