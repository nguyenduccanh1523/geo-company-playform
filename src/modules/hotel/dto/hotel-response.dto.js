/**
 * HOTEL RESPONSE DTO
 */

export class HotelResponseDto {
  constructor(entity) {
    this.id = entity.id;
    this.name = entity.name;
    this.address = entity.address;
    this.coordinates = {
      lat: entity.lat,
      lng: entity.lng,
    };
    this.phone = entity.phone;
    this.email = entity.email;
    this.website = entity.website;
    this.rating = entity.rating;
    this.reviews_count = entity.reviews_count;
    this.room_count = entity.room_count;
    this.status = entity.status;
    this.created_at = entity.created_at;
    this.updated_at = entity.updated_at;
  }

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
    return entities.map((entity) => HotelResponseDto.from(entity));
  }
}

/**
 * HOTEL WITH RELATED DATA DTO
 */
export class HotelDetailDto {
  constructor(entity, companies = [], events = []) {
    this.id = entity.id;
    this.name = entity.name;
    this.address = entity.address;
    this.coordinates = {
      lat: entity.lat,
      lng: entity.lng,
    };
    this.phone = entity.phone;
    this.email = entity.email;
    this.website = entity.website;
    this.rating = entity.rating;
    this.reviews_count = entity.reviews_count;
    this.room_count = entity.room_count;
    this.status = entity.status;
    this.description = entity.description;
    this.nearby_companies = companies;
    this.nearby_events = events;
    this.created_at = entity.created_at;
    this.updated_at = entity.updated_at;
  }

  static from(entity, companies = [], events = []) {
    return new HotelDetailDto(entity, companies, events);
  }
}
