# Database Schema - Geo Company Platform

Tài liệu tổng hợp tất cả 19 bảng trong hệ thống quản lý công ty địa lý kết nối với sự kiện, khách sạn và nhân sự.

**Ngày cập nhật**: 30/03/2026

---

## 📊 Tóm Tắt Cấu Trúc

### Phân Nhóm Bảng

| Nhóm             | Số Lượng | Bảng                                                           |
| ---------------- | -------- | -------------------------------------------------------------- |
| **Core**         | 4        | companies, events, people, hotels                              |
| **Crawl**        | 2        | crawl_batches, crawl_items                                     |
| **Source**       | 2        | company_sources, event_sources                                 |
| **Relationship** | 4        | company_people, company_events, hotel_companies, hotel_events  |
| **Vector**       | 4        | vector_batches, company_vectors, event_vectors, person_vectors |
| **Audit**        | 3        | dedup_logs, change_logs, data_quality_reports                  |
| **TOTAL**        | **19**   | -                                                              |

---

## 🏢 BỐI CẢNH KINH DOANH

- **Khách sạn** là điểm gốc (root entity)
- Mỗi khách sạn có thể mở rộng tìm kiếm các **công ty lân cận** trong bán kính nhất định
- **Sự kiện** được liên kết với khách sạn và công ty để hiểu xã hội học
- **Người** được liên kết với công ty thông qua các vị trí/tổ chức
- Các **vector/embedding** được sử dụng để tìm kiếm ngữ nghĩa và khớp dữ liệu

---

## 📑 CHI TIẾT CÁC BẢNG

### 🏛️ NHÓM CORE (4 Bảng)

---

#### 1️⃣ **companies** (Công Ty)

**Bảng gốc cho tất cả các công ty/địa điểm kinh doanh**

| Trường            | Kiểu          | Constraints           | Mô Tả                               |
| ----------------- | ------------- | --------------------- | ----------------------------------- |
| `id`              | UUID          | PK                    | Mã định danh duy nhất               |
| `name`            | VARCHAR(255)  | NOT NULL              | Tên công ty                         |
| `normalized_name` | VARCHAR(255)  | NULLABLE              | Tên chuẩn hóa (từ khóa tìm kiếm)    |
| `place_id`        | VARCHAR(255)  | UNIQUE (khi NOT NULL) | Google Places ID                    |
| `industry`        | VARCHAR(100)  | NULLABLE              | Ngành công nghiệp                   |
| `address`         | TEXT          | NOT NULL              | Địa chỉ đầy đủ                      |
| `lat`             | DECIMAL(10,8) | NOT NULL              | Vĩ độ                               |
| `lng`             | DECIMAL(11,8) | NOT NULL              | Kinh độ                             |
| `website`         | VARCHAR(255)  | NULLABLE              | Website                             |
| `email`           | VARCHAR(255)  | NULLABLE              | Email công ty                       |
| `phone`           | VARCHAR(20)   | NULLABLE              | Số điện thoại                       |
| `google_url`      | VARCHAR(500)  | NULLABLE              | URL trên Google Maps                |
| `rating`          | DECIMAL(3,2)  | NULLABLE              | Đánh giá (0-5)                      |
| `reviews_count`   | INTEGER       | DEFAULT 0             | Số bình luận                        |
| `business_status` | VARCHAR(100)  | NULLABLE              | Trạng thái (OPERATIONAL, CLOSED...) |
| `description`     | TEXT          | NULLABLE              | Mô tả từ Google Places              |
| `source_id`       | VARCHAR(50)   | NULLABLE              | ID từ nguồn                         |
| `external_id`     | VARCHAR(255)  | NULLABLE              | ID bên ngoài                        |
| `status`          | VARCHAR(50)   | DEFAULT 'active'      | Trạng thái hệ thống                 |
| `merged_into_id`  | UUID          | NULLABLE, FK          | Nếu merged, trỏ tới company chính   |
| `raw_data`        | JSONB         | NULLABLE              | Dữ liệu thô từ nguồn                |
| `created_at`      | TIMESTAMP     | AUTO                  | Ngày tạo                            |
| `updated_at`      | TIMESTAMP     | AUTO                  | Ngày cập nhật                       |

**Indexes**:

- `place_id` (UNIQUE, WHERE place_id IS NOT NULL)
- `(external_id, source_id)`
- `status`

**Deduplication Strategy**:

- Primary: `place_id` UNIQUE constraint
- Fallback: `hotel_company` relationship UNIQUE(hotel_id, company_id)

**Relationships**:

- ⬌ `events` (N:M qua company_events)
- ⬌ `people` (N:M qua company_people)
- ⬌ `hotels` (N:M qua hotel_companies)
- ↔ `company_sources` (1:M)
- ↔ `company_vectors` (1:M)

---

#### 2️⃣ **events** (Sự Kiện)

**Bảng lưu các sự kiện (hội thảo, sự kiện, triển lãm...)**

| Trường                | Kiểu          | Constraints      | Mô Tả                                     |
| --------------------- | ------------- | ---------------- | ----------------------------------------- |
| `id`                  | UUID          | PK               | Mã định danh duy nhất                     |
| `name`                | VARCHAR(500)  | NOT NULL         | Tên sự kiện                               |
| `normalized_name`     | VARCHAR(500)  | NULLABLE         | Tên chuẩn hóa                             |
| `description`         | TEXT          | NULLABLE         | Mô tả chi tiết                            |
| `event_type`          | VARCHAR(100)  | NULLABLE         | Loại sự kiện                              |
| `organizer`           | VARCHAR(255)  | NULLABLE         | Tổ chức sự kiện                           |
| `organizer_email`     | VARCHAR(255)  | NULLABLE         | Email tổ chức                             |
| `organizer_phone`     | VARCHAR(20)   | NULLABLE         | Điện thoại tổ chức                        |
| `organizer_website`   | VARCHAR(500)  | NULLABLE         | Website tổ chức                           |
| `location`            | TEXT          | NOT NULL         | Vị trí                                    |
| `venue_name`          | VARCHAR(255)  | NULLABLE         | Tên địa điểm                              |
| `lat`                 | DECIMAL(10,8) | NOT NULL         | Vĩ độ                                     |
| `lng`                 | DECIMAL(11,8) | NOT NULL         | Kinh độ                                   |
| `url`                 | VARCHAR(500)  | NULLABLE         | URL sự kiện                               |
| `sources`             | JSONB         | NULLABLE         | Danh sách nguồn                           |
| `start_date`          | TIMESTAMP     | NOT NULL         | Ngày bắt đầu                              |
| `end_date`            | TIMESTAMP     | NULLABLE         | Ngày kết thúc                             |
| `eventbrite_event_id` | VARCHAR(255)  | NULLABLE         | ID từ Eventbrite                          |
| `external_source`     | VARCHAR(100)  | NULLABLE         | Tên nguồn bên ngoài                       |
| `external_id`         | VARCHAR(255)  | NULLABLE         | ID bên ngoài                              |
| `status`              | VARCHAR(50)   | DEFAULT 'active' | Trạng thái (active, cancelled, completed) |
| `attendees_count`     | INTEGER       | DEFAULT 0        | Số lượng người tham gia                   |
| `raw_data`            | JSONB         | NULLABLE         | Dữ liệu thô                               |
| `created_at`          | TIMESTAMP     | AUTO             | Ngày tạo                                  |
| `updated_at`          | TIMESTAMP     | AUTO             | Ngày cập nhật                             |

