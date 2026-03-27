/**
 * CREATE COMPANY DTO
 *
 * Định thức dữ liệu khi tạo company mới
 */

import { ValidationException } from "../../../shared/exceptions/base.exception.js";

export class CreateCompanyDto {
  constructor(data) {
    this.name = data.name?.trim();
    this.industry = data.industry?.trim();
    this.address = data.address?.trim();
    this.lat = parseFloat(data.lat);
    this.lng = parseFloat(data.lng);
    this.website = data.website?.trim();
    this.email = data.email?.trim();
    this.phone = data.phone?.trim();
    this.description = data.description?.trim();
    this.sourceId = data.sourceId; // UUID
  }

  /**
   * Validate DTO
   */
  validate() {
    const errors = {};

    // Required fields
    if (!this.name) {
      errors.name = "Company name is required";
    }

    if (!this.address) {
      errors.address = "Address is required";
    }

    if (!this.lat || isNaN(this.lat)) {
      errors.lat = "Valid latitude is required";
    }

    if (!this.lng || isNaN(this.lng)) {
      errors.lng = "Valid longitude is required";
    }

    // Location bounds check
    if (this.lat < -90 || this.lat > 90) {
      errors.lat = "Latitude must be between -90 and 90";
    }

    if (this.lng < -180 || this.lng > 180) {
      errors.lng = "Longitude must be between -180 and 180";
    }

    // Email format
    if (this.email && !this.isValidEmail(this.email)) {
      errors.email = "Invalid email format";
    }

    // Phone format (basic check)
    if (this.phone && this.phone.length < 5) {
      errors.phone = "Phone number too short";
    }

    if (Object.keys(errors).length > 0) {
      throw new ValidationException(
        "INVALID_COMPANY_DATA",
        "Validation failed",
        errors,
      );
    }

    return this;
  }

  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Static factory method
   */
  static from(data) {
    return new CreateCompanyDto(data).validate();
  }

  /**
   * Chuyển sang object để insert vào database
   */
  toDatabase() {
    return {
      name: this.name,
      industry: this.industry,
      address: this.address,
      lat: this.lat,
      lng: this.lng,
      website: this.website,
      email: this.email,
      phone: this.phone,
      description: this.description,
      source_id: this.sourceId,
    };
  }
}
