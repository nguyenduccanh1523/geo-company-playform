/**
 * CRAWL BATCH RESPONSE DTO
 */

export class CrawlBatchResponseDto {
  constructor(entity) {
    this.id = entity.id;
    this.source = entity.source;
    this.entity_type = entity.entity_type;
    this.status = entity.status;
    this.total_items = entity.total_items;
    this.successful_items = entity.successful_items;
    this.failed_items = entity.failed_items;
    this.duplicate_items = entity.duplicate_items;
    this.config = entity.config;
    this.started_at = entity.started_at;
    this.completed_at = entity.completed_at;
    this.error_message = entity.error_message;
    this.created_at = entity.created_at;
    this.updated_at = entity.updated_at;
  }

  getStatistics() {
    const total = this.total_items || 0;
    return {
      total_items: this.total_items,
      successful_items: this.successful_items,
      failed_items: this.failed_items,
      duplicate_items: this.duplicate_items,
      success_rate:
        total > 0 ? Math.round((this.successful_items / total) * 100) : 0,
      failure_rate:
        total > 0 ? Math.round((this.failed_items / total) * 100) : 0,
      duplicate_rate:
        total > 0 ? Math.round((this.duplicate_items / total) * 100) : 0,
    };
  }

  toPublic() {
    return {
      id: this.id,
      source: this.source,
      entity_type: this.entity_type,
      status: this.status,
      statistics: this.getStatistics(),
      completed_at: this.completed_at,
    };
  }

  static from(entity) {
    return new CrawlBatchResponseDto(entity);
  }

  static fromArray(entities) {
    return entities.map((entity) => CrawlBatchResponseDto.from(entity));
  }
}
