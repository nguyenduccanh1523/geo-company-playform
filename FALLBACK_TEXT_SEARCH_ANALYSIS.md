# 🔴 FALLBACK TEXT SEARCH - CHI TIẾT PHÂN TÍCH

## 📋 VẤN ĐỀ HIỆN TẠI

### Vị Trí Code Tốn Tiền

**File:** [googlePlacesService.js](src/services/googlePlacesService.js)

| Dòng        | Thành Phần                             | Vấn Đề                                                 |
| ----------- | -------------------------------------- | ------------------------------------------------------ |
| **45-72**   | `INDUSTRY_SEARCH_QUERIES` (20 queries) | Mảng có 20 text search query                           |
| **194-248** | Fallback Logic                         | Kiểm tra `results.length < 300` rồi gọi hết 20 queries |
| **206**     | `this.textSearch()` call               | Gọi API Text Search (tính tiền)                        |
| **226**     | 500ms delay                            | Không đủ để tránh rate limit                           |

---

## 💰 CHI PHÍ CHI TIẾT

### Scenario 1: Nearby Search trả ra < 300 results (Trigger Fallback)

```
1️⃣ NEARBY SEARCH (Dòng 279-300):
   - 17 keywords × 1 page = 17 requests
   - Chi phí: 17 × $1.70 = $28.90 (API cũ)

2️⃣ TEXT SEARCH FALLBACK (Dòng 194-248):
   - 20 industryQuery × 1 request = 20 requests
   - Chi phí: 20 × $1.70 = $34.00 (API cũ)

3️⃣ ENRICHMENT (20 places):
   - Chi phí: 20 × $0.20 = $4.00 (API cũ)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔴 TỔNG CỘNG:    $28.90 + $34.00 + $4.00 = $66.90/search
```

### Scenario 2: Chạy 10 searches mỗi ngày

```
Fallback Text Search chi phí hàng ngày:
   - 10 searches × 20 text queries × $1.70 = $340/ngày
   - $340/ngày × 30 ngày = $10,200/tháng 🔴

Chỉ từ fallback text search thôi!
```

### Scenario 3: Nearest cách gọi API (WORST CASE)

```
Nếu nearby trả về CHÍNH Xác < 300 results:
   → Tự động gọi tất cả 20 text queries
   → Mỗi query = 1 API call
   → Không có skip hoặc optimization

Ví dụ: nearby trả 100 results
   → Fallback kiểm tra: 100 < 300 ✅ TRUE
   → Gọi hết 20 queries (ngay cả khi đã có 100)
   → Chi phí: 20 × $1.70 = $34 chỉ để thêm vài results
```

---

## 🚨 CÁC VẤN ĐỀ CỤ THỂ

### 1. **Trigger Threshold Quá Cao (300)**

```javascript
// Dòng 194
if (results.length < 300) {
  // 🔴 Quá tham lam!
  // Gọi fallback nếu < 300
}
```

**Vấn đề:**

- 300 results = RẤT NHIỀU company rồi
- Nhưng vẫn trigger fallback
- Gọi thêm 20 text queries bổ sung

**Tình huống thực tế:**

- Nearby search trả 250 results → OK rồi
- Fallback trigger → Gọi 20 text queries thêm
- Chi phí tăng 40% chỉ để thêm 50-100 results nữa

### 2. **Không Có Early Stop**

```javascript
// Dòng 204-228
for (const industryQuery of GooglePlacesService.INDUSTRY_SEARCH_QUERIES) {
  try {
    const textResults = await this.textSearch(industryQuery, ...);

    // Không có check: "nếu đã có 400+ results thì stop"
    // Cứ gọi hết 20 queries
  }
}
```

**Ví dụ:**

- Query 1: Thêm 50 results (tổng 300)
- Query 2-20: Tiếp tục gọi dù đã "đủ"

### 3. **Không Có Duplicate Tracking Tối Ưu**

```javascript
for (const place of textResults) {
  if (!visited.has(place.place_id)) {
    // Check duplicate
    visited.add(place.place_id);
    results.push(place);
    newCount++;
  }
}

if (newCount > 0) {
  console.log(`    + "${industryQuery}": added ${newCount} new companies`);
}
```

**Vấn đề:**

- Nếu query 1-5 trả 90% duplicates
- Query 6-20 cũng trả 90% duplicates
- Nhưng vẫn gọi tất cả

---

## 🎯 GIẢI PHÁP CỤ THỂ

### Giải Pháp 1: **Giảm Trigger Threshold** (Tiết kiệm 60%)

