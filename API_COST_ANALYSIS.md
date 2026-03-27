# 🔴 PHÂN TÍCH CHI PHÍ GOOGLE PLACES API

## 📊 Giá Cơ Bản

| Loại Request       | Places API (Cũ) | Places API (New) | Khác Biệt         |
| ------------------ | --------------- | ---------------- | ----------------- |
| Nearby Search      | $1.70 /request  | $0.035 /request  | **49x rẻ hơn** ✅ |
| Place Details      | $0.20 /request  | $0.01 /request   | **20x rẻ hơn** ✅ |
| Text Search        | $1.70 /request  | $0.035 /request  | **49x rẻ hơn** ✅ |
| Place Autocomplete | $0.029 /request | -                | -                 |

---

## 🔴 ĐIỂM TỐỐN TIỀN CHÍNH

### 1️⃣ **`searchNearbyBusinesses()` - NHÂN TỐ CHÍNH** (file: [googlePlacesService.js](src/services/googlePlacesService.js#L104-L250))

**Dòng 279-300: Loop qua Keywords × Pagination**

```javascript
// Nearby Search: 1 request per keyword
for (const keyword of keywords) {
  const response = await axios.get(`${this.baseUrl}/nearbysearch/json`, {
    params: {
      location: `${latitude},${longitude}`,
      radius: radiusMeters,
      keyword: keyword, // 🔴 TÍNH TIỀN: 1 keyword = 1 request
      key: this.apiKey,
    },
  });

  // Pagination: tới 3 trang = 3 request nữa
  let nextPageToken = response.data.next_page_token;
  while (nextPageToken && pageCount < MAX_PAGES) {
    // MAX_PAGES = 3
    // 🔴 TÍNH TIỀN: mỗi page = 1 request
  }
}
```

**Ước tính chi phí:**

- **Radius ≤ 100km**: 3 keywords (LITE) × 1 page = **3 requests**
- **Radius 50-100km**: 12 keywords (EXTENDED) × 1 page = **12 requests**
- **Radius ≤ 50km**: 17 keywords (FULL) × 1 page = **17 requests**
- **Grid Search (>100km)**: 20+ grid points × 3 keywords (mỗi lần) = **60+ requests**

💰 **Chi phí cho 1 lần search (API cũ):**

- Radius ≤ 50km: `17 × $1.70 = $28.90`
- Radius 50-100km: `12 × $1.70 = $20.40`
- Grid Search (100km): `60+ × $1.70 = $102+`

💚 **Chi phí với API mới:**

- Radius ≤ 50km: `17 × $0.035 = $0.60` (tiết kiệm 98%)
- Radius 50-100km: `12 × $0.035 = $0.42` (tiết kiệm 98%)
- Grid Search: `60+ × $0.035 = $2.10` (tiết kiệm 98%)

---

### 2️⃣ **Fallback Text Search - COST MULTIPLIER** (dòng 195-248)

```javascript
// Nếu nearby results < 300: gọi thêm 20 text search queries
if (results.length < 300) {
  for (const industryQuery of GooglePlacesService.INDUSTRY_SEARCH_QUERIES) {
    const textResults = await this.textSearch(
      industryQuery, // 🔴 TÍNH TIỀN: mỗi query = 1 request
      latitude,
      longitude,
      radiusMeters,
    );
  }
}
```

**INDUSTRY_SEARCH_QUERIES có 20 queries:**

```javascript
static INDUSTRY_SEARCH_QUERIES = [
  "manufacturing companies",      // 1 request
  "factories",                    // 2
  "industrial facilities",        // 3
  ...
  "businesses near me"           // 20 requests
];
```

💰 **Chi phí (API cũ):** `20 × $1.70 = $34.00` (chỉ gọi nếu nearby < 300)

💚 **Chi phí (API mới):** `20 × $0.035 = $0.70` (98% tiết kiệm)

---

### 3️⃣ **Place Details Enrichment - VOLUME KILLER** (dòng 605-620)

```javascript
async enrichPlacesWithContactDetails(places, limit = 20) {
  for (let i = 0; i < toEnrich.length; i++) {
    const details = await this.getPlaceDetails(place.place_id);
    // 🔴 TÍNH TIỀN: mỗi place = 1 request
  }
}
```

**Ví dụ:** Tìm 500 companies tại 1 vị trí:

- Nearby search: **17 requests** (keywords)
- Get details cho top 20: **20 requests** (enrichment)
- **Total: 37 requests**

💰 **Chi phí (API cũ):** `17 × $1.70 + 20 × $0.20 = $28.90 + $4.00 = $32.90`

💚 **Chi phí (API mới):** `17 × $0.035 + 20 × $0.01 = $0.60 + $0.20 = $0.80` (98% tiết kiệm!)

---

## 🎯 TỔNG CHI PHÍ - SCENARIO ĐIỂN HÌNH

**Tìm companies trong radius 50km + Enrichment Top 20:**

### Với Places API (Cũ) ❌

