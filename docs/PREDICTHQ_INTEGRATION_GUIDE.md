# PredictHQ Events Crawling Integration Guide

## 📋 Tổng Quan

Hệ thống đã được cấu hình để **tự động crawl events từ PredictHQ API** khi bạn search companies theo vị trí.

### Quy Trình Hoạt Động

```
┌─────────────────────────────────────────────────────────────────┐
│ User gọi POST /api/search-companies-stream (lat, lng, radius)   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 1️⃣ Endpoint tạo HOTEL (nếu chưa tồn tại)                       │
│    - Lưu tọa độ vào bảng `hotels`                              │
│    - Return sessionId ngay cho client                            │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2️⃣ Background Job 1: Google Places Search                      │
│    - Crawl companies (via Google API)                           │
│    - Lưu vào bảng `hotels_companies`                           │
│    - Duration: từ 30s - 5 phút tùy radius                      │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3️⃣ Background Job 2: PredictHQ Events Crawl (Song song)        │
│    ├─ Check bảng `crawl_locations`                             │
│    │   ├─ Nếu location đã crawl trong 7 ngày → SKIP           │
│    │   └─ Nếu chưa crawl hoặc expired → CẬP NHẬT              │
│    ├─ Call PredictHQ API: /v1/events?within=8km@lat,lng       │
│    ├─ Transform data thành Event entity format                 │
│    ├─ Lưu vào bảng `events`                                    │
│    ├─ Tạo link vào bảng `hotel_events` (hotel ↔ event)       │
│    └─ Update bảng `crawl_locations` kết quả                    │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 🎉 Result: Hotel có danh sách Events gắn liền                  │
│    - GET /api/hotels/:id → trả về events từ `hotel_events`    │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔧 Setup

### 1. Environment Variables

```bash
# .env
PREDICTHQ_ACCESS_TOKEN=eER18uXbQwDDDIc7O23wzRnRPrTp5e-70w1P7JGO
REDIS_HOST=localhost
REDIS_PORT=6379
```

### 2. Database Migration

Run migration để tạo bảng `crawl_locations`:

```bash
npm run typeorm migration:run
# hoặc
yarn typeorm migration:run
```

Bảng này sẽ được tạo với columns:

| Column          | Type          | Mô Tả                               |
| --------------- | ------------- | ----------------------------------- |
| `id`            | UUID          | Primary Key                         |
| `lat`           | decimal(10,8) | Latitude                            |
| `lng`           | decimal(11,8) | Longitude                           |
| `radius_km`     | decimal(10,2) | Bán kính tìm kiếm (km)              |
| `source`        | varchar(100)  | Source (predicthq, eventbrite, etc) |
| `hotel_id`      | UUID          | Foreign key → hotels                |
| `location_name` | varchar(255)  | Tên địa điểm (tuỳ chọn)             |
| `events_found`  | integer       | Số events tìm được                  |
| `filters`       | jsonb         | Filters đã dùng                     |
| `last_crawl_at` | timestamp     | Lần cuối crawl                      |
| `crawl_count`   | integer       | Số lần đã crawl                     |
| `status`        | varchar(50)   | success/failed/partial              |
| `error_message` | text          | Lỗi nếu có                          |

### 3. Start Worker

Mở terminal khác chạy worker:

```bash
npm run worker:predicthq
# hoặc
node src/workers/index.js predicthq
```

Worker sẽ lắng nghe jobs từ queue `predicthq-events-crawl`.

---

## 📍 Cách Sử Dụng

### Step 1: Gọi endpoint search-companies-stream

```bash
curl --location 'http://localhost:3000/api/search-companies-stream' \
  --header 'Content-Type: application/json' \
  --data '{
    "lat": 41.0967548,
    "lng": -72.3955472,
    "radius_km": 10,
    "name": "My Hotel",
    "address": "123 Main St, Connecticut"
  }'