**Indexes**:

- `(lat, lng)`
- `(start_date, end_date)`
- `eventbrite_event_id`

**Relationships**:

- ⬌ `companies` (N:M qua company_events)
- ⬌ `hotels` (N:M qua hotel_events)
- ↔ `event_sources` (1:M)
- ↔ `event_vectors` (1:M)

**Business Methods**:

- `isActive()`, `isUpcoming()`, `isOngoing()`, `isPast()`
- `getDuration()`

---

#### 3️⃣ **people** (Nhân Sự)

**Bảng lưu thông tin cá nhân làm việc tại công ty**

| Trường                 | Kiểu         | Constraints      | Mô Tả                   |
| ---------------------- | ------------ | ---------------- | ----------------------- |
| `id`                   | UUID         | PK               | Mã định danh            |
| `first_name`           | VARCHAR(100) | NOT NULL         | Tên                     |
| `last_name`            | VARCHAR(100) | NOT NULL         | Họ                      |
| `full_name`            | VARCHAR(255) | NULLABLE         | Tên đầy đủ              |
| `normalized_full_name` | VARCHAR(255) | NULLABLE         | Tên chuẩn hóa           |
| `email`                | VARCHAR(255) | UNIQUE, NULLABLE | Email                   |
| `phone`                | VARCHAR(20)  | NULLABLE         | Số điện thoại           |
| `mobile_phone`         | VARCHAR(20)  | NULLABLE         | Điện thoại di động      |
| `title`                | VARCHAR(255) | NULLABLE         | Chức danh (CEO, CTO...) |
| `department`           | VARCHAR(100) | NULLABLE         | Phòng ban               |
| `linkedin_url`         | VARCHAR(500) | NULLABLE         | Profile LinkedIn        |
| `external_source`      | VARCHAR(100) | NULLABLE         | Nguồn dữ liệu           |
| `external_id`          | VARCHAR(255) | NULLABLE         | ID bên ngoài            |
| `status`               | VARCHAR(50)  | DEFAULT 'active' | Trạng thái              |
| `bio`                  | TEXT         | NULLABLE         | Tiểu sử                 |
| `raw_data`             | JSONB        | NULLABLE         | Dữ liệu thô             |
| `created_at`           | TIMESTAMP    | AUTO             | Ngày tạo                |
| `updated_at`           | TIMESTAMP    | AUTO             | Ngày cập nhật           |

**Indexes**:

- `email`
- `(external_id, external_source)`

**Relationships**:

- ⬌ `companies` (N:M qua company_people)
- ↔ `person_vectors` (1:M)

**Business Methods**:

- `getFullName()`
- `isValid()`, `isActive()`, `hasEmail()`

---

#### 4️⃣ **hotels** (Khách Sạn - Điểm Gốc)

**Bảng lưu khách sạn - là điểm gốc chính của hệ thống**

| Trường            | Kiểu          | Constraints      | Mô Tả                              |
| ----------------- | ------------- | ---------------- | ---------------------------------- |
| `id`              | UUID          | PK               | Mã định danh                       |
| `external_source` | VARCHAR(100)  | NULLABLE         | Nguồn (Booking.com, Hotels.com...) |
| `external_id`     | VARCHAR(255)  | NULLABLE         | ID bên ngoài                       |
| `name`            | VARCHAR(255)  | NOT NULL         | Tên khách sạn                      |
| `address`         | TEXT          | NOT NULL         | Địa chỉ                            |
| `lat`             | DECIMAL(10,8) | NOT NULL         | Vĩ độ                              |
| `lng`             | DECIMAL(11,8) | NOT NULL         | Kinh độ                            |
| `phone`           | VARCHAR(20)   | NULLABLE         | Số điện thoại                      |
| `email`           | VARCHAR(255)  | NULLABLE         | Email                              |
| `website`         | VARCHAR(500)  | NULLABLE         | Website                            |
| `google_url`      | VARCHAR(500)  | NULLABLE         | URL Google                         |
| `rating`          | DECIMAL(3,2)  | NULLABLE         | Đánh giá                           |
| `reviews_count`   | INTEGER       | DEFAULT 0        | Số đánh giá                        |
| `room_count`      | INTEGER       | NULLABLE         | Số phòng                           |
| `status`          | VARCHAR(50)   | DEFAULT 'active' | Trạng thái (active, inactive)      |
| `description`     | TEXT          | NULLABLE         | Mô tả                              |
| `raw_data`        | JSONB         | NULLABLE         | Dữ liệu thô                        |
| `created_at`      | TIMESTAMP     | AUTO             | Ngày tạo                           |
| `updated_at`      | TIMESTAMP     | AUTO             | Ngày cập nhật                      |

**Indexes**:

- `(lat, lng)`
- `(external_id, external_source)`

**Relationships**:

- ⬌ `companies` (N:M qua hotel_companies)
- ⬌ `events` (N:M qua hotel_events)

---

### 📥 NHÓM CRAWL (2 Bảng)

