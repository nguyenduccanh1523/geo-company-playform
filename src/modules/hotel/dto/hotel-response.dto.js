/**
 * HOTEL RESPONSE DTO
 *
 * Data Transfer Object for formatting hotel responses
 * Ensures consistent output format across all API endpoints
 */

export class HotelResponseDto {
  constructor(entity) {
    if (!entity) {
      throw new Error("Entity is required to create HotelResponseDto");
    }

    this.id = entity.id;
    this.name = entity.name;
    this.address = entity.address;
    this.coordinates = {
      lat: entity.lat ?? null,
      lng: entity.lng ?? null,
    };
    this.phone = entity.phone ?? null;
    this.email = entity.email ?? null;
    this.website = entity.website ?? null;
    this.rating = entity.rating ?? null;
    this.reviews_count = entity.reviews_count ?? 0;
    this.room_count = entity.room_count ?? null;
    this.status = entity.status ?? "active";
    this.created_at = entity.created_at;
    this.updated_at = entity.updated_at;
  }

  /**
   * Public-facing version (excludes sensitive data)
   */
  toPublic() {
    return {
      id: this.id,
      name: this.name,
      address: this.address,
      coordinates: this.coordinates,
      website: this.website,
      rating: this.rating,
      reviews_count: this.reviews_count,
    };
  }

  static from(entity) {
    return new HotelResponseDto(entity);
  }

  static fromArray(entities) {
    if (!Array.isArray(entities)) {
      return [];
    }
    return entities.map((entity) => HotelResponseDto.from(entity));
  }
}

/**
 * HOTEL WITH RELATED DATA DTO
 *
 * Extended DTO for detailed hotel information with nearby companies and events
 */
export class HotelDetailDto {
  constructor(entity, companies = [], events = []) {
    if (!entity) {
      throw new Error("Entity is required to create HotelDetailDto");
    }

    this.id = entity.id;
    this.name = entity.name;
    this.address = entity.address;
    this.coordinates = {
      lat: entity.lat ?? null,
      lng: entity.lng ?? null,
    };
    this.phone = entity.phone ?? null;
    this.email = entity.email ?? null;
    this.website = entity.website ?? null;
    this.rating = entity.rating ?? null;
    this.reviews_count = entity.reviews_count ?? 0;
    this.room_count = entity.room_count ?? null;
    this.status = entity.status ?? "active";
    this.description = entity.description ?? null;
    this.nearby_companies = Array.isArray(companies) ? companies : [];
    this.nearby_events = Array.isArray(events) ? events : [];
    this.created_at = entity.created_at;
    this.updated_at = entity.updated_at;
  }

  static from(entity, companies = [], events = []) {
    return new HotelDetailDto(entity, companies, events);
  }
}
