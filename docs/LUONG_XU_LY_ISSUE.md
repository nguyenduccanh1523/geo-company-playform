# 🔴 ISSUE ANALYSIS: Distance 50km vs Search Radius 5km

## TÓM TẮT VẤN ĐỀ

**User phát hiện:**

- Hotels table: `name = "Search Location - 5km"` ✅ (đúng)
- hotel_companies table: `distance_km` lên tới 50km, 38km, 15km ❌ (sai)

**Kỳ vọng:** Tất cả companies phải ≤ 5km
**Thực tế:** Companies ở xa tới 50km cũng được lưu

---

## 🔴 ROOT CAUSES

### Cause #1: gridRadiusMeters = 50000 (50km)

**Vị trí:** `src/modules/google-places/google-places-stream.routes.js` - Line 407

```javascript
const companies = await googlePlaces.searchNearbyBusinesses(
  keyword || "company",
  lat,
  lng,
  ["company", "establishment", "point_of_interest"],
  radius * 1000, // ✅ radiusMeters = 5000m (5km) - chính xác
  50000, // ❌ gridRadiusMeters = 50000m (50km) - PROBLEM!
);
```

**Giải thích:**

- `radiusMeters` = 5000 → search tối ưu 5km
- `gridRadiusMeters` = 50000 → Google API chia search area thành 50km grids
- **Kết quả:** searchNearbyBusinesses trả về companies ở khắp 50km, KHÔNG chỉ 5km

**Trong googlePlacesService.js:**

```javascript
async searchNearbyBusinesses(
  hotelName,
  latitude,
  longitude,
  types,
  radiusMeters = 100000,       // User's search limit
  gridRadiusMeters = 50000,    // Google optimization grid size
)
```

gridRadiusMeters là size của grid tối ưu hóa, để chia search area thành nhiều điểm query.
**Nó không phải là boundary filter** - Google API vẫn returns companies ở xa.

---

### Cause #2: Không có Distance Filter ở saveSingleCompanyToDB()

**Vị trí:** `src/modules/google-places/google-places-stream.routes.js` - Line 475-500

```javascript
async function saveSingleCompanyToDB(company, lat, lng, searchRadius) {
  try {
    // Validate required fields
    if (
      !company.name ||
      !company.address ||
      company.lat === undefined ||
      company.lng === undefined
    ) {
      logger.warn(`⚠️  Skip ${company.name}: missing lat/lng/address`);
      return { success: false };
    }

    // ❌ NO DISTANCE CHECK!
    // Save luôn company này dù có thể ở xa searchRadius

    // ... insert to DB ...
```

**Thiếu logic:**

```javascript
// ❌ MISSING: Distance validation
const distance = calculateDistance(lat, lng, company.lat, company.lng);
if (distance > searchRadius) {
  logger.warn(`⚠️  Skip ${company.name}: ${distance}km > ${searchRadius}km`);
  return { success: false };
}
```

---

### Cause #3: Google Places API Behavior

**Hành vi Google Places API:**

1. Request: `searchNearby(lat, lng, radius=5000m, gridRadius=50000m)`
2. Google response: "I'll search with 50km grids"
3. **Kết quả:** Returns ALL companies trong area, including those > 5km away

**Ví dụ:**

```
Gửi request: lat=39.51, lng=-104.77, radius=5000m
Google searches: 50km x 50km grid area
Trả về: 557 companies ở khoảng cách:
  - 0.82km ✅
  - 8.23km ❌ (> 5km)
  - 50.33km ❌ (> 5km)
  - 15.92km ❌ (> 5km)
```

---

## 🏗️ LUỒNG XỬ LÝ HIỆN TẠI (CÓ VẤN ĐỀ)

### Step 1: User gửi request

```javascript
POST /api/search-companies-stream
{
  "lat": 39.5193,
  "lng": -104.77,
  "radius": 5,           // ← User muốn 5km
  "keyword": "company"
}
```

### Step 2: Google Places Search (⚠️ PROBLEM AREA)

```javascript
// google-places-stream.routes.js - Line 407
const companies = await googlePlaces.searchNearbyBusinesses(
  keyword,
  lat,
  lng,
  types,
  radius * 1000, // = 5000m (5km) - OK
  50000, // = 50km grid!! - WRONG USE
);

// Result: 557 companies (nhiều cái > 5km)
```

**Flow searchNearbyBusinesses:**

