# ⏱️ SESSION LIFETIME - SEARCH-COMPANIES-STREAM

## 📋 OVERVIEW

Khi chạy `POST /api/search-companies-stream`, session sẽ hoạt động trong **2 giai đoạn:**

| Giai Đoạn              | Trạng Thái    | Thời Gian         | Mô Tả                            |
| ---------------------- | ------------- | ----------------- | -------------------------------- |
| **1. Active Search**   | `RUNNING`     | 15-60s            | Tìm kiếm Google Places, lưu data |
| **2. Session Expires** | `TTL Expired` | **3600s (1 giờ)** | Session được xóa khỏi Redis      |

---

## 🔵 GIAI ĐOẠN 1: ACTIVE SEARCH (15-60s)

### Timeline Chi Tiết

```
T+0s: POST /api/search-companies-stream
   ├─ Tạo sessionId (unique ID)
   ├─ Lưu session vào Redis với TTL = 3600s (1 giờ)
   ├─ Status: RUNNING
   └─ Trả về: sessionId, hotelId

   ↓

T+0.1s: Background search bắt đầu (NON-BLOCKING)
   ├─ Khởi tạo GooglePlacesService
   ├─ Gọi: searchNearbyBusinessesWithCallback()
   ├─ Callback: onGridComplete()
   └─ Với mỗi grid:
      ├─ Tìm companies (1-2s per grid)
      ├─ Enrich details (2-3s per grid)
      └─ Lưu DB immediately (1-2s per grid)

   ↓

T+15-60s: Tất cả grids xong
   ├─ session.complete() được gọi
   ├─ Status: COMPLETED
   ├─ endTime được set
   └─ Info: "✅ SEARCH COMPLETED"

   ↓

T+15-60s: Session vẫn lưu trong Redis (TTL: 3600s)
   ├─ Status: COMPLETED
   ├─ startTime: <timestamp>
   ├─ endTime: <timestamp>
   ├─ duration: <milliseconds>
   └─ Data available cho GET requests
```

**Ví dụ:** Scenario tìm companies trong 50km

```
T+0s:    POST request → sessionId created
T+0.1s:  Background search started
T+5s:    Grid 1 processed (50 companies saved)
T+10s:   Grid 2 processed (45 companies saved)
T+15s:   Grid 3 processed (40 companies saved)
T+15.5s: searchNearbyBusinessesWithCallback() completed
T+15.5s: session.complete() → Status = COMPLETED
T+15.5s: Session vẫn available (expires at T+3615s)
```

---

## 🟢 GHI CHÚ QUAN TRỌNG

### 1. **Session TTL = 3600 giây (1 giờ)**

