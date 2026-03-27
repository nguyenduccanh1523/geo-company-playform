/**
 * PERSON RESPONSE DTO
 */

export class PersonResponseDto {
  constructor(entity) {
    this.id = entity.id;
    this.first_name = entity.first_name;
    this.last_name = entity.last_name;
    this.email = entity.email;
    this.phone = entity.phone;
    this.title = entity.title;
    this.status = entity.status;
    this.created_at = entity.created_at;
    this.updated_at = entity.updated_at;
  }

  getFullName() {
    return `${this.first_name} ${this.last_name}`.trim();
  }

  toPublic() {
    return {
      id: this.id,
      name: this.getFullName(),
      title: this.title,
      email: this.email,
    };
  }

  static from(entity) {
    return new PersonResponseDto(entity);
  }

  static fromArray(entities) {
    return entities.map((entity) => PersonResponseDto.from(entity));
  }
}

/**
 * PERSON WITH RELATED DATA DTO
 */
export class PersonDetailDto {
  constructor(entity, companies = []) {
    this.id = entity.id;
    this.first_name = entity.first_name;
    this.last_name = entity.last_name;
    this.email = entity.email;
    this.phone = entity.phone;
    this.title = entity.title;
    this.linkedin_url = entity.linkedin_url;
    this.status = entity.status;
    this.companies = companies;
    this.created_at = entity.created_at;
    this.updated_at = entity.updated_at;
  }

  getFullName() {
    return `${this.first_name} ${this.last_name}`.trim();
  }

  static from(entity, companies = []) {
    return new PersonDetailDto(entity, companies);
  }
}