```

**Response:**

```json
{
  "success": true,
  "data": {
    "sessionId": "a1b2c3d4e5f6g7h8",
    "hotelId": "550e8400-e29b-41d4-a716-446655440000",
    "source": "NEW_SEARCH",
    "retrieval_method": "Use GET /api/search-session/:sessionId to fetch companies"
  },
  "message": "Search started in background...",
  "statusCode": 200
}
```

### Step 2: Theo dõi tiến trình

```bash
# Lấy danh sách companies đang được save
curl 'http://localhost:3000/api/search-session/a1b2c3d4e5f6g7h8'

# Lấy status
curl 'http://localhost:3000/api/search-session/a1b2c3d4e5f6g7h8/status'
```

### Step 3: Lấy events theo hotel

```bash
# Sau khi crawl xong, lấy events gắn với hotel
curl 'http://localhost:3000/api/hotels/550e8400-e29b-41d4-a716-446655440000'

# Response sẽ include:
# {
#   "id": "550e8400-e29b-41d4-a716-446655440000",
#   "name": "My Hotel",
#   "lat": 41.0967548,
#   "lng": -72.3955472,
#   "events": [
#     {
#       "id": "event-1",
#       "name": "Annual Conference 2026",
#       "start_date": "2026-07-08T16:00:00Z",
#       "location": "Ancestry Drive, Parker, CO 80134",
#       "distance_km": 2.5
#     },
#     ...
#   ]
# }
```

---

## 🎯 Cơ Chế Duplicate Prevention

### Bảng `crawl_locations` Có Unique Index

```sql
UNIQUE (lat, lng, radius_km, source)
```

**Ý nghĩa:**

- Nếu cùng vị trí (lat, lng) + cùng radius được crawl lại → Sẽ **UPDATE** record cũ (không tạo mới)
- Nếu chưa expire (< 7 ngày) → **SKIP** crawl (tránh gọi API lặp lại)

### Logic Check

```
IF crawl_location exists AND last_crawl_at < 7 days ago:
  ✅ SKIP - Không crawl lại
  ✅ Return message: "Location already crawled recently"
ELSE:
  🔄 CRAWL - Gọi PredictHQ API
  📊 UPDATE crawl_location record
```

### Ví dụ

**Crawl 1** - Lần đầu tiên:

```json
{
  "lat": 41.0967548,
  "lng": -72.3955472,
  "radius_km": 10
}
```

→ Database: Tạo record mới + crawl API
→ `last_crawl_at` = "2026-04-16 10:00:00"
→ `crawl_count` = 1

**Crawl 2** - Sau 2 giờ cùng location:

```json
{
  "lat": 41.0967548,
  "lng": -72.3955472,
  "radius_km": 10
}
```

→ Database: Record đã tồn tại + chưa expire (2 giờ < 7 ngày)
→ ⏭️ SKIP - không gọi API lại
→ Response: "Location already crawled recently"

**Crawl 3** - Sau 8 ngày:

```json
{
  "lat": 41.0967548,
  "lng": -72.3955472,
  "radius_km": 10
}
```

→ Database: Record expired (8 ngày > 7 ngày)
→ 🔄 CRAWL lại
→ Update: `last_crawl_at` = "2026-04-24 10:00:00"
→ `crawl_count` = 2

### Force Refresh (Bỏ qua cache)

Nếu muốn crawl lại dù mới crawl:

```bash
curl --location 'http://localhost:3000/api/search-companies-stream' \
  --header 'Content-Type: application/json' \
  --data '{
    "lat": 41.0967548,
    "lng": -72.3955472,
    "radius_km": 10,
    "forceRefresh": true
  }'
```

---

## 📊 PredictHQ API Request Format

### Endpoint gọi bên trong

```
GET https://api.predicthq.com/v1/events
  ?within=10km@41.0967548,-72.3955472
  &active.gte=2026-01-01
  &active.lte=2026-12-31
  &limit=500