---

#### 5️⃣ **crawl_batches** (Batch Crawl - Theo Dõi Batch)

**Bảng theo dõi các batch import/crawl/enrichment dữ liệu**

| Trường             | Kiểu         | Constraints       | Mô Tả                                                     |
| ------------------ | ------------ | ----------------- | --------------------------------------------------------- |
| `id`               | UUID         | PK                | Mã batch                                                  |
| `batch_number`     | BIGINT       | UNIQUE            | Số thứ tự batch                                           |
| `name`             | VARCHAR(255) | NULLABLE          | Tên batch                                                 |
| `source_name`      | VARCHAR(100) | NOT NULL          | Nguồn (google_maps, event_site, import, enrichment)       |
| `entity_type`      | VARCHAR(100) | NOT NULL          | Loại entity (hotel, company, person, event, mixed)        |
| `status`           | VARCHAR(50)  | DEFAULT 'pending' | Trạng thái (pending, running, completed, failed, partial) |
| `started_at`       | TIMESTAMP    | NULLABLE          | Thời gian bắt đầu                                         |
| `ended_at`         | TIMESTAMP    | NULLABLE          | Thời gian kết thúc                                        |
| `duration_seconds` | INTEGER      | NULLABLE          | Thời gian chạy (giây)                                     |
| `total_items`      | INTEGER      | DEFAULT 0         | Tổng số items                                             |
| `successful_items` | INTEGER      | DEFAULT 0         | Items thành công                                          |
| `failed_items`     | INTEGER      | DEFAULT 0         | Items thất bại                                            |
| `skipped_items`    | INTEGER      | DEFAULT 0         | Items bỏ qua                                              |
| `duplicate_items`  | INTEGER      | DEFAULT 0         | Items trùng lặp                                           |
| `config_snapshot`  | JSONB        | NULLABLE          | Snapshot config crawl                                     |
| `error_summary`    | TEXT         | NULLABLE          | Tóm tắt lỗi                                               |
| `created_at`       | TIMESTAMP    | AUTO              | Ngày tạo                                                  |

**Indexes**:

- `source_name`
- `status`
- `entity_type`

**Relationships**:

- ↔ `crawl_items` (1:M)
- ↔ `change_logs` (1:M)
- ↔ `data_quality_reports` (1:M)

---

#### 6️⃣ **crawl_items** (Item Crawl - Chi Tiết Từng Item)

**Bảng lưu chi tiết từng item trong batch crawl**

| Trường          | Kiểu         | Constraints       | Mô Tả                                                     |
| --------------- | ------------ | ----------------- | --------------------------------------------------------- |
| `id`            | UUID         | PK                | Mã item                                                   |
| `batch_id`      | UUID         | FK, NOT NULL      | Liên kết đến crawl_batch                                  |
| `entity_type`   | VARCHAR(100) | NOT NULL          | Loại entity (hotel, company, person, event)               |
| `external_id`   | VARCHAR(255) | NULLABLE          | ID từ nguồn bên ngoài                                     |
| `source_name`   | VARCHAR(100) | NULLABLE          | Tên nguồn                                                 |
| `entity_id`     | UUID         | NULLABLE          | ID của entity được tạo/cập nhật                           |
| `status`        | VARCHAR(50)  | DEFAULT 'pending' | Trạng thái (pending, success, failed, duplicate, skipped) |
| `error_code`    | VARCHAR(100) | NULLABLE          | Mã lỗi                                                    |
| `error_message` | TEXT         | NULLABLE          | Thông báo lỗi                                             |
| `retry_count`   | INTEGER      | DEFAULT 0         | Số lần retry                                              |
| `raw_data`      | JSONB        | NULLABLE          | Dữ liệu thô                                               |
| `created_at`    | TIMESTAMP    | AUTO              | Ngày tạo                                                  |

**Indexes**:

- `batch_id`
- `entity_type`
- `status`
- `(batch_id, status)`

**Relationships**:

- ← `crawl_batches` (N:1)

**Status Meanings**:

- `pending`: Chưa xử lý
- `success`: Xử lý thành công
- `failed`: Lỗi xử lý
- `duplicate`: Phát hiện trùng lặp
- `skipped`: Bỏ qua

---

### 📦 NHÓM SOURCE (2 Bảng)

---

#### 7️⃣ **company_sources** (Nguồn Dữ Liệu Công Ty)

**Lưu thông tin từng nguồn cho company (Google Maps, manual import, web crawl)**

| Trường                 | Kiểu          | Constraints            | Mô Tả                                                       |
| ---------------------- | ------------- | ---------------------- | ----------------------------------------------------------- |
| `id`                   | UUID          | PK                     | Mã record                                                   |
| `company_id`           | UUID          | FK (CASCADE), NOT NULL | Liên kết đến company                                        |
| `source_name`          | VARCHAR(100)  | NOT NULL               | Tên nguồn (google_maps, manual, internal_import, web_crawl) |
| `source_record_id`     | VARCHAR(255)  | NULLABLE               | ID gốc từ nguồn                                             |
| `source_url`           | VARCHAR(500)  | NULLABLE               | URL gốc                                                     |
| `name`                 | VARCHAR(255)  | NULLABLE               | Tên từ nguồn                                                |
| `industry`             | VARCHAR(100)  | NULLABLE               | Ngành từ nguồn                                              |
| `address`              | TEXT          | NULLABLE               | Địa chỉ từ nguồn                                            |
| `lat`                  | DECIMAL(10,8) | NULLABLE               | Vĩ độ từ nguồn                                              |
| `lng`                  | DECIMAL(11,8) | NULLABLE               | Kinh độ từ nguồn                                            |
| `phone`                | VARCHAR(20)   | NULLABLE               | Điện thoại từ nguồn                                         |
| `email`                | VARCHAR(255)  | NULLABLE               | Email từ nguồn                                              |
| `website`              | VARCHAR(500)  | NULLABLE               | Website từ nguồn                                            |
| `google_url`           | VARCHAR(500)  | NULLABLE               | URL Google từ nguồn                                         |
| `rating`               | DECIMAL(3,2)  | NULLABLE               | Đánh giá từ nguồn                                           |
| `reviews_count`        | INTEGER       | DEFAULT 0              | Số đánh giá từ nguồn                                        |
| `business_status`      | VARCHAR(100)  | NULLABLE               | Trạng thái kinh doanh                                       |
| `types`                | JSONB         | NULLABLE               | Các loại (Google types)                                     |
| `contact_person`       | VARCHAR(255)  | NULLABLE               | Người liên hệ                                               |
| `contact_person_phone` | VARCHAR(20)   | NULLABLE               | Điện thoại người liên hệ                                    |
| `business_hours`       | JSONB         | NULLABLE               | Giờ mở cửa                                                  |
| `fetched_at`           | TIMESTAMP     | NULLABLE               | Thời gian fetch                                             |
| `is_primary`           | BOOLEAN       | DEFAULT false          | Là nguồn chính                                              |
| `raw_data`             | JSONB         | NULLABLE               | Dữ liệu thô                                                 |
| `created_at`           | TIMESTAMP     | AUTO                   | Ngày tạo                                                    |
| `updated_at`           | TIMESTAMP     | AUTO                   | Ngày cập nhật                                               |