```
Input: lat=39.51, lng=-104.77, radius=5000m, gridRadius=50000m

1️⃣ Check if radius <= gridRadius?
   5000 <= 50000? YES

2️⃣ Call _searchNearbyInRadius() trực tiếp

3️⃣ Google API returns companies in ~50km area

4️⃣ Return: ALL 557 companies (regardless of distance)
```

**Code source googlePlacesService.js ~Line 115-140:**

```javascript
// Nếu radius <= MAX_API_RADIUS: tìm kiếm trực tiếp
if (radiusMeters <= MAX_API_RADIUS) {
  console.log(`📍 Direct search with radius: ${radiusMeters}m`);
  await this._searchNearbyInRadius(
    hotelName,
    latitude,
    longitude,
    radiusMeters, // ← Send 5000m
    results,
    visited,
    selectedKeywords,
  );
}
// Kết quả: returns companies ở 50km away!
```

### Step 3: Batch Processing (❌ No Filter)

```javascript
// google-places-stream.routes.js - Line 430-500
for (let i = 0; i < companies.length; i += batchSize) {
  const batch = companies.slice(i, Math.min(i + batchSize, companies.length));

  // Process each company
  const enrichAndSavePromises = batch.map(async (company) => {
    try {
      const details = await googlePlaces.getPlaceDetails(company.place_id);
      const enrichedCompany = {
        name: company.name,
        lat: details?.lat,
        lng: details?.lng,
        address: details?.formatted_address,
        // ... other fields ...
      };

      // ❌ MISSING: Distance check here!
      // Tất cả companies được save, dù khoảng cách > 5km
      return await saveSingleCompanyToDB(
        enrichedCompany,
        lat,              // Hotel lat
        lng,              // Hotel lng
        searchRadius      // = 5 (chỉ dùng cho hotel name)
      );
    }
  });
}
```

### Step 4: Save to Database (❌ No Validation)

```javascript
async function saveSingleCompanyToDB(company, lat, lng, searchRadius) {
  try {
    // Check required fields
    if (!company.name || !company.address ||
        company.lat === undefined || company.lng === undefined) {
      return { success: false };
    }

    // ❌ MISSING:
    // const distance = calculateDistance(lat, lng, company.lat, company.lng);
    // if (distance > searchRadius) return { success: false };

    // ... insert company to DB ...

    // Create hotel relationship
    await createHotelRelationship(companyId, company, lat, lng, searchRadius);
  }
}
```

### Step 5: Hotel Relationship (❌ Name sai vs Distance thực)

```javascript
async function createHotelRelationship(
  companyId, company, lat, lng, searchRadius
) {
  // Create hotel with HARDCODED searchRadius
  const insertHotelQuery = `
    INSERT INTO hotels (name, ...)
    VALUES ($1, ...) `;

  // Hotel name = "Search Location - 5km" ← searchRadius
  const hotelResult = await query(insertHotelQuery, [
    `Search Location - ${searchRadius}km`,  // = "Search Location - 5km"
    ...
  ]);

  // Calculate ACTUAL distance
  const distance = calculateDistance(lat, lng, company.lat, company.lng);
  // = 50.33km (for companies found in 50km grid)

  // Save to hotel_companies
  // Result: distance_km = 50.33km (mâu thuẫn với hotel name!)
  const relInsertQuery = `
    INSERT INTO hotel_companies (distance_km, ...)
    VALUES ($1, ...) `;

  await query(relInsertQuery, [hotelId, companyId, distance]);
  // ❌ MISMATCH: Hotel name says "5km" nhưng distance = 50km
}
```

---

## 🔴 MÂUU THUẪN CHÍNH

| Yếu tố           | Giá trị                 | Nguồn                        |
| ---------------- | ----------------------- | ---------------------------- |
| **Hotel Name**   | "Search Location - 5km" | searchRadius parameter       |
| **Max Distance** | 50.33km                 | Google API grid search       |
| **Kỳ vọng**      | ≤ 5km                   | User's radius parameter      |
| **Thực tế**      | Lên tới 50km            | Google API returns khắp grid |

**Quy trình:**

```
User: "Find companies in 5km radius"
     ↓
API: "Search in 50km grid for optimization"
     ↓
Google: "Here's 557 companies in 50km"
     ↓
DB: "Save all 557, calc distance = up to 50km"
     ↓
Result: Hotel name "5km" ❌ | Actual distance 50km ✅ | Mismatch ❌
```

---

## ✅ SOLUTIONS

### Solution 1: Filter by Distance (CLIENT-SIDE) ⭐ RECOMMENDED

**Thêm vào endpoint GET /companies-by-hotel:**