Authorization: Bearer {PREDICTHQ_ACCESS_TOKEN}
```

### Response example

```json
{
  "count": 51,
  "overflow": false,
  "results": [
    {
      "id": "DspncLecTBMkh77pZ8",
      "title": "Colorado Native Plants Festival",
      "description": "Beauty that belongs here",
      "category": "festivals",
      "rank": 35,
      "phq_attendance": 173,
      "start": "2026-07-08T16:00:00Z",
      "start_local": "2026-07-08T10:00:00",
      "end": "2026-07-08T17:30:00Z",
      "end_local": "2026-07-08T11:30:00",
      "location": [-104.8251097, 39.5017066], // [lng, lat]
      "geo": {
        "address": {
          "formatted_address": "Ancestry Drive, Parker, CO 80134",
          "locality": "Parker",
          "region": "Colorado",
          "postcode": "80134",
          "country_code": "US"
        }
      }
    }
  ]
}
```

---

## 🗄️ Database Schema

### Events Table (`events`)

```sql
CREATE TABLE events (
  id UUID PRIMARY KEY,
  name VARCHAR(500),
  description TEXT,
  location VARCHAR(255),
  lat DECIMAL(10, 8),
  lng DECIMAL(11, 8),
  start_date TIMESTAMP,
  end_date TIMESTAMP,
  external_source VARCHAR(100),      -- "predicthq"
  external_id VARCHAR(255),           -- PredictHQ event ID
  status VARCHAR(50),                 -- "active", "cancelled", "completed"
  attendees_count INTEGER,
  raw_data JSONB,                     -- Original PredictHQ response
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

### Hotel Events Table (`hotel_events`)

```sql
CREATE TABLE hotel_events (
  id UUID PRIMARY KEY,
  hotel_id UUID FOREIGN KEY,
  event_id UUID FOREIGN KEY,
  relationship_type VARCHAR(100),    -- "nearby", "venue", "recommended"
  distance_km DECIMAL(8, 2),         -- Khoảng cách từ hotel tới event
  source_name VARCHAR(100),          -- "predicthq"
  confidence_score DECIMAL(5, 4),    -- 0.95 (95%)
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

### Crawl Locations Table (`crawl_locations`)

```sql
CREATE TABLE crawl_locations (
  id UUID PRIMARY KEY,
  lat DECIMAL(10, 8),
  lng DECIMAL(11, 8),
  radius_km DECIMAL(10, 2),
  source VARCHAR(100),              -- "predicthq"
  hotel_id UUID,
  location_name VARCHAR(255),
  events_found INTEGER,
  filters JSONB,
  last_crawl_at TIMESTAMP,
  crawl_count INTEGER,
  status VARCHAR(50),               -- "success", "failed", "partial"
  error_message TEXT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  UNIQUE (lat, lng, radius_km, source)
);
```

---

## 📁 File Structure

```
src/
├── database/
│   ├── entities/
│   │   └── crawl-location.entity.ts      ← Entity definition
│   ├── migrations/
│   │   └── 1774200000000-CreateCrawlLocationsTable.ts
│   └── repositories/
│       └── crawlLocationRepository.js     ← CRUD operations
├── services/
│   └── predictHqEventsService.js         ← Core logic (transform, save, track)
├── workers/
│   └── predicthq-events.worker.js        ← Background job processor
├── config/
│   └── queue.js                          ← Queue config
└── modules/
    └── google-places/
        └── controller/
            └── google-places-stream.controller.js  ← Modified to trigger job
```

---

## 🔍 Debugging

### Check Queue Status

```javascript
// Terminal REPL
import { predictHqEventsQueue } from "./src/config/queue.js";

// Số jobs waiting
const count = await predictHqEventsQueue.count();
console.log(count); // Số jobs chờ xử lý

// Lấy jobs active
const active = await predictHqEventsQueue.getActiveCount();
console.log(active);

// Lấy job details
const job = await predictHqEventsQueue.getJob(jobId);
console.log(job.data, job.progress(), job.state);
```

### View Crawl History

```bash
# Query database
SELECT * FROM crawl_locations
WHERE source = 'predicthq'
ORDER BY last_crawl_at DESC;

# Stats
SELECT
  source,
  COUNT(*) as total_locations,
  SUM(events_found) as total_events,
  AVG(events_found) as avg_events
FROM crawl_locations
GROUP BY source;
```

### View Logs

Worker logs được output vào console:

```
✅ PredictHQ Events Worker started...

🚀 Start PredictHQ crawl: 41.0967548, -72.3955472, radius=10km
🔍 Calling PredictHQ API: lat=41.0967548, lng=-72.3955472...
✅ PredictHQ returned 15 events
✅ Saved event: Annual Conference 2026
🔗 Created hotel-event link: distance=2.5km
📊 Crawl Summary:
   ✅ New events saved: 15
   ⏭️ Duplicates skipped: 0
   🔗 Hotel-event links: 15
```

---

## ⚠️ Common Issues

### 1. Jobs không xử lý

**Problem:** Queue jobs không được process

**Solution:**

- Kiểm tra Redis running: `redis-cli ping`
- Check worker process chạy chưa
- View queue logs

### 2. API Key invalid

**Problem:** `❌ PREDICTHQ_ACCESS_TOKEN not set`

**Solution:**

```bash
# .env
PREDICTHQ_ACCESS_TOKEN=your_actual_token_here

# Restart server
npm run dev
```

### 3. Location bị skip

**Problem:** Crawl location nhưng log show "skipped"

**Solution:**

- Normal - nó cached data. Để force refresh:

```bash
# Add forceRefresh: true
curl --location 'http://localhost:3000/api/search-companies-stream' \
  --header 'Content-Type: application/json' \
  --data '{
    "lat": 41.0967548,
    "lng": -72.3955472,
    "radius_km": 10,
    "forceRefresh": true
  }'
