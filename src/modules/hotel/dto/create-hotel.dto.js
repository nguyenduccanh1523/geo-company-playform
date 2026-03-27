/**
 * CREATE HOTEL DTO
 */

import { ValidationException } from "../../../shared/exceptions/base.exception.js";

export class CreateHotelDto {
  constructor(data) {
    this.external_source = data.external_source || "manual";
    this.external_id = data.external_id;
    this.name = data.name?.trim();
    this.address = data.address?.trim();
    this.lat = parseFloat(data.lat);
    this.lng = parseFloat(data.lng);
    this.phone = data.phone?.trim();
    this.email = data.email?.trim();
    this.website = data.website?.trim();
    this.google_url = data.google_url?.trim();
    this.rating = data.rating ? parseFloat(data.rating) : null;
    this.reviews_count = data.reviews_count ? parseInt(data.reviews_count) : 0;
    this.room_count = data.room_count ? parseInt(data.room_count) : null;
    this.description = data.description?.trim();
    this.raw_data = data.raw_data || null;
  }

  validate() {
    const errors = {};

    if (!this.name) {
      errors.name = "Hotel name is required";
    }

    if (!this.address) {
      errors.address = "Address is required";
    }

    if (!this.lat || isNaN(this.lat) || this.lat < -90 || this.lat > 90) {
      errors.lat = "Valid latitude between -90 and 90 is required";
    }

    if (!this.lng || isNaN(this.lng) || this.lng < -180 || this.lng > 180) {
      errors.lng = "Valid longitude between -180 and 180 is required";
    }

    if (this.rating && (this.rating < 0 || this.rating > 5)) {
      errors.rating = "Rating must be between 0 and 5";
    }

    if (this.email && !this.isValidEmail(this.email)) {
      errors.email = "Invalid email format";
    }

    if (Object.keys(errors).length > 0) {
      throw new ValidationException(
        "INVALID_HOTEL_DATA",
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

  static from(data) {
    return new CreateHotelDto(data).validate();
  }

  toDatabase() {
    return {
      external_source: this.external_source,
      external_id: this.external_id,
      name: this.name,
      address: this.address,
      lat: this.lat,
      lng: this.lng,
      phone: this.phone,
      email: this.email,
      website: this.website,
      google_url: this.google_url,
      rating: this.rating,
      reviews_count: this.reviews_count,
      room_count: this.room_count,
      description: this.description,
      raw_data: this.raw_data,
    };
  }
}