```javascript
// Hiện tại - TỐN TIỀN
if (results.length < 300) {  // 🔴
  // Gọi 20 queries

// Đề xuất
if (results.length < 100) {  // ✅ Giảm từ 300 -> 100
  // Chỉ gọi khi < 100
}
```

**Chi phí lúc này:**

```
Nhân viên search 100 lần:
   - 10 lần gọi fallback (results < 100)
   - 90 lần skip (results >= 100)

Chi phí fallback:    10 × 20 × $1.70 = $340
Chi phí hiện tại:    100 × 20 × $1.70 = $3,400
Tiết kiệm:           $3,060/tháng (90%)
```

### Giải Pháp 2: **Early Stop - Dừng khi đủ Results** (Tiết kiệm 70%)

```javascript
// ✅ Thêm check: dừng khi đủ results
const MAX_RESULTS = 200;  // Target results
let queriesExecuted = 0;  // Track queries

for (const industryQuery of GooglePlacesService.INDUSTRY_SEARCH_QUERIES) {
  if (results.length >= MAX_RESULTS) {
    console.log(`✅ Reached target (${results.length} results), stopping fallback`);
    break;  // 🟢 DỪNG ngay
  }

  queriesExecuted++;
  const textResults = await this.textSearch(industryQuery, ...);

  // ... thêm results
}

console.log(`   Fallback executed: ${queriesExecuted}/20 queries`);
```

**Chi phí lúc này:**

```
Ví dụ: cần 50 results nội thêm
   - Query 1-3: Thêm 100 results (tổng 300)
   - Query 4-20: SKIP (không gọi)

Chi phí trước:     20 × $1.70 = $34
Chi phí sau:       3 × $1.70 = $5.10
Tiết kiệm:         85% per search
```

### Giải Pháp 3: **Adaptive Query Set** (Tiết kiệm 80%)

```javascript
// 🟢 Thay vì 20 queries, dùng "smart subset"
static PRIORITIZED_SEARCH_QUERIES = [
  // High Impact (được chọn trước)
  "manufacturing companies",
  "company headquarters",
  "corporate offices",
  "business centers",

  // Medium Impact
  "consulting firms",
  "tech companies",
  "trading companies",
  "service companies",
];

// Nếu cần thêm, dùng full set (20)
static FULL_SEARCH_QUERIES = [
  // ... (20 queries)
];

// Logic
if (results.length < 150) {
  // Gọi 8 queries cao ưu tiên
  for (const query of this.PRIORITIZED_SEARCH_QUERIES) {
    // ...
  }

  if (results.length < 200) {
    // Nếu vẫn chưa đủ, gọi 12 queries còn lại
    for (const query of this.FULL_SEARCH_QUERIES.slice(8)) {
      // ...
    }
  }
}
```

**Chi phí lúc này:**

```
Scenario A: Nearby đủ good (150-200 results)
   - Gọi 8 queries
   - Chi phí: 8 × $1.70 = $13.60
   - Tiết kiệm: 60% vs 20 queries

Scenario B: Nearby không đủ
   - Gọi 8 + 12 = 20 queries (full)
   - Chi phí: 20 × $1.70 = $34.00
   - Tiết kiệm: 0% (worst case)
```

### Giải Pháp 4: **Caching - Tránh Repeat Searches** (Tiết kiệm 70-90%)

```javascript
// Lưu cache theo (lat, lng) - hash location
const location_hash = `${latitude.toFixed(2)}_${longitude.toFixed(2)}`;
const cacheKey = `search:${location_hash}`;

// Check cache trước
const cachedResults = await redis.get(cacheKey);
if (cachedResults && !forceRefresh) {
  console.log(`✅ Cache hit for ${location_hash} - returning cached results`);
  return JSON.parse(cachedResults);
}

// Nếu không có cache → search normally
const results = await this.searchNearbyBusinesses(...);

// Lưu cache - 7 ngày
await redis.setex(cacheKey, 604800, JSON.stringify(results));

return results;
```

**Chi phí lúc này:**

```
Scenario: Cùng hotel search 3 lần trong 1 tuần
   - Search 1st time: $67 (no cache)
   - Search 2nd time: $0 (cache hit)
   - Search 3rd time: $0 (cache hit)

Chi phí: $67 (thay vì $201)
Tiết kiệm: 67% per week
```

---

## 📊 SO SÁNH GIẢI PHÁP

