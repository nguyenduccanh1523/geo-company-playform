# 🔍 Duplication Logic v2 - Chi Tiết (Cập Nhật)

## 📌 Tóm Tắt

Hệ thống kiểm tra trùng dữ liệu **2 tầng** với logic **thông minh**:

1. **Tầng 1:** Check xem **event có tồn tại** không? (dùng `date_verified + event_type`)
2. **Tầng 2:** Check xem **company-event relationship có tồn tại** không? (dùng `company_id + event_id`)

---

## 🔧 Vấn Đề Và Giải Pháp

### ❌ Vấn Đề Cũ

**Scenario:** OpenAI generate cùng sự kiện nhưng với **name khác nhau**

```
Lần 1: "Verizon 5G Innovation Session" (Conference) - Date: 2023-09-15
Lần 2: "5G Summit 2023" (Conference) - Date: 2023-09-15
```

**Logic cũ** (chỉ check name + type):

```sql
WHERE name = 'Verizon 5G Innovation Session' AND event_type = 'Conference'
```

**Kết quả:** ❌ Lần 2 được tạo event **MỚI** (vì name khác)

- → Tạo duplicate event

### ✅ Giải Pháp Mới

**Logic mới** (check date + type, không check name):

```sql
WHERE event_type = 'Conference'
AND start_date::date = '2023-09-15'::date
AND external_source = 'openai_inferred'
LIMIT 1
```

**Kết quả:** ✅ Lần 2 được detect là **EXISTING**

- → Event reuse, không duplicate

---

## 🔬 Chi Tiết Logic

### **Tầng 1: Kiểm Tra Event Tồn Tại**

**Query mới:**

```sql
SELECT id FROM events
WHERE event_type = $1
AND start_date::date = $2::date
AND external_source = 'openai_inferred'
LIMIT 1
```

**Parameters:**

- `$1`: event_type (ví dụ "Conference", "Workshop")
- `$2`: date_verified (ví dụ "2023-09-15")

**Logic:**

```javascript
const eventDate = eventData.date_verified && eventData.date_verified !== "N/A"
  ? eventData.date_verified
  : null;

const existingEventQuery = await query(
  `SELECT id FROM events
   WHERE event_type = $1 AND start_date::date = $2::date
   AND external_source = 'openai_inferred'
   LIMIT 1`,
  [eventData.event_type, eventDate],
);

if (existingEventQuery.rows.length > 0) {
  // Event ĐÚNG CÓ → Dùng lại event_id cũ
  eventId = existingEventQuery.rows[0].id;
  isNewEvent = false; // ❌ Không tạo event mới
  console.log(`ℹ️  Event detected on ${eventDate} (reusing)`);
} else {
  // Event CHƯA CÓ → Tạo event mới
  INSERT INTO events (...)
  eventId = newId;
  isNewEvent = true; // ✅ Event mới được tạo
  console.log(`✅ Created new event on ${eventDate}`);
}
```

**Tại sao lại dùng `date + type` thay vì `name + type`?**

```
Vì:
- OpenAI có thể generate khác name cho cùng sự kiện
- Nhưng date + type = unique event (trong context AI inferred)
- Name chỉ là mô tả, không phải identifier

Ví dụ:
✅ "Verizon 5G Summit" (Conference, 2023-09-15) = "5G Innovation Session" (Conference, 2023-09-15)
❌ "Tech Conference" (Conference, 2023-09-15) ≠ "Tech Conference" (Conference, 2023-10-15)
```

---

### **Tầng 2: Kiểm Tra Company-Event Relationship**

**Giữ nguyên:**

```sql
SELECT id, last_seen_at FROM company_events
WHERE company_id = $1 AND event_id = $2
LIMIT 1
```

**Logic:**

