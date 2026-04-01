# Hotel API Response Standardization Guide

## Overview

All Hotel API responses now follow the standardized response format defined in `/src/shared/utils/response.js`.

---

## Response Formats

### 1. Single Resource Response

Used for: GET (single item), POST, PUT, DELETE

```json
{
  "statusCode": 200,
  "message": "Success message",
  "data": {
    // Resource object
  }
}
```

**Example - GET /api/hotels/:id**

```bash
GET http://localhost:3000/api/hotels/1
```

Response:

```json
{
  "statusCode": 200,
  "message": "Hotel retrieved successfully",
  "data": {
    "id": 1,
    "name": "Marriott Hotel",
    "address": "123 Main St",
    "coordinates": {
      "lat": 39.52,
      "lng": -104.77
    },
    "phone": "+1-303-555-0123",
    "email": "contact@marriott.com",
    "website": "https://marriott.com",
    "rating": 4.5,
    "reviews_count": 152,
    "room_count": 250,
    "status": "active",
    "created_at": "2025-01-01T00:00:00Z",
    "updated_at": "2025-01-15T10:30:00Z"
  }
}
```

---

### 2. Paginated List Response

Used for: GET list endpoints with pagination

```json
{
  "statusCode": 200,
  "message": "Success message",
  "data": {
    "items": [
      // Array of resources
    ],
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "total": 100,
      "totalPages": 5,
      "hasNextPage": true,
      "hasPreviousPage": false
    }
  }
}
```

**Example - GET /api/hotels?page=1&pageSize=20**

```bash
GET "http://localhost:3000/api/hotels?page=1&pageSize=20"
```

Response:

```json
{
  "statusCode": 200,
  "message": "Hotels retrieved successfully",
  "data": {
    "items": [
      {
        "id": 1,
        "name": "Marriott Hotel",
        "address": "123 Main St",
        "coordinates": {
          "lat": 39.52,
          "lng": -104.77
        },
        "phone": "+1-303-555-0123",
        "email": "contact@marriott.com",
        "website": "https://marriott.com",
        "rating": 4.5,
        "reviews_count": 152,
        "room_count": 250,
        "status": "active",
        "created_at": "2025-01-01T00:00:00Z",
        "updated_at": "2025-01-15T10:30:00Z"
      }
      // ... more hotels
    ],
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "total": 145,
      "totalPages": 8,
      "hasNextPage": true,
      "hasPreviousPage": false
    }
  }
}
```

---

### 3. Error Response (4xx)

Validation and request errors

```json
{
  "statusCode": 400,
  "message": "Error message",
  "details": {
    // Additional error context
  }
}
```

**Example - GET /api/hotels/nearby (missing parameters)**

```bash
GET "http://localhost:3000/api/hotels/nearby"
```

Response:

```json
{
  "statusCode": 400,
  "message": "Missing required parameters: lat, lng",
  "details": {
    "example": "/api/hotels/nearby?lat=39.52&lng=-104.77&radius=50&limit=20"
  }
}
```

---

## API Endpoints with New Response Formats

### List Hotels

```
GET /api/hotels?page=1&pageSize=20&name=&status=active&minRating=
```

Returns: **Paginated Response**

Query Parameters:

- `page` (default: 1) - Page number
- `pageSize` (default: 20, max: 100) - Items per page
- `name` - Filter by hotel name
- `status` - Filter by status (active/archived)
- `minRating` - Filter by minimum rating

---

### Get Single Hotel

```
GET /api/hotels/:id
```

Returns: **Single Resource Response**

---

### Get Hotel Details (with nearby companies and events)

```
GET /api/hotels/:id/details
```

Returns: **Single Resource Response**

```json
{
  "statusCode": 200,
  "message": "Hotel details retrieved successfully",
  "data": {
    "hotel": {
      /* HotelResponseDto */
    },
    "nearby_companies": [
      {
        "id": 1,
        "name": "TechCorp",
        "address": "456 Tech Ave",
        "distance_km": 2.5,
        "relationship_type": "partner"
      }
    ],
    "nearby_events": [
      {
        "id": 1,
        "name": "Tech Conference",
        "start_date": "2025-02-01",
        "distance_km": 1.5
      }
    ]
  }
}
```

---

### Create Hotel