```sql
SELECT c.*, hc.distance_km
FROM companies c
INNER JOIN hotel_companies hc ON c.id = hc.company_id
WHERE hc.hotel_id = $1
  AND hc.distance_km <= 5  -- ← Filter by radius
ORDER BY hc.distance_km ASC
LIMIT 50;
```

**Advantages:**

- User can filter by any radius at query time
- No need to re-search with different radius
- Flexible for future changes

---

### Solution 2: Filter by Distance (ON SAVE) ⭐ FIX ROOT CAUSE

**Modify saveSingleCompanyToDB():**

```javascript
async function saveSingleCompanyToDB(company, lat, lng, searchRadius) {
  try {
    // Validate required fields
    if (
      !company.name ||
      !company.address ||
      company.lat === undefined ||
      company.lng === undefined
    ) {
      logger.warn(`⚠️  Skip ${company.name}: missing lat/lng/address`);
      return { success: false };
    }

    // ✅ NEW: Calculate distance
    const distance = calculateDistance(lat, lng, company.lat, company.lng);

    // ✅ NEW: Filter by radius
    if (distance > searchRadius) {
      logger.warn(
        `⚠️  Skip ${company.name}: ${distance.toFixed(2)}km > ${searchRadius}km`
      );
      return { success: false, error: "OUT_OF_RADIUS" };
    }

    // Continue with insert...
  }
}
```

**Advantages:**

- Prevents storage of out-of-radius companies
- Reduces DB bloat
- Cleaner data

---

### Solution 3: Fix gridRadiusMeters Parameter

**Current (⚠️ WRONG):**

```javascript
const companies = await googlePlaces.searchNearbyBusinesses(
  keyword,
  lat,
  lng,
  types,
  radius * 1000, // 5000m
  50000, // ❌ WRONG: This tells Google to use 50km grid
);
```

**Better (✅ CORRECT):**

```javascript
const companies = await googlePlaces.searchNearbyBusinesses(
  keyword,
  lat,
  lng,
  types,
  radius * 1000, // 5000m - What we want
  radius * 1000, // ✅ Same as radiusMeters (no larger grid)
);
```

**Or use calculated value:**

```javascript
const radiusMeters = radius * 1000; // 5000m
const gridRadiusMeters = Math.max(radiusMeters, 5000); // Min 5km

const companies = await googlePlaces.searchNearbyBusinesses(
  keyword,
  lat,
  lng,
  types,
  radiusMeters, // 5000m
  gridRadiusMeters, // 5000m (match radiusMeters)
);
```

---

## 🎯 RECOMMENDED FIX ORDER

### Priority 1️⃣ (Quick Fix - Immediate)

✅ Filter by distance in saveSingleCompanyToDB()

- 5-10 lines of code
- Prevents future bad data
- Takes ~5 minutes

### Priority 2️⃣ (Query Optimization)

✅ Add distance filter in GET /companies-by-hotel endpoint

- SQL GROUP BY with distance <= radius
- Provides flexible filtering
- Takes ~10 minutes

### Priority 3️⃣ (Root Cause)

✅ Fix gridRadiusMeters = radiusMeters

- Optional, since Priority 1 handles it
- Makes code clearer
- Takes ~5 minutes

---

## 📋 EXAMPLE DATA FLOW (AFTER FIX)

```
POST /api/search-companies-stream
{
  "lat": 39.51,
  "lng": -104.77,
  "radius": 5
}

↓

Google search returns 557 companies (some 50km away)

↓

For each company:
  distance = calculateDistance(39.51, -104.77, company.lat, company.lng)
  if distance > 5km:
    ❌ SKIP (not saved to DB)  ← NEW FILTER
  else:
    ✅ SAVE (distance <= 5km)

↓

Result:
  - Only ~50-100 companies ≤ 5km saved
  - Hotel name: "Search Location - 5km" ✅
  - All distances: ≤ 5km ✅
  - Mismatch: RESOLVED ✅
```

---

## 🔍 VERIFICATION

**After implementing fix, run:**

```sql
-- Check max distance by hotel
SELECT
  h.id,
  h.name,
  COUNT(hc.id) as company_count,
  MAX(hc.distance_km) as max_distance,
  MIN(hc.distance_km) as min_distance,
  AVG(hc.distance_km) as avg_distance
FROM hotels h
LEFT JOIN hotel_companies hc ON h.id = hc.hotel_id
WHERE h.name LIKE 'Search Location%'
GROUP BY h.id, h.name;

-- Expected result:
-- name: "Search Location - 5km"
-- max_distance: should be ≤ 5.0 (not 50+)
```