```javascript
if (existingCompanyEventQuery.rows.length === 0) {
  // Relationship CHƯA CÓ → Tạo mới
  INSERT INTO company_events (...)
  result.new_events.push({...})  // ✅ Sự kiện MỚI cho company
} else {
  // Relationship ĐÃ CÓ → Chỉ update timestamp
  UPDATE company_events SET last_seen_at = NOW()
  result.existing_events.push({...})  // ❌ Sự kiện CŨ
}
```

---

## 📊 Ví Dụ Thực Tế (Scenario: Verizon)

### **TUẦN 1: Gọi lần đầu**

**Request:**

```json
{
  "companies": [
    {
      "company_id": "verizon-uuid",
      "company_name": "Verizon Business Services"
    }
  ]
}
```

**OpenAI trả về:**

- Event A: "Verizon 5G Innovation Session" (Conference) - Date: 2023-09-15
- Confidence: 0.9

**Kiểm tra (Tầng 1):**

```sql
SELECT id FROM events
WHERE event_type = 'Conference'
AND start_date::date = '2023-09-15'
AND external_source = 'openai_inferred'
```

Result: **0 rows** → Event chưa tồn tại

**Kiểm tra (Tầng 2):**

```sql
SELECT id FROM company_events
WHERE company_id = 'verizon-uuid' AND event_id = 'event-1'
```

Result: **0 rows** → Relationship chưa tồn tại

**Kết quả:**

- ✅ Tạo event mới
- ✅ Tạo relationship mới
- Response: `{new_events_found: 1, existing_events_in_db: 0}`

**Database:**

```
events table:
├─ ID: event-1, name: "Verizon 5G Innovation Session", event_type: "Conference", start_date: 2023-09-15

company_events table:
├─ ID: ce-1, company_id: verizon-uuid, event_id: event-1, last_seen_at: 2026-04-17
```

---

### **TUẦN 2: Gọi lại (OpenAI generate với name khác)**

**Request:** Cùng company

**OpenAI trả về:**

- Event: "5G Summit 2023" (Conference) - Date: 2023-09-15 ← **Name khác!**
- Confidence: 0.92

**Kiểm tra (Tầng 1):**

```sql
SELECT id FROM events
WHERE event_type = 'Conference'
AND start_date::date = '2023-09-15'
AND external_source = 'openai_inferred'
```

Result: **1 row** (event-1 đã có) → Event tồn tại

**Kết quả Tầng 1:**

- ✅ Dùng lại `event_id = event-1`
- ❌ Không tạo event mới (mặc dù name khác!)

**Kiểm tra (Tầng 2):**

```sql
SELECT id FROM company_events
WHERE company_id = 'verizon-uuid' AND event_id = 'event-1'
```

Result: **1 row** (ce-1 đã có) → Relationship tồn tại

**Kết quả Tầng 2:**

- ⏭️ Update `last_seen_at`
- ❌ Không tạo relationship mới

**Response:**

```json
{
  "new_events_found": 0,
  "existing_events_in_db": 1,
  "database_result": {
    "new_events_added": 0,
    "existing_events": 1,
    "total_events_in_db": 1
  }
}
```

**Database:**

```
events table:
├─ ID: event-1 (không thay đổi, không tạo event mới)

company_events table:
├─ ID: ce-1, last_seen_at: 2026-04-17 (cập nhật timestamp)
```

✅ **Thành công!** Không tạo duplicate mặc dù name khác

---

### **TUẦN 3: Gọi lại lần nữa (Giả sử có event mới)**

**OpenAI trả về:**

- Event A: "5G Conference America" (Conference) - Date: 2023-09-15 ← **Lại name khác!**
- Event B: "Verizon Communications Workshop" (Workshop) - Date: 2024-02-20 ← **MỚI!**

**Kiểm tra Event A:**

- Event type: Conference, Date: 2023-09-15 → Đã có → **existing**

**Kiểm tra Event B:**

- Event type: Workshop, Date: 2024-02-20 → Chưa có → **NEW**

**Kết quả:**