```
POST /api/hotels
Content-Type: application/json

{
  "name": "New Hotel",
  "address": "789 Park Ave",
  "lat": 39.52,
  "lng": -104.77,
  "phone": "+1-555-0123",
  "email": "info@newhotel.com",
  "website": "https://newhotel.com",
  "rating": 4.0,
  "room_count": 150
}
```

Returns: **Single Resource Response** (Status 201)

---

### Update Hotel

```
PUT /api/hotels/:id
Content-Type: application/json

{
  "name": "Updated Hotel Name",
  "rating": 4.8
}
```

Returns: **Single Resource Response**

---

### Delete Hotel

```
DELETE /api/hotels/:id
```

Returns: **Single Resource Response**

```json
{
  "statusCode": 200,
  "message": "Hotel deleted successfully",
  "data": {
    "id": 1
  }
}
```

---

### Archive Hotel

```
POST /api/hotels/:id/archive
```

Returns: **Single Resource Response**

---

### Find Nearby Hotels

```
GET /api/hotels/nearby?lat=39.52&lng=-104.77&radius=50&limit=20
```

Returns: **Single Resource Response**

```json
{
  "statusCode": 200,
  "message": "Nearby hotels retrieved successfully",
  "data": {
    "items": [
      {
        /* HotelResponseDto */
      }
      // ... more hotels
    ],
    "location": {
      "lat": 39.52,
      "lng": -104.77
    },
    "radiusKm": 50,
    "totalFound": 8
  }
}
```

---

### Import Hotels

```
POST /api/hotels/import
Content-Type: application/json

{
  "hotels": [
    {
      "name": "Hotel 1",
      "address": "Address 1",
      "lat": 39.52,
      "lng": -104.77,
      "rating": 4.0
    },
    // ... more hotels
  ],
  "source_id": "source_123"
}
```

Returns: **Single Resource Response** (Status 201)

```json
{
  "statusCode": 201,
  "message": "5 hotels imported successfully",
  "data": {
    "count": 5,
    "imported": [
      {
        /* HotelResponseDto */
      }
      // ... more hotels
    ]
  }
}
```

---

## Key Changes Made

### ✅ Standardized Response Format

- All endpoints now return consistent structure
- Uses helper functions: `sendSuccess()`, `sendPaginatedSuccess()`, `sendValidationError()`, `sendNotFound()`

### ✅ Improved Pagination

- Standardized to `page` and `pageSize` parameters
- Removed confusing dual offset/limit + page/pageSize
- Added `hasNextPage` and `hasPreviousPage` flags

### ✅ Enhanced Error Handling

- Common error responses use standard format
- Better validation messages with examples
- Development mode shows detailed error context

### ✅ Better Data Validation

- DTOs now validate null/undefined values
- More robust error handling in constructors
- Default values for optional fields

---

## Testing

### Using cURL

**List Hotels (Page 1, 20 items per page)**

```bash
curl -X GET "http://localhost:3000/api/hotels?page=1&pageSize=20" \
  -H "Content-Type: application/json"
```

**Get Hotel Details**

```bash
curl -X GET "http://localhost:3000/api/hotels/1" \
  -H "Content-Type: application/json"
```

**Find Nearby Hotels**

```bash
curl -X GET "http://localhost:3000/api/hotels/nearby?lat=39.52&lng=-104.77&radius=50&limit=20" \
  -H "Content-Type: application/json"
```

**Create Hotel**

```bash
curl -X POST "http://localhost:3000/api/hotels" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Hotel",
    "address": "123 Test St",
    "lat": 39.52,
    "lng": -104.77,
    "rating": 4.0,
    "room_count": 100
  }'
```

---

## Migration Notes

If you have existing code consuming these APIs:

1. **Response Structure Changed**
   - Old: `{ success: true, data: [...], pagination: {...} }`
   - New: `{ statusCode: 200, message: "...", data: { items: [...], pagination: {...} } }`

2. **Pagination Changed**
   - Old: `pagination: { page, pageSize, totalPages, offset, limit, total, hasMore }`
   - New: `pagination: { page, pageSize, total, totalPages, hasNextPage, hasPreviousPage }`

3. **List Response Structure Changed**
   - Old: `data: [items...]`
   - New: `data: { items: [...], pagination: {...} }`

---

## Benefits

✅ **Consistency** - All API responses follow the same pattern
✅ **Predictability** - Clients know exactly what to expect
✅ **Error Handling** - Standardized error responses
✅ **Maintainability** - Easier to extend and modify
✅ **Documentation** - Clear response structure