**Indexes**:

- `company_id`
- `source_name`
- `is_primary`

**Relationships**:

- ← `companies` (N:1)

**Purpose**: Lưu trữ chi tiết từng nguồn, cho phép sau này xác nhận hoặc so sánh dữ liệu từ các nguồn khác nhau.

---

#### 8️⃣ **event_sources** (Nguồn Dữ Liệu Sự Kiện)

**Lưu thông tin từng nguồn cho event**

| Trường              | Kiểu         | Constraints            | Mô Tả                                                     |
| ------------------- | ------------ | ---------------------- | --------------------------------------------------------- |
| `id`                | UUID         | PK                     | Mã record                                                 |
| `event_id`          | UUID         | FK (CASCADE), NOT NULL | Liên kết đến event                                        |
| `source_name`       | VARCHAR(100) | NOT NULL               | Nguồn (eventbrite, tedx, facebook, manual)                |
| `source_record_id`  | VARCHAR(255) | NULLABLE               | ID gốc từ nguồn                                           |
| `source_url`        | VARCHAR(500) | NULLABLE               | URL gốc                                                   |
| `company_role`      | VARCHAR(100) | NULLABLE               | Vai trò công ty (exhibitor, sponsor, attendee, organizer) |
| `organizer`         | VARCHAR(255) | NULLABLE               | Người tổ chức                                             |
| `organizer_email`   | VARCHAR(255) | NULLABLE               | Email người tổ chức                                       |
| `organizer_phone`   | VARCHAR(20)  | NULLABLE               | Điện thoại người tổ chức                                  |
| `organizer_website` | VARCHAR(500) | NULLABLE               | Website người tổ chức                                     |
| `fetched_at`        | TIMESTAMP    | NULLABLE               | Thời gian fetch                                           |
| `is_primary`        | BOOLEAN      | DEFAULT false          | Là nguồn chính                                            |
| `raw_data`          | JSONB        | NULLABLE               | Dữ liệu thô                                               |
| `created_at`        | TIMESTAMP    | AUTO                   | Ngày tạo                                                  |
| `updated_at`        | TIMESTAMP    | AUTO                   | Ngày cập nhật                                             |

**Indexes**:

- `event_id`
- `source_name`
- `is_primary`

**Relationships**:

- ← `events` (N:1)

---

### 🔗 NHÓM RELATIONSHIP (4 Bảng)

---

#### 9️⃣ **company_people** (Quan Hệ Công Ty - Nhân Sự)

**Bảng liên kết định mức (M:M) giữa company và person**

| Trường               | Kiểu         | Constraints            | Mô Tả                            |
| -------------------- | ------------ | ---------------------- | -------------------------------- |
| `id`                 | UUID         | PK                     | Mã relationship                  |
| `company_id`         | UUID         | FK (CASCADE), NOT NULL | Công ty                          |
| `person_id`          | UUID         | FK (CASCADE), NOT NULL | Nhân sự                          |
| `role`               | VARCHAR(100) | NULLABLE               | Chức danh (CEO, CTO, Manager...) |
| `department`         | VARCHAR(100) | NULLABLE               | Phòng ban                        |
| `seniority`          | VARCHAR(100) | NULLABLE               | Mức seniority                    |
| `is_primary_contact` | BOOLEAN      | DEFAULT false          | Là liên hệ chính                 |
| `is_active`          | BOOLEAN      | DEFAULT true           | Đang hoạt động                   |
| `start_date`         | TIMESTAMP    | NULLABLE               | Ngày bắt đầu                     |
| `end_date`           | TIMESTAMP    | NULLABLE               | Ngày kết thúc                    |
| `source_name`        | VARCHAR(100) | NULLABLE               | Nguồn                            |
| `confidence_score`   | DECIMAL(5,4) | NULLABLE               | Độ tin cậy (0-1)                 |
| `created_at`         | TIMESTAMP    | AUTO                   | Ngày tạo                         |
| `updated_at`         | TIMESTAMP    | AUTO                   | Ngày cập nhật                    |

**Indexes**:

- `(company_id, person_id)` UNIQUE
- `company_id`
- `person_id`
- `is_primary_contact`

**Relationships**:

- ← `companies` (N:1)
- ← `people` (N:1)

---

#### 🔟 **company_events** (Quan Hệ Công Ty - Sự Kiện)

**Bảng liên kết định mức giữa company và event**

| Trường             | Kiểu         | Constraints            | Mô Tả                                                                        |
| ------------------ | ------------ | ---------------------- | ---------------------------------------------------------------------------- |
| `id`               | UUID         | PK                     | Mã relationship                                                              |
| `company_id`       | UUID         | FK (CASCADE), NOT NULL | Công ty                                                                      |
| `event_id`         | UUID         | FK (CASCADE), NOT NULL | Sự kiện                                                                      |
| `role`             | VARCHAR(100) | NULLABLE               | Vai trò của công ty (exhibitor, sponsor, attendee, organizer, venue_partner) |
| `status`           | VARCHAR(100) | DEFAULT 'tentative'    | Trạng thái (confirmed, inferred, tentative)                                  |
| `source_name`      | VARCHAR(100) | NULLABLE               | Tên nguồn                                                                    |
| `source_url`       | VARCHAR(500) | NULLABLE               | URL nguồn                                                                    |
| `confidence_score` | DECIMAL(5,4) | NULLABLE               | Độ tin cậy (0-1)                                                             |
| `first_seen_at`    | TIMESTAMP    | NULLABLE               | Lần đầu phát hiện                                                            |
| `last_seen_at`     | TIMESTAMP    | NULLABLE               | Lần cuối phát hiện                                                           |
| `created_at`       | TIMESTAMP    | AUTO                   | Ngày tạo                                                                     |
| `updated_at`       | TIMESTAMP    | AUTO                   | Ngày cập nhật                                                                |