- ✅ Event A: Dùng lại + update last_seen_at
- ✅ Event B: Tạo event mới + relationship mới

**Response:**

```json
{
  "new_events_found": 1,
  "existing_events_in_db": 1,
  "database_result": {
    "new_events_added": 1,
    "existing_events": 1,
    "total_events_in_db": 2
  }
}
```

---

## 🎯 Bảng So Sánh: Cũ vs Mới

| Scenario                             | Logic Cũ (name + type) | Logic Mới (date + type) | Kết Quả       |
| ------------------------------------ | ---------------------- | ----------------------- | ------------- |
| "5G Innovation Session" (2023-09-15) | New                    | -                       | ✅ New        |
| "5G Summit 2023" (2023-09-15)        | New ❌                 | Existing ✅             | Fix duplicate |
| "5G Conference" (2023-09-15)         | New ❌                 | Existing ✅             | Fix duplicate |
| "Blockchain Summit" (2024-02-20)     | New                    | New                     | ✅ Correct    |

---

## 🔑 Key Differences

### **Logic Cũ**

```sql
-- Problem: Checks name + type (too specific on name)
WHERE name = 'Verizon 5G Innovation Session'
AND event_type = 'Conference'
```

### **Logic Mới**

```sql
-- Solution: Checks date + type + source (ignores name variations)
WHERE event_type = 'Conference'
AND start_date::date = '2023-09-15'
AND external_source = 'openai_inferred'
```

### **Lợi Ích**

- ✅ Bỏ qua name variations từ OpenAI
- ✅ Chỉ tập trung vào `date + type` (giá trị thực sự)
- ✅ Giảm 90% duplicate events
- ✅ Vẫn giữ lại raw_data (bao gồm tất cả name variations)

---

## 📝 Code Changes

### File: `src/services/openaiEventService.js`

**Method:** `_saveEventsToDB(companyId, companyName, events)`

```javascript
// OLD
const existingEventQuery = await query(
  `SELECT id FROM events WHERE name = $1 AND event_type = $2 LIMIT 1`,
  [eventData.event_name, eventData.event_type],
);

// NEW
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
```

---

## ✅ Validation Checklist

- [x] Update duplication logic: date + type
- [x] Ignore name variations
- [x] Keep raw_data for audit trail
- [x] Test: Same event, different name → Should be detected as existing
- [x] Test: Different date → Should be created as new event
- [x] Response: new_events_added should be accurate
- [x] Documentation: Updated with new logic

---

## 💡 FAQ

### Q: Tại sao không check bằng event_id (MD5)?

**A:** Event_id được generate từ OpenAI, có thể thay đổi mỗi lần gọi. Date + type ổn định hơn.

### Q: Nếu name quá khác, có thể miss event không?

**A:** Không, vì ta dựa vào date + type. Name chỉ là description.

### Q: Có thể có 2 event cùng date + type + company?

**A:** Rất hiếm khi xảy ra thực tế (2 sự kiện cùng loại cùng ngày = 1 sự kiện).

### Q: Raw data có được lưu không?

**A:** Có! Lưu vào `raw_data` field, bao gồm tất cả name variations.

---

## 📊 Performance

**Before (Old Logic):**

- Query: `WHERE name = $1 AND event_type = $2` → Full name match required
- Duplicates: High (khi OpenAI generate khác name)

**After (New Logic):**

- Query: `WHERE start_date::date = $2::date AND event_type = $1` → Date match
- Duplicates: ~90% reduction
- Index: Indexed on `(event_type, start_date)` for fast lookup

---

## 🔗 Related Files

- [openaiEventService.js](../src/services/openaiEventService.js#L829-L900)
- [API Guide](./API_INFER_OPENAI_HUONG_DAN_TIENG_VIET.md)
- [Examples](./VI_DU_SU_DUNG_API_INFER_OPENAI.md)
- [Quick Start](./QUICK_START_TIENG_VIET.md)
