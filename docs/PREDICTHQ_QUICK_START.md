# 🚀 Hệ Thống Crawl PredictHQ Events - Tóm Tắt Nhanh

## 📌 Workflow Tổng Quan

Khi bạn gọi `POST /api/search-companies-stream`:

1. **API nhận request** → Tạo Hotel (nếu chưa có)
2. **Google Places Search** chạy **ngầm** (background)
   - Crawl companies từ Google API
   - Lưu vào bảng `hotel_companies`
3. **PredictHQ Events Crawl** chạy **song song** (background)
   - ✅ Check bảng `crawl_locations` xem location có crawled rồi không
   - ✅ Nếu **CHƯA** crawled hoặc **EXPIRED** (>7 ngày) → Gọi PredictHQ API
   - ✅ Lưu events vào bảng `events`
   - ✅ Tạo link giữa `hotel ↔ event` (bảng `hotel_events`)
   - ✅ Update `crawl_locations` (lưu history)
4. **Result**: Hotel có danh sách events gắn liền

---

## 💡 Chức Năng Chính

### ✅ Duplicate Prevention (Tránh Crawl Lặp Lại)

Bảng `crawl_locations` có **UNIQUE** constraint:

```sql
UNIQUE (lat, lng, radius_km, source)
```

**Logic:**

- Nếu cùng vị trí (lat, lng) + cùng radius đã crawl **< 7 ngày** → ⏭️ SKIP
- Nếu crawl **> 7 ngày** hoặc chưa crawl → 🔄 CRAWL lại

**Ví dụ:**

```
Lần 1: lat=41.09, lng=-72.39, radius=10
  → Crawl + lưu vào DB (crawl_count=1, last_crawl_at=now)

Lần 2 (2 giờ sau): cùng coords
  → ⏭️ SKIP "Location already crawled recently"

Lần 3 (8 ngày sau): cùng coords
  → 🔄 CRAWL lại (crawl_count=2, last_crawl_at=new_time)
```

### 🔗 Data Relationships

```
HOTEL (vị trí search)
  ├── HOTEL_COMPANIES (công ty tìm được)
  └── HOTEL_EVENTS (events từ PredictHQ)
        ↓
        EVENT (thông tin event)
        ├── name, description, start_date, location
        ├── lat, lng (vị trí event)
        └── external_id (PredictHQ event ID)
```

### 📊 Database Tables

| Table             | Mô Tả                                                                    |
| ----------------- | ------------------------------------------------------------------------ |
| `crawl_locations` | **NEW** - Track vị trí đã crawl (lat, lng, radius, last_crawl_at, count) |
| `events`          | Events từ PredictHQ (name, location, start_date, external_id)            |
| `hotel_events`    | Link hotel ↔ event (hotel_id, event_id, distance_km)                     |

---

## 🛠️ Setup & Chạy

### 1. Update Database

```bash
# Chạy migration để tạo bảng crawl_locations
npm run mig:run
```

### 2. Environment Variables

```bash
# .env
PREDICTHQ_ACCESS_TOKEN=your_token_here
REDIS_HOST=localhost
REDIS_PORT=6379
```

### 3. Chạy Hệ Thống

**Terminal 1 - Start Server:**

```bash
npm run dev
```

**Terminal 2 - Start Worker (xử lý background jobs):**

```bash
npm run worker:predicthq
```

---

## 📍 Cách Sử Dụng

### Request (với radius từ user - KHÔNG fix cứng)

```bash
curl --location 'http://localhost:3000/api/search-companies-stream' \
  --header 'Content-Type: application/json' \
  --data '{
    "lat": 41.0967548,
    "lng": -72.3955472,
    "radius_km": 10,
    "name": "My Location",
    "forceRefresh": false
  }'
```

**Parameters:**
| Param | Type | Mô Tả |
|-------|------|-------|
| `lat` | number | Latitude (bắt buộc) |
| `lng` | number | Longitude (bắt buộc) |
| `radius_km` | number | **Bán kính search (km)** - user nhập, không fix 8 |
| `name` | string | Tên địa điểm (tuỳ chọn) |
| `forceRefresh` | boolean | Bỏ qua cache (default: false) |

### Response

```json
{
  "success": true,
  "data": {
    "sessionId": "a1b2c3d4...",
    "hotelId": "550e8400-e29b-41d4-a716-446655440000",
    "source": "NEW_SEARCH"
  },
  "message": "Search started in background..."
}
```

### Lấy Events Của Hotel

**Option 1: Via Hotel Endpoint (cách cũ)**

```bash
GET http://localhost:3000/api/hotels/550e8400-e29b-41d4-a716-446655440000
```

**Option 2: Direct Events Endpoint (MỚI - recommended) 🆕**

```bash
# Lấy events gắn với hotel (với pagination)
GET 'http://localhost:3000/api/events/by-hotel/550e8400-e29b-41d4-a716-446655440000?limit=20&offset=0'
```

Response sẽ include:

```json
{
  "success": true,
  "hotel_id": "550e8400-e29b-41d4-a716-446655440000",
  "data": [
    {
      "id": "event-123",
      "name": "Annual Conference 2026",
      "start_date": "2026-07-08T16:00:00Z",
      "location": "Ancestry Drive, Parker, CO",
      "distance_km": 2.5,
      "external_id": "DspncLecTBMkh77pZ8",
      "relationship_type": "nearby",
      "confidence_score": 0.95,
      "linked_at": "2026-04-16T10:30:00Z"
    }
  ],
  "pagination": {
    "limit": 20,
    "offset": 0,
    "total": 15,
    "hasMore": false
  }
}
```

---

## ⚡ Important: Radius Parameter (radius_km)

### ✅ Correct Usage

```
User nhập radius_km = 10
  ↓
API receives: 10
  ↓
PredictHQ call: within=10km@lat,lng ✅
  ↓
Crawl location saved: radius_km=10
```

### ❌ NOT HARDCODED (Không fix cứng)

- **KHÔNG** dùng radius = 8km cố định
- **LUÔN** dùng `radius_km` mà user nhập
- Mỗi (lat, lng, radius_km) là 1 record riêng trong `crawl_locations`

### Example Scenarios

| radius_km | PredictHQ API              | Crawl History              |
| --------- | -------------------------- | -------------------------- |
| 5         | `within=5km@41.09,-72.39`  | Save: lat, lng, 5, source  |
| 10        | `within=10km@41.09,-72.39` | Save: lat, lng, 10, source |
| 50        | `within=50km@41.09,-72.39` | Save: lat, lng, 50, source |

---

## 🔄 PredictHQ API Call (Inside)

Hệ thống gọi:

```
GET https://api.predicthq.com/v1/events
  ?within={radius_km}km@{lat},{lng}
  &active.gte=2026-01-01
  &active.lte=2026-12-31
  &limit=500

Authorization: Bearer {PREDICTHQ_ACCESS_TOKEN}
```

**Dynamic radius (không fix 8):**

- User nhập `radius_km: 10` → API call: `within=10km@41.09,-72.39` ✅
- User nhập `radius_km: 50` → API call: `within=50km@41.09,-72.39` ✅

---

## 📁 Files Được Tạo/Sửa

```
✅ CREATED:
  src/database/entities/crawl-location.entity.ts
  src/database/repositories/crawlLocationRepository.js
  src/services/predictHqEventsService.js
  src/workers/predicthq-events.worker.js
  src/database/migrations/1774200000000-CreateCrawlLocationsTable.ts
  docs/PREDICTHQ_INTEGRATION_GUIDE.md

✅ MODIFIED:
  src/config/queue.js                                  (+ predictHqEventsQueue)
  src/modules/google-places/controller/...             (+ trigger job)
  src/database/typeorm.config.ts                       (+ CrawlLocation entity)
  src/workers/index.js                                 (+ import predicthq worker)
  package.json                                         (+ "worker:predicthq" script)
```

---

## 🚦 Debugging

### 1. Check Queue Status

```bash
# View jobs waiting
redis-cli
> llen rsmq:predicthq-events-crawl:msgs
```

### 2. View Crawl History

```sql
SELECT * FROM crawl_locations
WHERE source = 'predicthq'
ORDER BY last_crawl_at DESC;
```

### 3. View Events Linked to Hotel

```sql
SELECT e.* FROM events e
JOIN hotel_events he ON he.event_id = e.id
WHERE he.hotel_id = '550e8400-e29b-41d4-a716-446655440000';
```

### 4. View Logs

Worker logs sẽ show:

```
🚀 Start PredictHQ crawl: 41.09, -72.39, radius=10km
✅ PredictHQ returned 15 events
✅ Saved event: Annual Conference 2026
🔗 Created hotel-event link: distance=2.5km
📊 Summary: 15 new events, 0 duplicates
```

---

## ⚡ Performance Tips

### 1. Batch Multiple Locations

```javascript
const locations = [
  { lat: 41.09, lng: -72.39, radius_km: 10 },
  { lat: 40.75, lng: -74.0, radius_km: 5 },
];

for (const loc of locations) {
  // Queue jobs
  await predictHqEventsQueue.add(loc);
}
```

### 2. Scale Workers

Run multiple workers để process jobs nhanh hơn:

```bash
npm run worker:predicthq &
npm run worker:predicthq &
npm run worker:predicthq &
```

### 3. Adjust Expiry (Default 7 days)

Modify `crawlLocationRepository.js`:

```javascript
const existingCrawl = await CrawlLocationRepository.findByLocation(...);
if (existingCrawl && !existingCrawl.isExpired(30)) {  // 30 days
  // skip
}
```

---

## 📞 Summary

| Thành Phần                          | Công Dụng                 |
| ----------------------------------- | ------------------------- |
| **crawl-location.entity**           | Track vị trí đã crawl     |
| **predictHqEventsService**          | Call API + transform data |
| **predicthq-events.worker**         | Process jobs từ queue     |
| **google-places-stream.controller** | Trigger job từ endpoint   |
| **Migration**                       | Tạo bảng crawl_locations  |

---

## ✅ Đã Implement

- ✅ Crawl events từ PredictHQ API
- ✅ Lưu vào database (events + hotel_events)
- ✅ Tránh duplicate queries (7-day cache)
- ✅ Background job processing (Bull Queue)
- ✅ Distance calculation (Haversine formula)
- ✅ Error tracking (crawl_locations.status)
- ✅ Full documentation

**Sẵn sàng sử dụng! 🚀**
