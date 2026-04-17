# 🚀 Quick Start - API /api/events/infer-openai

## 📌 Tóm Tắt Ngắn

API này **suy luận và lưu sự kiện** của công ty sử dụng OpenAI.

✨ **Tính năng chính:**

- 🤖 Sử dụng AI để tìm sự kiện từ website, LinkedIn, báo chí
- 💾 Tự động lưu vào database (không cần API import riêng)
- 🔄 Gọi lại để check sự kiện **MỚI** (không trùng)
- 📊 Báo cáo chi tiết: bao nhiêu mới, bao nhiêu cũ, tổng cộng

---

## 💻 Cách Gọi API (Curl)

### Lần đầu tiên (tìm và lưu sự kiện)

```bash
curl -X POST http://localhost:3000/api/events/infer-openai \
  -H 'Content-Type: application/json' \
  -d '{
    "companies": [{
      "company_id": "550e8400-e29b-41d4-a716-446655440000",
      "company_name": "Flushing Bank",
      "website": "https://www.flushingbank.com",
      "industry": "BANK",
      "address": "1044 William Floyd Pkwy, Shirley, NY 11967"
    }],
    "auto_save": true
  }'
```

**Response:**

```json
{
  "success": true,
  "database_result": {
    "new_events_added": 2,
    "existing_events": 0,
    "total_events_in_db": 2
  }
}
```

✅ **Kết quả Lần 1:**

- Tìm được 2 sự kiện
- Lưu 2 sự kiện mới
- Tổng trong DB: 2

---

### Lần thứ 2 (kiểm tra sự kiện mới)

```bash
# Gọi lại API với cùng company_id (1 tuần sau)
curl -X POST http://localhost:3000/api/events/infer-openai \
  -H 'Content-Type: application/json' \
  -d '{
    "companies": [{
      "company_id": "550e8400-e29b-41d4-a716-446655440000",
      "company_name": "Flushing Bank",
      "website": "https://www.flushingbank.com",
      "industry": "BANK"
    }],
    "auto_save": true
  }'
```

**Response:**

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
        {
          "event_id": "a1b2...",
          "event_name": "Banking Conference",
          "status": "existing"
        },
        {
          "event_id": "b2c3...",
          "event_name": "Workshop",
          "status": "existing"
        },
        {
          "event_id": "c3d4...",
          "event_name": "Blockchain Summit",
          "status": "newly_added"
        }
      ]
    }
  ]
}
```

✅ **Kết quả Lần 2:**

- Tìm được 3 sự kiện (2 cũ + 1 mới)
- Lưu 1 sự kiện MỚI
- Không lưu 2 cái cũ (đã có rồi)
- Tổng trong DB: 3

---

### Lần thứ 3 (không có mới)

```bash
# Gọi lại 1 tuần nữa
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

**Response:**

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

✅ **Kết quả Lần 3:**

- Tìm được 3 sự kiện (giống tuần trước)
- Không có sự kiện mới
- Không cần lưu gì
- Tổng trong DB: 3 (giữ nguyên)

---

## 📊 Bảng So Sánh

| Lần gọi | OpenAI tìm | Lưu mới | Không lưu cũ | Tổng DB |
| ------- | ---------- | ------- | ------------ | ------- |
| Lần 1   | 2          | 2       | -            | 2       |
| Lần 2   | 3          | 1       | 2            | 3       |
| Lần 3   | 3          | 0       | 3            | 3       |

---

## 🔑 Các Trường Bắt Buộc

```json
{
  "companies": [
    {
      "company_id": "uuid", // ← BẮT BUỘC
      "company_name": "Tên công ty", // ← BẮT BUỘC
      "website": "https://...", // ← Tùy chọn
      "industry": "Ngành", // ← Tùy chọn
      "address": "Địa chỉ" // ← Tùy chọn
    }
  ],
  "auto_save": true // ← Tùy chọn (mặc định: true)
}
```

---

## 📋 Response Fields

### database_result

| Trường               | Ý nghĩa                                   |
| -------------------- | ----------------------------------------- |
| `new_events_added`   | Số sự kiện **mới** được lưu trong lần này |
| `existing_events`    | Số sự kiện **cũ** (đã có trong DB trước)  |
| `total_events_in_db` | Tổng sự kiện của công ty trong DB         |
| `errors`             | Số lỗi xảy ra                             |