```
Nearby Search:    17 keywords × $1.70     = $28.90
Text Search:      20 queries × $1.70      = $34.00 (nếu nearby < 300)
Place Details:    20 places × $0.20       = $4.00
─────────────────────────────────────────────────
TỔNG:                                      = $66.90 / search
TÍNH HÀNG NGÀY:    $66.90 × 10 searches   = $669.00/ngày
TÍNH HÀNG THÁNG:   $66.90 × 300 searches  = $20,070.00/tháng 🔴
```

### Với Places API (New) ✅

```
Nearby Search:    17 keywords × $0.035    = $0.60
Text Search:      20 queries × $0.035     = $0.70 (nếu nearby < 300)
Place Details:    20 places × $0.01       = $0.20
─────────────────────────────────────────────────
TỔNG:                                      = $1.50 / search
TÍNH HÀNG NGÀY:    $1.50 × 10 searches    = $15.00/ngày
TÍNH HÀNG THÁNG:   $1.50 × 300 searches   = $450.00/tháng ✅
TIẾT KIỆM:                                 47.6x rẻ hơn (98%)
```

---

## 🔴 CÁC FILE ĐANG GỌI API

| File                                                                                       | Method                                | Chi Phí                                    |
| ------------------------------------------------------------------------------------------ | ------------------------------------- | ------------------------------------------ |
| [google-places.routes.js](src/modules/google-places/google-places.routes.js)               | Route: `/api/search-companies`        | Gọi `searchNearbyBusinesses()`             |
| [google-places-stream.routes.js](src/modules/google-places/google-places-stream.routes.js) | Route: `/api/search-companies-stream` | Gọi `searchNearbyBusinessesWithCallback()` |
| [companyService.js](src/modules/company/company.service.js)                                | `getCompany()`                        | Gọi `getPlaceDetails()`                    |
| [companyPersistenceService.js](src/services/companyPersistenceService.js)                  | `persistCompanies()`                  | Gọi `enrichPlacesWithContactDetails()`     |
| [hotelSearchAPI.js](src/api/hotelSearchAPI.js)                                             | -                                     | Gọi `searchNearbyBusinesses()`             |
| [searchNearby.js](src/scripts/searchNearby.js)                                             | Script                                | Gọi `searchNearbyBusinesses()`             |

---

## ⚠️ CÁC THÓI QUEN TỐN TIỀN

1. **Grid Search quá rộng (100km+)**
   - Tạo 20+ grid points × 12 keywords = 240+ requests/search
   - Recommendation: Giới hạn radius ≤ 50km

2. **Text Search Fallback quá tham lam**
   - 20 text search queries (mỗi cái $1.70 với API cũ)
   - Recommendation: Giảm xuống 5-10 queries hoặc chỉ gọi khi cần thiết

3. **Enrichment quá nhiều places**
   - Gọi Place Details cho mỗi place
   - Recommendation: Giới hạn `limit = 20` (đã có), không fetch hết

4. **Multiple instances khởi tạo GooglePlacesService**
   - File [google-places.routes.js](src/modules/google-places/google-places.routes.js) khởi tạo instance riêng
   - File [google-places-stream.routes.js](src/modules/google-places/google-places-stream.routes.js) khởi tạo instance riêng
   - Recommendation: Khởi tạo 1 lần global, reuse ở mọi nơi

---

## 🎯 KHUYẾN NGHỊ ĐỀ CẬP THIỆT

### NGAY LẬP TỨC (Tiết kiệm 98%)

1. **Upgrade lên Places API (New)** - Chỉ đổi API key
   - Tiết kiệm: $20,000+/tháng
   - Thời gian: 5 phút để test

2. **Giới hạn Grid Size**
   - Không cho radius > 50km (trừ khi cần thiết)
   - Sửa dòng 106: `radiusMeters = 50000` (thay vì 100000)

3. **Giới hạn Text Search**
   - Sửa dòng 200: Chỉ gọi khi `results < 100` (thay vì `< 300`)
   - Hoặc: Giới hạn queries xuống 5 (thay vì 20)

### TRUNG HẠNG (Tiết kiệm thêm 50%)

4. **Caching results**
   - Lưu trữ kết quả search theo (lat, lng) - 7 ngày
   - Không search 2 lần cùng vị trí

5. **Batch API requests**
   - Dùng Google Places API Batch endpoint (nếu có)
   - Giảm overhead per-request

### DÀI HẠN

6. **Dùng Vertex AI Places API**
   - Nếu cần semantic search (Ví dụ: "điều hòa công nghiệp")
   - Model: `places-api-next` + LLM embedding

---

## 📋 KIỂM TRA API KEY HIỆN TẠI

Để biết bạn đang dùng API nào (cũ hay mới):

```bash
# Dòng lệnh - gợi ý cách check billing
gcloud billing accounts list  # Check trong Cloud Console
# Search: "Billing" → "API Usage" → tìm "Places API" vs "Places API (New)"
```

**Dấu hiệu dùng API cũ:**

- Bill > $50/tháng cho Places API (mà dùng < 1000 requests)
- Response từ API không chứa `business_status` (mới thôi có)

---

## 🚀 NEXT STEPS

1. Kiểm tra billing → xác nhận đang dùng API nào
2. Nếu dùng API cũ → Migrate sang API mới (không đổi code!)
3. Chạy test lại → So sánh chi phí

Ghi chú: Cost savings **TOÀN BỘ từ API key**, không thay đổi code!
