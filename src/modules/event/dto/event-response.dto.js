/**
 * EVENT RESPONSE DTO
 */

export class EventResponseDto {
  constructor(entity) {
    this.id = entity.id;
    this.name = entity.name;
    this.description = entity.description;
    this.event_type = entity.event_type;
    this.organizer = entity.organizer;
    this.location = entity.location;
    this.coordinates = {
      lat: entity.lat,
      lng: entity.lng,
    };
    this.start_date = entity.start_date;
    this.end_date = entity.end_date;
    this.url = entity.url;
    this.attendees_count = entity.attendees_count;
    this.status = entity.status;
    this.created_at = entity.created_at;
    this.updated_at = entity.updated_at;
  }

  toPublic() {
    return {
      id: this.id,
      name: this.name,
      event_type: this.event_type,
      location: this.location,
      coordinates: this.coordinates,
      start_date: this.start_date,
      end_date: this.end_date,
      url: this.url,
    };
  }

  static from(entity) {
    return new EventResponseDto(entity);
  }

  static fromArray(entities) {
    return entities.map((entity) => EventResponseDto.from(entity));
  }
}

/**
 * EVENT WITH RELATED DATA DTO
 */
export class EventDetailDto {
  constructor(entity, companies = []) {
    this.id = entity.id;
    this.name = entity.name;
    this.description = entity.description;
    this.event_type = entity.event_type;
    this.organizer = entity.organizer;
    this.location = entity.location;
    this.coordinates = {
      lat: entity.lat,
      lng: entity.lng,
    };
    this.start_date = entity.start_date;
    this.end_date = entity.end_date;
    this.url = entity.url;
    this.attendees_count = entity.attendees_count;
    this.status = entity.status;
    this.related_companies = companies;
    this.created_at = entity.created_at;
    this.updated_at = entity.updated_at;
  }

  static from(entity, companies = []) {
    return new EventDetailDto(entity, companies);
  }
}
