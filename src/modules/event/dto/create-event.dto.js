/**
 * CREATE EVENT DTO
 */

import { ValidationException } from "../../../shared/exceptions/base.exception.js";

export class CreateEventDto {
  constructor(data) {
    this.name = data.name?.trim();
    this.description = data.description?.trim();
    this.event_type = data.event_type || "other";
    this.organizer = data.organizer?.trim();
    this.location = data.location?.trim();
    this.lat = parseFloat(data.lat);
    this.lng = parseFloat(data.lng);
    this.start_date = new Date(data.start_date);
    this.end_date = new Date(data.end_date);
    this.url = data.url?.trim();
    this.eventbrite_event_id = data.eventbrite_event_id;
    this.external_source = data.external_source || "manual";
    this.external_id = data.external_id;
    this.attendees_count = data.attendees_count
      ? parseInt(data.attendees_count)
      : 0;
    this.raw_data = data.raw_data || null;
  }

  validate() {
    const errors = {};

    if (!this.name) {
      errors.name = "Event name is required";
    }

    if (!this.location) {
      errors.location = "Location is required";
    }

    if (!this.lat || isNaN(this.lat) || this.lat < -90 || this.lat > 90) {
      errors.lat = "Valid latitude between -90 and 90 is required";
    }

    if (!this.lng || isNaN(this.lng) || this.lng < -180 || this.lng > 180) {
      errors.lng = "Valid longitude between -180 and 180 is required";
    }

    if (!this.start_date || isNaN(this.start_date.getTime())) {
      errors.start_date = "Valid start date is required";
    }

    if (!this.end_date || isNaN(this.end_date.getTime())) {
      errors.end_date = "Valid end date is required";
    }

    if (this.start_date >= this.end_date) {
      errors.end_date = "End date must be after start date";
    }

    if (
      this.eventbrite_event_id &&
      !this.isValidEventbriteId(this.eventbrite_event_id)
    ) {
      errors.eventbrite_event_id = "Invalid Eventbrite ID format";
    }

    if (Object.keys(errors).length > 0) {
      throw new ValidationException(
        "INVALID_EVENT_DATA",
        "Validation failed",
        errors,
      );
    }

    return this;
  }

  isValidEventbriteId(id) {
    return /^\d+$/.test(id);
  }

  static from(data) {
    return new CreateEventDto(data).validate();
  }

  toDatabase() {
    return {
      name: this.name,
      description: this.description || null,
      event_type: this.event_type,
      organizer: this.organizer || null,
      location: this.location,
      lat: this.lat,
      lng: this.lng,
      start_date: this.start_date,
      end_date: this.end_date,
      url: this.url || null,
      eventbrite_event_id: this.eventbrite_event_id || null,
      external_source: this.external_source,
      external_id: this.external_id,
      attendees_count: this.attendees_count,
      raw_data: this.raw_data,
    };
  }
}