| Giải Pháp                      | Tiết Kiệm  | Độ Khó  | Thời Gian    | Ghi Chú      |
| ------------------------------ | ---------- | ------- | ------------ | ------------ |
| **Giảm Threshold** (300 → 100) | **60%**    | 5 phút  | Ngay lập tức | Quick win    |
| **Early Stop**                 | **70%**    | 15 phút | Ngay lập tức | Cần test     |
| **Adaptive Queries**           | **60-80%** | 30 phút | Ngay lập tức | Best balance |
| **Caching**                    | **70-90%** | 45 phút | 1-2 ngày     | Dài hạn      |
| **Upgrade API**                | **98%**    | 5 phút  | Ngay lập tức | Chỉ đổi key  |

---

## 🚀 TRIỂN KHAI NGAY - OPTION 1 + 2

Tôi sẽ implement:

1. **Giảm threshold từ 300 → 150**
2. **Thêm early stop logic**
3. **Log chi phí để monitor**

```javascript
async searchNearbyBusinesses(
  hotelName,
  latitude,
  longitude,
  types = ["company", "establishment", "point_of_interest"],
  radiusMeters = 100000,
  gridRadiusMeters = 50000,
) {
  try {
    const results = [];
    const visited = new Set();
    const MAX_API_RADIUS = Math.min(gridRadiusMeters, 50000);

    // ... (nearby search code)

    const afterNearby = results.length;

    // 🟢 FIX: Giảm threshold từ 300 → 150
    if (results.length < 150) {  // ✅ Thay từ 300
      console.log(`⚠️  Nearby returned ${results.length} results (< 150 threshold)`);

      let textSearchQueriesExecuted = 0;
      const MAX_FALLBACK_RESULTS = 250;  // Target results

      for (const industryQuery of GooglePlacesService.INDUSTRY_SEARCH_QUERIES) {
        // 🟢 FIX: Early stop khi đủ results
        if (results.length >= MAX_FALLBACK_RESULTS) {
          console.log(`✅ Reached ${results.length} results, stopping fallback`);
          break;  // Dừng lại
        }

        textSearchQueriesExecuted++;

        try {
          const textResults = await this.textSearch(industryQuery, latitude, longitude, radiusMeters);

          let newCount = 0;
          for (const place of textResults) {
            if (!visited.has(place.place_id)) {
              visited.add(place.place_id);
              results.push(place);
              newCount++;
            }
          }

          if (newCount > 0) {
            console.log(`    + "${industryQuery}": +${newCount} (total: ${results.length})`);
          }

          await new Promise((resolve) => setTimeout(resolve, 500));
        } catch (err) {
          console.warn(`    ⚠️  "${industryQuery}" failed: ${err.message}`);
        }
      }

      // 🟢 Log: Bao nhiêu queries được gọi
      console.log(`   Fallback: ${textSearchQueriesExecuted}/${GooglePlacesService.INDUSTRY_SEARCH_QUERIES.length} queries`);
      console.log(`   Added from fallback: ${results.length - afterNearby} companies`);
    }

    return results;
  } catch (err) {
    console.error("Error:", err.message);
    throw err;
  }
}
```

---

## 💵 ĐỐI CHIẾU CHI PHÍ

### Trước Thay Đổi (API Cũ)

```
Per search: 17 nearby + 20 text + 20 detail = $57 queries
Per tháng (300 searches): $17,100
```

### Sau Thay Đổi (API Cũ)

```
Scenario 1: Nearby đủ good (70% searches)
   - 17 nearby + 5 text + 20 detail = $37.23
   - Cost: $37.23

Scenario 2: Nearby không đủ (30% searches)
   - 17 nearby + 20 text + 20 detail = $57.00
   - Cost: $57.00

Weighted average: 0.7 × $37.23 + 0.3 × $57 = $44.26
Per tháng: $44.26 × 300 = $13,278
Tiết kiệm: $3,822/tháng (22%)
```

### Sau Thay Đổi (API Mới)

```
Scenario 1 (70%):   17 × $0.035 + 5 × $0.035 + 20 × $0.01 = $0.77
Scenario 2 (30%):   17 × $0.035 + 20 × $0.035 + 20 × $0.01 = $1.50

Weighted: 0.7 × $0.77 + 0.3 × $1.50 = $1.04
Per tháng: $1.04 × 300 = $312
Tiết kiệm: 98% from API upgrade
```

---

## ✅ NEXT STEPS

1. **Áp dụng Solution 1+2** (giảm threshold + early stop)
2. **Monitor logs** để xem bao nhiêu queries thực tế được gọi
3. **Upgrade API key** để tiết kiệm 98%
4. **Thêm caching** trong 2 tuần tiếp