Dòng 46 trong [google-places-stream.routes.js](src/modules/google-places/google-places-stream.routes.js#L46):

```javascript
class SearchSession {
  async save() {
    const key = `search:${this.sessionId}`;
    await redis.setex(key, 3600, JSON.stringify(this)); // 🔴 3600 = 1 hour
  }
}
```

**Điều này có nghĩa:**

- Session được tạo lúc T+0s
- Session sẽ tồn tại trong Redis đến T+3600s (1 giờ sau)
- Sau 1 giờ → Session **TỰ ĐỘNG XÓA** khỏi Redis
- Nếu gọi GET sau 1 giờ → Error 404 "Session not found"

### 2. **Background Processing (Non-Blocking)**

Dòng 619-614 trong [google-places-stream.routes.js](src/modules/google-places/google-places-stream.routes.js#L619-L614):

```javascript
// 🔄 RUN SEARCH IN BACKGROUND (non-blocking)
// Don't await this - let it run independently
(async () => {
  try {
    // ... search logic
    session.complete(); // Dòng 726
  } catch (error) {
    session.fail(error.message);
  }
})(); // 🔴 Không await - response trả về ngay
```

**Điều này có nghĩa:**

- POST response trả lại NGAY (< 100ms)
- Search chạy **ẨN** trong background
- User không cần đợi search xong
- User poll GET `/search-session/:sessionId/status` để theo dõi progress

### 3. **Session Status Tracking**

Dòng 36-41:

```javascript
this.status = "RUNNING"; // Ban đầu
// ... khi xong:
this.status = "COMPLETED"; // Dòng 526 - khi success
this.status = "FAILED"; // Dòng 534 - khi error
```

### 4. **Khi nào Session được Mark Complete?**

**Dòng 726** - Khi `searchNearbyBusinessesWithCallback()` xong:

```javascript
// All grids processed
session.complete(); // Status = COMPLETED
await session.save(); // Lưu lại Redis
```

**Điều này xảy ra khi:**

- Tất cả grid points được xử lý
- Callback `onGridComplete` chạy cho tất cả grids
- Không có error

**Nếu có error:**

```javascript
catch (error) {
  session.fail(error.message); // Status = FAILED
  await session.save();
}
```

---

## ⏱️ TÓM TẮT THỜI GIAN

```
┌──────────────────────────────────────────────────────────────┐
│  SESSION LIFECYCLE - SEARCH-COMPANIES-STREAM                 │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  T+0s          T+15-60s            T+3600s                   │
│  │             │                   │                         │
│  ├─ Create  ─┬─ Complete      ─┬─ Expired                   │
│  │           │  (Status=DONE) │  (TTL expired)             │
│  │           │                │                             │
│  Status:    Status:          Status:                        │
│  RUNNING    COMPLETED        [DOES NOT EXIST]              │
│             (or FAILED)                                      │
│                                                               │
│  ← Active Search (1-60s) →← Session Available (1 hr) →      │
│                           (or until page refresh)            │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

---

## 📊 ACTUAL USAGE PATTERNS

### Pattern 1: User chạy search + Poll immediately

```
T+0s:    POST /api/search-companies-stream → sessionId="abc123"
T+1s:    GET /api/search-session/abc123/status → { status: "RUNNING", ... }
T+5s:    GET /api/search-session/abc123 → [] (chưa save xong)
T+15s:   GET /api/search-session/abc123 → [50 companies]
T+20s:   GET /api/search-session/abc123 → [120 companies]
T+25s:   GET /api/search-session/abc123/status → { status: "COMPLETED", duration: 25000 }

✅ Session vẫn available
```

### Pattern 2: User search rồi đi đâu, quay lại sau 1 giờ

```
T+0s:    POST /api/search-companies-stream → sessionId="abc123"
T+20s:   GET /api/search-session/abc123 → [150 companies saved]
         Session expires lúc: T+3620s

[ User đi chơi 2-3 giờ ]

T+10800s (3 giờ sau): GET /api/search-session/abc123
         ❌ Error 404: "Session not found"
         ❌ Lý do: "Session may have expired (TTL: 1 hour)"

[ Data KHÔNG MẤT - vẫn lưu trong DB ]
[ Nhưng session metadata bị xóa ]
```

### Pattern 3: Kiểm tra Session Expiry

```javascript
// GET /api/search-session/:sessionId/status
{
  success: true,
  status: "COMPLETED",
  startTime: 1711270800000,
  endTime: 1711270825000,
  duration: 25000,  // 25 seconds
  totalCompanies: 150,
  totalSaved: 148
}

// Sau 1 giờ (3600s):
{
  success: false,
  error: "Session not found",
  sessionId: "abc123"
}
```

---

## 🔴 REDIS TTL CONFIG - Nơi Control Session Lifetime

**File:** [google-places-stream.routes.js](src/modules/google-places/google-places-stream.routes.js#L46)

```javascript
async save() {
  const key = `search:${this.sessionId}`;
  await redis.setex(key, 3600, JSON.stringify(this));
  //                      ^^^^
  //                      TTL in seconds
}
```

**Để thay đổi session lifetime:**

```javascript
// ✅ Example 1: Tăng lên 6 giờ (21600 giây)
await redis.setex(key, 21600, JSON.stringify(this));

// ✅ Example 2: Giảm xuống 30 phút (1800 giây)
await redis.setex(key, 1800, JSON.stringify(this));

// ✅ Example 3: Để vĩnh viễn (không expire)
await redis.set(key, JSON.stringify(this)); // Không có TTL
```

---

## 📋 ENDPOINT REFERENCE

### 1. POST /api/search-companies-stream

```
Request:
  POST /api/search-companies-stream
  {
    "lat": 21.0285,
    "lng": 105.8537,
    "radius": 50,
    "keyword": "company"
  }

Response (ngay, không cần đợi search):
  {
    "success": true,
    "sessionId": "a1b2c3d4e5f6...",
    "hotelId": 123,
    "message": "Search started in background"
  }

Session Status: RUNNING
Session TTL: 3600s (starts now)
When expires: T + 1 hour = automatically deleted from Redis
```

### 2. GET /api/search-session/:sessionId/status

```
Request:
  GET /api/search-session/a1b2c3d4e5f6.../status

Response (nếu session còn hoạt động):
  {
    "success": true,
    "sessionId": "a1b2c3d4e5f6...",
    "status": "RUNNING" | "COMPLETED" | "FAILED",
    "startTime": 1711270800000,
    "endTime": 1711270825000,  // null nếu chưa complete
    "duration": 25000,  // ms
    "totalCompanies": 150,
    "totalSaved": 148
  }

Response (nếu session expired):
  {
    "success": false,
    "error": "Session not found",
    "sessionId": "a1b2c3d4e5f6..."
  }
```

### 3. GET /api/search-session/:sessionId

```
Request:
  GET /api/search-session/a1b2c3d4e5f6/?limit=50&offset=0

Response (companies từ session này):
  {
    "success": true,
    "companies": [
      { "name": "Company A", "lat": 21.02, "lng": 105.85, ... },
      { "name": "Company B", "lat": 21.03, "lng": 105.86, ... },
      // ... up to 50
    ],
    "total": 148,
    "limit": 50,
    "offset": 0,
    "session": {
      "status": "COMPLETED",
      "duration": 25000,
      "totalSaved": 148
    }
  }

Response (nếu session expired):
  {
    "success": false,
    "error": "Session not found",
    "tip": "Session may have expired (TTL: 1 hour)"
  }
```

---

## ⚙️ TECHNICAL DETAILS

### Search Duration Factors

| Factor            | Impact              | Min   | Max   |
| ----------------- | ------------------- | ----- | ----- |
| Grid points       | Number of API calls | 1     | 20+   |
| Keywords per grid | Keywords tested     | 3     | 17    |
| Pagination        | Pages per keyword   | 1     | 3     |
| Enrichment        | Details per company | 100ms | 200ms |
| DB Save           | Insert overhead     | 10ms  | 50ms  |

**Total search duration formula:**

```
Duration = (grids × keywords × pages × 300ms)  // API calls
         + (companies_found × 150ms)           // Enrichment
         + (companies_found × 20ms)            // DB save

Typical: 15-60s for 100km radius search
Worst case: 300s for very large area
```

### Session Data Structure

```javascript
{
  sessionId: "a1b2c3d4e5f6...",       // Unique session ID
  params: {                            // Search parameters
    lat: 21.0285,
    lng: 105.8537,
    radius: 50,
    gridRadius: 50,
    gridsNeeded: 1,
    keyword: "company"
  },
  status: "RUNNING|COMPLETED|FAILED",  // Current status
  startTime: 1711270800000,            // Timestamp when created
  endTime: 1711270825000,              // Timestamp when completed
  totalCompanies: 150,                 // Companies found from API
  totalQueued: 148,                    // Companies queued to save
  totalSaved: 148,                     // Companies successfully saved
  totalFailed: 0,                      // Companies failed to save
  error: null                          // Error message if FAILED
}
```

---

## 🚀 TROUBLESHOOTING

### Q1: Tôi search xong, sau 1 giờ không thấy session nữa?

**A:** Session TTL = 3600s (1 giờ), tự động expired. Nhưng **data vẫn lưu trong DB**.

```javascript
// Để lấy data sau khi session expired:
GET /api/companies-by-hotel/:hotel_id  // Query by hotel instead

// OR: Reset TTL khi access session
await redis.expire(`search:${sessionId}`, 3600);  // Renew TTL
```

### Q2: Làm sao biết search xong chưa?

**A:** Poll `/search-session/:sessionId/status`

```javascript
if (response.status === "COMPLETED") {
  console.log("Done! Duration:", response.duration, "ms");
}
```

### Q3: Có cách nào để session tồn tại lâu hơn?

**A:** Modify dòng 46 trong [google-places-stream.routes.js](src/modules/google-places/google-places-stream.routes.js#L46):

```javascript
// Current: 3600s (1 hour)
await redis.setex(key, 86400, JSON.stringify(this)); // 24 hours
```

### Q4: Session có giới hạn về số records không?

**A:** Không. Session chỉ lưu metadata. Companies được lưu trong DB (không có giới hạn).

---

## 💡 BEST PRACTICES

### ✅ DO

1. **Poll status để biết khi nào search xong**

   ```javascript
   const checkStatus = async (sessionId) => {
     const res = await fetch(`/api/search-session/${sessionId}/status`);
     const data = await res.json();
     return data.status; // "RUNNING", "COMPLETED", or "FAILED"
   };
   ```

2. **Lưu sessionId cho sau này**

   ```javascript
   localStorage.setItem("searchSessionId", sessionId);
   // ... later
   const sessionId = localStorage.getItem("searchSessionId");
   ```

3. **Handle session expired gracefully**
   ```javascript
   try {
     const res = await fetch(`/api/search-session/${sessionId}`);
     if (res.status === 404) {
       // Session expired, query by hotel instead
       const companies = await getCompaniesByHotel(hotelId);
     }
   } catch (err) { ... }
   ```

### ❌ DON'T

1. **Không chờ POST response synchronously**
   ❌ Bad: `const companies = await searchAndWait();`
   ✅ Good: `const sessionId = await search(); ... poll GET`

2. **Không assume session tồn tại lâu**
   ❌ Bad: Assuming session available 1 tuần sau
   ✅ Good: Check if expired, fallback to DB query

3. **Không spam GET requests**
   ❌ Bad: `setInterval(() => getStatus(), 100ms);`  
   ✅ Good: `setInterval(() => getStatus(), 2000ms);` (2s intervals)

---

## 📌 SUMMARY

| Khía Cạnh           | Chi Tiết                                        |
| ------------------- | ----------------------------------------------- |
| **Session Life**    | 3600 giây (1 giờ) từ khi tạo                    |
| **Data Life**       | Vĩnh viễn (trong DB)                            |
| **Search Duration** | 15-60 giây (tùy radius)                         |
| **When Complete**   | Khi `searchNearbyBusinessesWithCallback()` xong |
| **When Expired**    | Auto delete khỏi Redis sau 3600s                |
| **How to Check**    | GET `/api/search-session/:sessionId/status`     |
| **If Expired**      | Error 404 (nhưng data vẫn lưu trong DB)         |