**Indexes**:

- `(company_id, event_id, role)` UNIQUE
- `company_id`
- `event_id`
- `last_seen_at`

**Relationships**:

- ← `companies` (N:1)
- ← `events` (N:1)

---

#### 1️⃣1️⃣ **hotel_companies** (Quan Hệ Khách Sạn - Công Ty Lân Cận)

**Bảng liên kết khách sạn với công ty lân cận trong bán kính nhất định**

| Trường                | Kiểu         | Constraints            | Mô Tả                                              |
| --------------------- | ------------ | ---------------------- | -------------------------------------------------- |
| `id`                  | UUID         | PK                     | Mã relationship                                    |
| `hotel_id`            | UUID         | FK (CASCADE), NOT NULL | Khách sạn                                          |
| `company_id`          | UUID         | FK (CASCADE), NOT NULL | Công ty lân cận                                    |
| `source_name`         | VARCHAR(100) | DEFAULT 'google_maps'  | Nguồn (google_maps, manual, import)                |
| `source_record_id`    | VARCHAR(255) | NULLABLE               | ID gốc                                             |
| `distance_km`         | DECIMAL(8,2) | NULLABLE               | Khoảng cách (km)                                   |
| `travel_time_minutes` | INTEGER      | NULLABLE               | Thời gian di chuyển (phút)                         |
| `bearing`             | INTEGER      | NULLABLE               | Hướng (độ: 0-360)                                  |
| `relationship_type`   | VARCHAR(100) | DEFAULT 'nearby'       | Loại quan hệ (nearby, matched, preferred, visited) |
| `confidence_score`    | DECIMAL(5,4) | NULLABLE               | Độ tin cậy (0-1)                                   |
| `first_seen_at`       | TIMESTAMP    | NULLABLE               | Lần đầu phát hiện                                  |
| `last_seen_at`        | TIMESTAMP    | NULLABLE               | Lần cuối phát hiện                                 |
| `is_active`           | BOOLEAN      | DEFAULT true           | Đang hoạt động                                     |
| `notes`               | TEXT         | NULLABLE               | Ghi chú                                            |
| `created_at`          | TIMESTAMP    | AUTO                   | Ngày tạo                                           |
| `updated_at`          | TIMESTAMP    | AUTO                   | Ngày cập nhật                                      |

**Indexes**:

- `(hotel_id, company_id)` UNIQUE
- `hotel_id`
- `company_id`
- `last_seen_at`

**Relationships**:

- ← `hotels` (N:1)
- ← `companies` (N:1)

**Purpose**: Deduplication fallback cho companies mà không có `place_id`. Nếu cùng hotel & company xuất hiện 2 lần, đó là duplicate.

---

#### 1️⃣2️⃣ **hotel_events** (Quan Hệ Khách Sạn - Sự Kiện)

**Bảng liên kết khách sạn với sự kiện lân cận**

| Trường              | Kiểu         | Constraints            | Mô Tả                                     |
| ------------------- | ------------ | ---------------------- | ----------------------------------------- |
| `id`                | UUID         | PK                     | Mã relationship                           |
| `hotel_id`          | UUID         | FK (CASCADE), NOT NULL | Khách sạn                                 |
| `event_id`          | UUID         | FK (CASCADE), NOT NULL | Sự kiện                                   |
| `relationship_type` | VARCHAR(100) | NULLABLE               | Loại quan hệ (nearby, venue, recommended) |
| `distance_km`       | DECIMAL(8,2) | NULLABLE               | Khoảng cách                               |
| `source_name`       | VARCHAR(100) | NULLABLE               | Nguồn                                     |
| `confidence_score`  | DECIMAL(5,4) | NULLABLE               | Độ tin cậy (0-1)                          |
| `created_at`        | TIMESTAMP    | AUTO                   | Ngày tạo                                  |
| `updated_at`        | TIMESTAMP    | AUTO                   | Ngày cập nhật                             |

**Indexes**:

- `(hotel_id, event_id)` UNIQUE
- `hotel_id`
- `event_id`

**Relationships**:

- ← `hotels` (N:1)
- ← `events` (N:1)

---

### 🧠 NHÓM VECTOR (4 Bảng)

---

#### 1️⃣3️⃣ **vector_batches** (Batch Embeddings - Theo Dõi Batch)

**Bảng theo dõi các batch tạo embeddings/vectors cho search**

| Trường                  | Kiểu         | Constraints       | Mô Tả                                               |
| ----------------------- | ------------ | ----------------- | --------------------------------------------------- |
| `id`                    | UUID         | PK                | Mã batch                                            |
| `model_name`            | VARCHAR(255) | NOT NULL          | Tên model (text-embedding-3-small)                  |
| `model_version`         | VARCHAR(100) | NOT NULL          | Phiên bản model                                     |
| `entity_type`           | VARCHAR(100) | NOT NULL          | Loại entity (company, person, event)                |
| `status`                | VARCHAR(50)  | DEFAULT 'pending' | Trạng thái (pending, generating, completed, failed) |
| `started_at`            | TIMESTAMP    | NULLABLE          | Thời gian bắt đầu                                   |
| `ended_at`              | TIMESTAMP    | NULLABLE          | Thời gian kết thúc                                  |
| `total_embeddings`      | INTEGER      | DEFAULT 0         | Tổng số embeddings                                  |
| `successful_embeddings` | INTEGER      | DEFAULT 0         | Số thành công                                       |
| `failed_embeddings`     | INTEGER      | DEFAULT 0         | Số thất bại                                         |
| `created_at`            | TIMESTAMP    | AUTO              | Ngày tạo                                            |
| `updated_at`            | TIMESTAMP    | AUTO              | Ngày cập nhật                                       |

