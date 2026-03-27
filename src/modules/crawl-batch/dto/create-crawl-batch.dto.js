/**
 * CREATE CRAWL BATCH DTO
 */

import { ValidationException } from "../../../shared/exceptions/base.exception.js";

export class CreateCrawlBatchDto {
  constructor(data) {
    this.source = data.source?.trim();
    this.entity_type = data.entity_type?.trim();
    this.config = data.config || {};
    this.total_items = data.total_items ? parseInt(data.total_items) : 0;
  }

  validate() {
    const errors = {};

    if (!this.source) {
      errors.source =
        "Source is required (e.g., eventbrite, google_places, predictHq)";
    }

    if (!this.entity_type) {
      errors.entity_type =
        "Entity type is required (e.g., hotel, company, event)";
    }

    const validEntityTypes = ["hotel", "company", "event", "person"];
    if (this.entity_type && !validEntityTypes.includes(this.entity_type)) {
      errors.entity_type = `Entity type must be one of: ${validEntityTypes.join(", ")}`;
    }

    const validSources = [
      "eventbrite",
      "google_places",
      "predictHq",
      "manual",
      "linkedin",
      "other",
    ];
    if (this.source && !validSources.includes(this.source)) {
      errors.source = `Source must be one of: ${validSources.join(", ")}`;
    }

    if (Object.keys(errors).length > 0) {
      throw new ValidationException(
        "INVALID_CRAWL_BATCH_DATA",
        "Validation failed",
        errors,
      );
    }

    return this;
  }

  static from(data) {
    return new CreateCrawlBatchDto(data).validate();
  }

  toDatabase() {
    return {
      source: this.source,
      entity_type: this.entity_type,
      total_items: this.total_items,
      status: "pending",
      successful_items: 0,
      failed_items: 0,
      duplicate_items: 0,
      config: JSON.stringify(this.config),
    };
  }
}
