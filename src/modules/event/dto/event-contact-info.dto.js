/**
 * EVENT CONTACT INFO DTOs
 * For finding and returning organizer contact information
 */

/**
 * FindEventContactInfoRequestDto
 * Input DTO for finding organizer contact information
 */
export class FindEventContactInfoRequestDto {
  /**
   * Sau khi thiết kế bạn có thể lấy dữ liệu từ:
   * - Event title (bắt buộc) - Tên sự kiện
   * - Event description (tuỳ chọn) - Mô tả sự kiện
   * - Event location (tuỳ chọn) - Địa chỉ sự kiện
   * - Event geo info (tuỳ chọn) - Tọa độ và địa chỉ chi tiết
   * - Event timezone (tuỳ chọn) - Múi giờ
   */
  constructor({
    title,
    description = null,
    location = null,
    geo = null,
    timezone = null,
    id = null,
  }) {
    this.id = id;
    this.title = title; // REQUIRED
    this.description = description;
    this.location = location; // [longitude, latitude]
    this.geo = geo; // { address: {...}, placekey, ... }
    this.timezone = timezone;
  }

  /**
   * Validate input data
   */
  validate() {
    if (!this.title || typeof this.title !== "string") {
      throw new Error("Event title is required and must be a string");
    }

    if (this.title.trim().length < 3) {
      throw new Error("Event title must be at least 3 characters long");
    }

    return true;
  }

  /**
   * Transform from PredictHQ event data
   */
  static fromPredictHqEvent(event) {
    return new FindEventContactInfoRequestDto({
      id: event.id,
      title: event.title,
      description: event.description,
      location: event.location,
      geo: event.geo,
      timezone: event.timezone,
    });
  }

  /**
   * Transform from generic event object
   */
  static fromEventObject(event) {
    return new FindEventContactInfoRequestDto({
      id: event.id || event.eventId,
      title: event.title || event.name,
      description: event.description,
      location: event.location || event.coordinates,
      geo: event.geo || event.address,
      timezone: event.timezone,
    });
  }
}

/**
 * OrganizerContactInfoDto
 * Chi tiết thông tin liên hệ của công ty tổ chức
 */
export class OrganizerContactInfoDto {
  constructor({
    organization_name,
    organization_type,
    website,
    address,
    city,
    state_province,
    country,
    zip_code,
    email,
    phone,
    contact_person_name,
    contact_person_title,
    linkedin_url,
    industry,
    company_size,
  }) {
    this.organization_name = organization_name;
    this.organization_type = organization_type;
    this.website = website;
    this.address = address;
    this.city = city;
    this.state_province = state_province;
    this.country = country;
    this.zip_code = zip_code;
    this.email = email;
    this.phone = phone;
    this.contact_person_name = contact_person_name;
    this.contact_person_title = contact_person_title;
    this.linkedin_url = linkedin_url;
    this.industry = industry;
    this.company_size = company_size;
  }

  /**
   * Lấy thông tin liên hệ chính (quan trọng nhất)
   */
  getPrimaryContactInfo() {
    return {
      organization_name: this.organization_name,
      email: this.email,
      phone: this.phone,
      address: this.address,
      website: this.website,
    };
  }

  /**
   * Lấy thông tin đầy đủ
   */
  getFullContactInfo() {
    return {
      organization_name: this.organization_name,
      organization_type: this.organization_type,
      website: this.website,
      address: this.address,
      city: this.city,
      state_province: this.state_province,
      country: this.country,
      zip_code: this.zip_code,
      email: this.email,
      phone: this.phone,
      contact_person_name: this.contact_person_name,
      contact_person_title: this.contact_person_title,
      linkedin_url: this.linkedin_url,
      industry: this.industry,
      company_size: this.company_size,
    };
  }
}

/**
 * ContactInfoSourceDto
 * Nguồn thông tin được trích xuất
 */
export class ContactInfoSourceDto {
  constructor({ source_type, source_url, extracted_information }) {
    this.source_type = source_type;
    this.source_url = source_url;
    this.extracted_information = extracted_information;
  }
}

/**
 * FindEventContactInfoResponseDto
 * Output DTO - Thông tin liên hệ công ty tổ chức sự kiện
 */
export class FindEventContactInfoResponseDto {
  constructor({
    event_title,
    event_location,
    organizer_found,
    organizer_info,
    sources = [],
    confidence_score,
    search_notes,
    searched_at,
    event_id,
  }) {
    this.event_title = event_title;
    this.event_location = event_location;
    this.organizer_found = organizer_found;
    this.organizer_info = new OrganizerContactInfoDto(organizer_info);
    this.sources = sources.map((s) => new ContactInfoSourceDto(s));
    this.confidence_score = confidence_score;
    this.search_notes = search_notes;
    this.searched_at = searched_at;
    this.event_id = event_id;
  }

  /**
   * Lấy thông tin liên hệ chính
   */
  getPrimaryContactInfo() {
    return {
      event_title: this.event_title,
      event_location: this.event_location,
      organizer_found: this.organizer_found,
      contact_info: this.organizer_info.getPrimaryContactInfo(),
      confidence_score: this.confidence_score,
    };
  }

  /**
   * Lấy thông tin đầy đủ
   */
  getFullInfo() {
    return {
      event_title: this.event_title,
      event_location: this.event_location,
      organizer_found: this.organizer_found,
      organizer_info: this.organizer_info.getFullContactInfo(),
      sources: this.sources,
      confidence_score: this.confidence_score,
      search_notes: this.search_notes,
      searched_at: this.searched_at,
      event_id: this.event_id,
    };
  }
}

/**
 * BulkFindEventContactInfoRequestDto
 * Input DTO cho bulk search
 */
export class BulkFindEventContactInfoRequestDto {
  constructor({ events = [] }) {
    this.events = events.map((e) =>
      e instanceof FindEventContactInfoRequestDto
        ? e
        : FindEventContactInfoRequestDto.fromEventObject(e),
    );
  }

  validate() {
    if (!Array.isArray(this.events) || this.events.length === 0) {
      throw new Error("Events array is required and must not be empty");
    }

    this.events.forEach((event) => event.validate());
    return true;
  }
}

/**
 * BulkFindEventContactInfoResponseDto
 * Output DTO cho bulk search
 */
export class BulkFindEventContactInfoResponseDto {
  constructor({ results = [], total = 0, processed = 0, errors = [] }) {
    this.results = results.map((r) => new FindEventContactInfoResponseDto(r));
    this.total = total;
    this.processed = processed;
    this.failed = errors.length;
    this.errors = errors;
  }

  /**
   * Success rate
   */
  getSuccessRate() {
    return this.processed > 0 ? (this.processed / this.total) * 100 : 0;
  }
}