**Indexes**:

- `model_name`
- `entity_type`
- `status`

**Relationships**:

- ↔ `company_vectors` (1:M)
- ↔ `event_vectors` (1:M)
- ↔ `person_vectors` (1:M)

---

#### 1️⃣4️⃣ **company_vectors** (Embeddings Công Ty)

**Lưu embeddings (vector representations) cho search semantic của companies**

| Trường            | Kiểu      | Constraints            | Mô Tả                                 |
| ----------------- | --------- | ---------------------- | ------------------------------------- |
| `id`              | UUID      | PK                     | Mã vector                             |
| `company_id`      | UUID      | FK (CASCADE), NOT NULL | Công ty                               |
| `vector_batch_id` | UUID      | FK (CASCADE), NOT NULL | Batch                                 |
| `embedding`       | TEXT      | NOT NULL               | Vector dạng text (JSON hoặc pgvector) |
| `embedding_text`  | TEXT      | NULLABLE               | Văn bản được embed                    |
| `created_at`      | TIMESTAMP | AUTO                   | Ngày tạo                              |

**Indexes**:

- `company_id`
- `vector_batch_id`

**Relationships**:

- ← `companies` (N:1)
- ← `vector_batches` (N:1)

**Purpose**: Tìm kiếm ngữ nghĩa (semantic search) của công ty dựa trên tên, mô tả...

---

#### 1️⃣5️⃣ **event_vectors** (Embeddings Sự Kiện)

**Lưu embeddings cho search semantic của events**

| Trường            | Kiểu      | Constraints            | Mô Tả              |
| ----------------- | --------- | ---------------------- | ------------------ |
| `id`              | UUID      | PK                     | Mã vector          |
| `event_id`        | UUID      | FK (CASCADE), NOT NULL | Sự kiện            |
| `vector_batch_id` | UUID      | FK (CASCADE), NOT NULL | Batch              |
| `embedding`       | TEXT      | NOT NULL               | Vector dạng text   |
| `embedding_text`  | TEXT      | NULLABLE               | Văn bản được embed |
| `created_at`      | TIMESTAMP | AUTO                   | Ngày tạo           |

**Indexes**:

- `event_id`
- `vector_batch_id`

**Relationships**:

- ← `events` (N:1)
- ← `vector_batches` (N:1)

---

#### 1️⃣6️⃣ **person_vectors** (Embeddings Nhân Sự)

**Lưu embeddings cho search semantic của persons**

| Trường            | Kiểu      | Constraints            | Mô Tả              |
| ----------------- | --------- | ---------------------- | ------------------ |
| `id`              | UUID      | PK                     | Mã vector          |
| `person_id`       | UUID      | FK (CASCADE), NOT NULL | Nhân sự            |
| `vector_batch_id` | UUID      | FK (CASCADE), NOT NULL | Batch              |
| `embedding`       | TEXT      | NOT NULL               | Vector dạng text   |
| `embedding_text`  | TEXT      | NULLABLE               | Văn bản được embed |
| `created_at`      | TIMESTAMP | AUTO                   | Ngày tạo           |

**Indexes**:

- `person_id`
- `vector_batch_id`

**Relationships**:

- ← `people` (N:1)
- ← `vector_batches` (N:1)

---

### 📝 NHÓM AUDIT (3 Bảng)

---

#### 1️⃣7️⃣ **dedup_logs** (Ghi Nhật Ký Merge/Duplicate)

**Bảng ghi lại tất cả các merge/duplicate được phát hiện**

| Trường         | Kiểu         | Constraints | Mô Tả                                       |
| -------------- | ------------ | ----------- | ------------------------------------------- |
| `id`           | UUID         | PK          | Mã log                                      |
| `entity_type`  | VARCHAR(100) | NOT NULL    | Loại entity (company, person, event, hotel) |
| `primary_id`   | UUID         | NOT NULL    | ID entity chính (giữ lại)                   |
| `merged_id`    | UUID         | NOT NULL    | ID entity bị merge vào primary              |
| `match_score`  | DECIMAL(5,4) | NULLABLE    | Điểm khớp (0-1)                             |
| `merge_reason` | TEXT         | NULLABLE    | Lý do merge                                 |
| `merged_by`    | VARCHAR(255) | NULLABLE    | Người/hệ thống thực hiện                    |
| `batch_id`     | UUID         | NULLABLE    | Batch tạo merge                             |
| `created_at`   | TIMESTAMP    | AUTO        | Ngày merge                                  |

**Indexes**:

- `entity_type`
- `primary_id`
- `merged_id`

**Relationships**:

- (Có thể liên kết tới crawl_batches qua batch_id)

**Purpose**: Theo dõi lịch sử merge để có thể "undo" hoặc phân tích chiến lược dedup.

---

#### 1️⃣8️⃣ **change_logs** (Ghi Nhật Ký Thay Đổi)

**Bảng ghi lại tất cả các thay đổi dữ liệu (audit trail)**

| Trường           | Kiểu         | Constraints | Mô Tả                                                   |
| ---------------- | ------------ | ----------- | ------------------------------------------------------- |
| `id`             | UUID         | PK          | Mã log                                                  |
| `entity_type`    | VARCHAR(100) | NOT NULL    | Loại entity                                             |
| `entity_id`      | UUID         | NOT NULL    | ID entity bị thay đổi                                   |
| `change_type`    | VARCHAR(100) | NOT NULL    | Loại thay đổi (create, update, merge, archive, restore) |
| `changed_fields` | JSONB        | NULLABLE    | Danh sách trường bị thay đổi                            |
| `old_values`     | JSONB        | NULLABLE    | Giá trị cũ                                              |
| `new_values`     | JSONB        | NULLABLE    | Giá trị mới                                             |
| `source_name`    | VARCHAR(100) | NULLABLE    | Nguồn thay đổi (API, manual, import...)                 |
| `batch_id`       | UUID         | NULLABLE    | Batch liên quan                                         |
| `created_at`     | TIMESTAMP    | AUTO        | Thời gian thay đổi                                      |

**Indexes**:

