/**
 * COMPANY RESPONSE DTO
 *
 * Định thức dữ liệu response trả về cho client
 */

export class CompanyResponseDto {
  constructor(entity) {
    this.id = entity.id;
    this.place_id = entity.place_id;
    this.name = entity.name;
    this.industry = entity.industry;
    this.address = entity.address;
    this.coordinates = {
      lat: entity.lat,
      lng: entity.lng,
    };
    this.website = entity.website;
    this.email = entity.email;
    this.phone = entity.phone;
    this.google_url = entity.google_url;
    this.rating = entity.rating;
    this.reviews_count = entity.reviews_count;
    this.business_status = entity.business_status;
    this.description = entity.description;
    this.external_id = entity.external_id;
    this.source_id = entity.source_id;
    this.status = entity.status;
    this.raw_data = entity.raw_data; // ✅ Include raw_data
    this.createdAt = entity.created_at;
    this.updatedAt = entity.updated_at;
  }

  /**
   * Chỉ lấy các field cần thiết (exclude sensitive data)
   */
  toPublic() {
    return {
      id: this.id,
      name: this.name,
      industry: this.industry,
      address: this.address,
      coordinates: this.coordinates,
      website: this.website,
      createdAt: this.createdAt,
    };
  }

  /**
   * Factory method
   */
  static from(entity) {
    return new CompanyResponseDto(entity);
  }

  /**
   * Array mapping
   */
  static fromArray(entities) {
    return entities.map((entity) => CompanyResponseDto.from(entity));
  }
}