```

### 4. Events không lưu

**Problem:** API call thành công nhưng events không trong DB

**Solution:**

- Check PredictHQ response format (lng/lat order)
- Check `raw_data` trong events table
- Verify external_id được map đúng

---

## 🚀 Optimization Tips

### 1. Batch Multiple Locations

```javascript
const locations = [
  { lat: 41.09, lng: -72.39, radius_km: 10 },
  { lat: 40.75, lng: -74.0, radius_km: 5 },
  { lat: 34.05, lng: -118.24, radius_km: 15 },
];

for (const loc of locations) {
  await predictHqEventsQueue.add(loc);
}
```

### 2. Adjust Expiry Threshold

Default 7 ngày. Để thay đổi:

```javascript
// crawlLocationRepository.js
const existingCrawl = await CrawlLocationRepository.findByLocation(...);
if (existingCrawl && !existingCrawl.isExpired(30)) {  // 30 ngày
  // skip
}
```

### 3. Scale Worker

Chạy multiple workers để xử lý jobs nhanh hơn:

```bash
# Terminal 1
npm run worker:predicthq

# Terminal 2
npm run worker:predicthq

# Terminal 3
npm run worker:predicthq
```

---

## 📞 Summary

| Component      | File                                         | Mô Tả                       |
| -------------- | -------------------------------------------- | --------------------------- |
| **Entity**     | `crawl-location.entity.ts`                   | Track vị trí đã crawl       |
| **Repository** | `crawlLocationRepository.js`                 | CRUD + upsert logic         |
| **Service**    | `predictHqEventsService.js`                  | Call API + transform + save |
| **Worker**     | `predicthq-events.worker.js`                 | Process background jobs     |
| **Controller** | `google-places-stream.controller.js`         | Trigger job từ endpoint     |
| **Queue**      | `queue.js`                                   | Bull Queue config           |
| **Migration**  | `1774200000000-CreateCrawlLocationsTable.ts` | DB schema                   |

---

**Happy coding! 🚀**