- `entity_type`
- `entity_id`
- `created_at`

**Relationships**:

- (Có thể liên kết tới crawl_batches qua batch_id)

**Purpose**: Audit trail đầy đủ cho compliance, debug, và rollback.

---

#### 1️⃣9️⃣ **data_quality_reports** (Báo Cáo Chất Lượng Dữ Liệu)

**Bảng lưu báo cáo chất lượng dữ liệu sau các batch import**

| Trường          | Kiểu         | Constraints  | Mô Tả                                            |
| --------------- | ------------ | ------------ | ------------------------------------------------ |
| `id`            | UUID         | PK           | Mã báo cáo                                       |
| `batch_id`      | UUID         | FK, NOT NULL | Batch liên quan                                  |
| `entity_type`   | VARCHAR(100) | NULLABLE     | Loại entity (company, event, person)             |
| `overall_score` | DECIMAL(5,4) | NULLABLE     | Điểm chất lượng tổng thể (0-1)                   |
| `metrics`       | JSONB        | NULLABLE     | Các metrics chi tiết (completeness, accuracy...) |
| `issues`        | JSONB        | NULLABLE     | Các vấn đề phát hiện                             |
| `status`        | VARCHAR(50)  | NULLABLE     | Mức độ (excellent, good, acceptable, poor)       |
| `created_at`    | TIMESTAMP    | AUTO         | Ngày tạo                                         |

**Indexes**:

- `batch_id`
- `entity_type`
- `created_at`

**Relationships**:

- ← `crawl_batches` (N:1)

**Purpose**: Theo dõi chất lượng dữ liệu sau mỗi import.

---

## 🔀 BẢNG JOIN TRUNG GIAN (Từ @ManyToMany)

### ⚠️ Lưu Ý

Các bảng join dưới đây **có thể được TypeORM tạo tự động** từ `@ManyToMany` + `@JoinTable`, hoặc có thể **được khai báo tường minh** dưới dạng entities.

Hiện tại, cấu hình cho thấy:

| Relationship         | JoinTable Name   | Thực tế                                             |
| -------------------- | ---------------- | --------------------------------------------------- |
| `Company` ⬌ `Event`  | `company_event`  | Có entity `CompanyEvent` - được quản lý tường minh  |
| `Company` ⬌ `Person` | `company_person` | Có entity `CompanyPerson` - được quản lý tường minh |
| `Hotel` ⬌ `Event`    | `hotel_event`    | Có entity `HotelEvent` - được quản lý tường minh    |

**Kết luận**: Tất cả join tables đều được quản lý tường minh → Số bảng = 19.

---

## 🎯 MỐI QUAN HỆ TỔNG QUAN

### UML Diagram Mối Quan Hệ

```
┌─────────────────────────────────────────────────────────────┐
│                        HOTELS (Điểm Gốc)                    │
└───────────────┬─────────────────────────────────────────────┘
                │
        ┌───────┼───────┐
        │       │       │
        │       │       └──→ hotel_events ←──── events
        │       │                              ↗     ↖
        │       └──→ hotel_companies ←──── companies
        │                                   ↗     ↖
        │                                  /       \
        │                          company_people  company_events
        │                                   ↑           ↑
        │                                   │           │
        │                                people      events
        │
        └─→ Vector Processing, Crawl Tracking, Audit Logs

┌──────────────────── ENTITY QUAN HỆCHÍNH ──────────────────┐
│                                                             │
│  Companies (công ty) ⬌ Events (sự kiện)                   │
│  Companies (công ty) ⬌ People (nhân sự)                   │
│  Hotels (khách sạn) ⬌ Companies (công ty lân cận)         │
│  Hotels (khách sạn) ⬌ Events (sự kiện)                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘

┌── INFRASTRUCTURE ENTITIES ──────────────────────────────────┐
│                                                             │
│  Crawl Process: crawl_batches → crawl_items                │
│  Source Tracking: company_sources, event_sources           │
│  Vector Search: vector_batches → vectors (3 loại)         │
│  Audit Trail: dedup_logs, change_logs, quality_reports    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 📊 FLOW DỮ LIỆU

### 1. **Import/Crawl Flow**

```
Start Crawl
    ↓
Create crawl_batch (trạng thái: pending)
    ↓
Fetch Data from Source (Google Maps, Eventbrite...)
    ↓
For each item:
    ├─→ Create crawl_item (trạng thái: pending)
    ├─→ Validate & Process
    ├─→ Check Deduplication
    │   ├─→ By place_id (Company)
    │   └─→ By hotel_company UNIQUE constraint
    ├─→ Create/Update Entity (company, event, person)
    ├─→ Create company_source / event_source records
    ├─→ Update crawl_item (trạng thái: success/failed/duplicate)
    └─→ Create change_log entry
    ↓
All items done
    ├─→ Update crawl_batch status (completed/partial/failed)
    ├─→ Create data_quality_report
    └─→ End
```

### 2. **Search Flow**

```
User searches for company
    ↓
Query companies table (direct match)
    ↓
OR use vector similarity
    ├─→ Generate embedding từ search text
    ├─→ Query company_vectors table
    ├─→ Find similar companies
    └─→ Return results
```

### 3. **Relationship Building**

```
Company + Event match detected
    ↓
Check: Is company near hotel? → hotel_companies
Check: Is event near hotel? → hotel_events
    ↓
Create company_events relationship
    ├─→ role: exhibitor/sponsor/attendee/organizer
    ├─→ confidence_score: từ matching algorithm
    └─→ first_seen_at, last_seen_at for tracking
