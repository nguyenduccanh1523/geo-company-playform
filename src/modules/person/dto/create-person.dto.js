/**
 * CREATE PERSON DTO
 */

import { ValidationException } from "../../../shared/exceptions/base.exception.js";

export class CreatePersonDto {
  constructor(data) {
    this.first_name = data.first_name?.trim();
    this.last_name = data.last_name?.trim();
    this.email = data.email?.trim()?.toLowerCase();
    this.phone = data.phone?.trim();
    this.title = data.title?.trim();
    this.linkedin_url = data.linkedin_url?.trim();
    this.external_source = data.external_source || "manual";
    this.external_id = data.external_id;
    this.raw_data = data.raw_data || null;
  }

  validate() {
    const errors = {};

    if (!this.first_name) {
      errors.first_name = "First name is required";
    }

    if (!this.last_name) {
      errors.last_name = "Last name is required";
    }

    if (this.email && !this.isValidEmail(this.email)) {
      errors.email = "Invalid email format";
    }

    if (this.linkedin_url && !this.isValidLinkedInUrl(this.linkedin_url)) {
      errors.linkedin_url = "Invalid LinkedIn URL";
    }

    if (Object.keys(errors).length > 0) {
      throw new ValidationException(
        "INVALID_PERSON_DATA",
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

  isValidLinkedInUrl(url) {
    return url.includes("linkedin.com");
  }

  static from(data) {
    return new CreatePersonDto(data).validate();
  }

  toDatabase() {
    return {
      first_name: this.first_name,
      last_name: this.last_name,
      email: this.email || null,
      phone: this.phone || null,
      title: this.title || null,
      linkedin_url: this.linkedin_url || null,
      external_source: this.external_source,
      external_id: this.external_id,
      raw_data: this.raw_data,
    };
  }
}