### inferred_data[]

| Trường                  | Ý nghĩa                       |
| ----------------------- | ----------------------------- |
| `new_events_found`      | Số sự kiện mới trong lần này  |
| `existing_events_in_db` | Số sự kiện cũ trong lần này   |
| `events[].status`       | "newly_added" hoặc "existing" |

---

## 🧪 Use Cases

### Case 1: Lần đầu khám phá sự kiện

```bash
POST /api/events/infer-openai
{
  "companies": [{"company_id": "...", "company_name": "Google Vietnam"}],
  "auto_save": true
}
```

→ Kết quả: Lưu 3 sự kiện mới

---

### Case 2: Cập nhật định kỳ (tuần/tháng)

```bash
# Gọi lại tuần sau
POST /api/events/infer-openai
{
  "companies": [{"company_id": "...", "company_name": "Google Vietnam"}],
  "auto_save": true
}
```

→ Kết quả: Tìm được 1 sự kiện mới (lưu thêm), 3 cái cũ (bỏ qua)

---

### Case 3: Preview mode (xem không lưu)

```bash
POST /api/events/infer-openai
{
  "companies": [{"company_id": "...", "company_name": "Apple Inc"}],
  "auto_save": false  // ← Không lưu vào DB
}
```

→ Kết quả: `database_result: null` (không có DB operations)

---

### Case 4: Bulk (nhiều công ty)

```bash
POST /api/events/infer-openai
{
  "companies": [
    {"company_id": "...", "company_name": "Google Vietnam"},
    {"company_id": "...", "company_name": "Microsoft Vietnam"},
    {"company_id": "...", "company_name": "Apple Vietnam"}
  ],
  "auto_save": true
}
```

→ Kết quả: Báo cáo tổng cho 3 công ty

---

## ⚡ Tips & Tricks

### 1. Check sự kiện mới tự động

```javascript
// Gọi lại API mỗi tuần
setInterval(() => {
  fetch('/api/events/infer-openai', {
    method: 'POST',
    body: JSON.stringify({
      companies: [{...}],
      auto_save: true
    })
  })
  .then(r => r.json())
  .then(data => {
    if (data.database_result.new_events_added > 0) {
      alert('✨ Có sự kiện mới!');
    }
  });
}, 7 * 24 * 60 * 60 * 1000); // 7 ngày
```

### 2. Chỉ xem không lưu

```bash
curl -X POST .../api/events/infer-openai \
  -d '{
    "companies": [...],
    "auto_save": false  # Chỉ lấy dữ liệu, không lưu DB
  }'
```

### 3. Xem sự kiện nào là mới

```javascript
data.database_result.details[0].new_events.forEach((e) => {
  console.log("✨ Mới:", e.event_name);
});
```

---

## 🚨 Lỗi Thường Gặp

### ❌ "company_id is required"

**Giải pháp:** Thêm `company_id` trong request

### ❌ "OpenAI API not configured"

**Giải pháp:** Set biến `OPENAI_API_KEY` trong .env

### ❌ Database connection error

**Giải pháp:** Kiểm tra database connection, chạy migrations

---

## 📚 Tài Liệu Đầy Đủ

- 📖 [Hướng dẫn chi tiết](./API_INFER_OPENAI_HUONG_DAN_TIENG_VIET.md)
- 📝 [Ví dụ chi tiết](./VI_DU_SU_DUNG_API_INFER_OPENAI.md)

---

## 🎯 Summary

```
Lần 1: curl → OpenAI tìm → Lưu tất cả → Return: {new: 2, total: 2}
Lần 2: curl → OpenAI tìm → So sánh → Lưu cái mới → Return: {new: 1, existing: 2, total: 3}
Lần 3: curl → OpenAI tìm → So sánh → Không có mới → Return: {new: 0, existing: 3, total: 3}
```

✅ **Done!** Bây giờ bạn có thể:

1. Gọi API để tìm sự kiện lần đầu
2. Gọi lại để check sự kiện mới (không trùng)
3. Theo dõi tất cả sự kiện của công ty