```

---

## 🔑 PRIMARY KEYS & UNIQUE CONSTRAINTS

| Bảng                     | Primary Key | Unique Constraints             | Dedup Strategy             |
| ------------------------ | ----------- | ------------------------------ | -------------------------- |
| **companies**            | `id` (UUID) | `place_id` (khi NOT NULL)      | place_id → hotel_companies |
| **events**               | `id` (UUID) | —                              | external_id + source       |
| **people**               | `id` (UUID) | `email`                        | email                      |
| **hotels**               | `id` (UUID) | —                              | external_id + source       |
| **crawl_batches**        | `id` (UUID) | `batch_number`                 | —                          |
| **crawl_items**          | `id` (UUID) | —                              | —                          |
| **company_sources**      | `id` (UUID) | —                              | —                          |
| **event_sources**        | `id` (UUID) | —                              | —                          |
| **company_people**       | `id` (UUID) | `(company_id, person_id)`      | —                          |
| **company_events**       | `id` (UUID) | `(company_id, event_id, role)` | —                          |
| **hotel_companies**      | `id` (UUID) | `(hotel_id, company_id)`       | Fallback dedup             |
| **hotel_events**         | `id` (UUID) | `(hotel_id, event_id)`         | —                          |
| **vector_batches**       | `id` (UUID) | —                              | —                          |
| **company_vectors**      | `id` (UUID) | —                              | —                          |
| **event_vectors**        | `id` (UUID) | —                              | —                          |
| **person_vectors**       | `id` (UUID) | —                              | —                          |
| **dedup_logs**           | `id` (UUID) | —                              | —                          |
| **change_logs**          | `id` (UUID) | —                              | —                          |
| **data_quality_reports** | `id` (UUID) | —                              | —                          |

---

## 📈 PERFORMANCE CONSIDERATIONS

### Indexes Quan Trọng

```sql
-- Spatial queries (distance calculations)
CREATE INDEX idx_companies_location ON companies(lat, lng);
CREATE INDEX idx_events_location ON events(lat, lng);
CREATE INDEX idx_hotels_location ON hotels(lat, lng);

-- Time-based queries
CREATE INDEX idx_events_dates ON events(start_date, end_date);
CREATE INDEX idx_crawl_batches_created ON crawl_batches(created_at);

-- Relationship lookups
CREATE INDEX idx_company_people_company ON company_people(company_id);
CREATE INDEX idx_company_events_event ON company_events(event_id);
CREATE INDEX idx_hotel_companies_hotel ON hotel_companies(hotel_id);

-- Deduplication checks
CREATE INDEX idx_companies_place_id ON companies(place_id) WHERE place_id IS NOT NULL;
CREATE INDEX idx_people_email ON people(email);

-- Source tracking
CREATE INDEX idx_company_sources_company ON company_sources(company_id);
CREATE INDEX idx_event_sources_event ON event_sources(event_id);

-- Audit trail
CREATE INDEX idx_change_logs_entity ON change_logs(entity_type, entity_id);
CREATE INDEX idx_dedup_logs_primary ON dedup_logs(primary_id);
```

---

## 🔐 FOREIGN KEY CONSTRAINTS & CASCADE

| Parent           | Child             | ON DELETE |
| ---------------- | ----------------- | --------- |
| `companies`      | `company_people`  | CASCADE   |
| `companies`      | `company_events`  | CASCADE   |
| `companies`      | `company_sources` | CASCADE   |
| `companies`      | `company_vectors` | CASCADE   |
| `companies`      | `hotel_companies` | CASCADE   |
| `events`         | `company_events`  | CASCADE   |
| `events`         | `event_sources`   | CASCADE   |
| `events`         | `event_vectors`   | CASCADE   |
| `events`         | `hotel_events`    | CASCADE   |
| `people`         | `company_people`  | CASCADE   |
| `people`         | `person_vectors`  | CASCADE   |
| `hotels`         | `hotel_companies` | CASCADE   |
| `hotels`         | `hotel_events`    | CASCADE   |
| `crawl_batches`  | `crawl_items`     | CASCADE   |
| `vector_batches` | `company_vectors` | CASCADE   |
| `vector_batches` | `event_vectors`   | CASCADE   |
| `vector_batches` | `person_vectors`  | CASCADE   |

---

## 📋 SUMMARY BẢNG ENTITIES

| #   | Bảng                   | Loại         | Mục Đích             | Quan Hệ Chính                                         |
| --- | ---------------------- | ------------ | -------------------- | ----------------------------------------------------- |
| 1   | `companies`            | Core         | Công ty/địa điểm     | N:M with events, people; 1:M with sources, vectors    |
| 2   | `events`               | Core         | Sự kiện              | N:M with companies, hotels; 1:M with sources, vectors |
| 3   | `people`               | Core         | Nhân sự              | N:M with companies; 1:M with vectors                  |
| 4   | `hotels`               | Core         | Khách sạn            | N:M with companies, events                            |
| 5   | `crawl_batches`        | Infra        | Batch import         | 1:M with items, batch_quality                         |
| 6   | `crawl_items`          | Infra        | Chi tiết import      | N:1 with crawl_batches                                |
| 7   | `company_sources`      | Source       | Nguồn công ty        | N:1 with companies                                    |
| 8   | `event_sources`        | Source       | Nguồn sự kiện        | N:1 with events                                       |
| 9   | `company_people`       | Relationship | Company-Person       | Explicit M:M                                          |
| 10  | `company_events`       | Relationship | Company-Event        | Explicit M:M                                          |
| 11  | `hotel_companies`      | Relationship | Hotel-Company        | Explicit M:M                                          |
| 12  | `hotel_events`         | Relationship | Hotel-Event          | Explicit M:M                                          |
| 13  | `vector_batches`       | Vector       | Batch embedding      | 1:M with vectors                                      |
| 14  | `company_vectors`      | Vector       | Vector công ty       | N:1 with companies & vector_batches                   |
| 15  | `event_vectors`        | Vector       | Vector sự kiện       | N:1 with events & vector_batches                      |
| 16  | `person_vectors`       | Vector       | Vector nhân sự       | N:1 with people & vector_batches                      |
| 17  | `dedup_logs`           | Audit        | Ghi nhật ký merge    | Audit trail                                           |
| 18  | `change_logs`          | Audit        | Ghi nhật ký thay đổi | Audit trail                                           |
| 19  | `data_quality_reports` | Audit        | Báo cáo chất lượng   | N:1 with crawl_batches                                |

---

## 🚀 NEXT STEPS

1. **Kiểm tra** xem có thêm bảng nào được sử dụng ngoài 19 cái này không
2. **Tối ưu** indexes dựa trên query patterns thực tế
3. **Implement** deduplication logic cho các case không có `place_id`
4. **Setup** audit logging cho mọi thay đổi dữ liệu
5. **Create** migration scripts để khởi tạo các bảng
