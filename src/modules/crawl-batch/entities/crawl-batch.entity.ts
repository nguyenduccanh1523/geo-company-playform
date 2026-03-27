import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from "typeorm";

/**
 * CRAWL BATCH ENTITY - TypeORM
 * Theo dõi các batch crawl/import
 */
@Entity("crawl_batches")
@Index(["source_name"])
@Index(["status"])
@Index(["entity_type"])
export class CrawlBatch {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column("bigint", { unique: true })
  batch_number: number;

  @Column("varchar", { length: 255, nullable: true })
  name: string;

  @Column("varchar", { length: 100 })
  source_name: string; // google_maps, event_site, import, enrichment

  @Column("varchar", { length: 100 })
  entity_type: string; // hotel, company, person, event, mixed

  @Column("varchar", { length: 50, default: "pending" })
  status: string; // pending, running, completed, failed, partial

  @Column("timestamp", { nullable: true })
  started_at: Date;

  @Column("timestamp", { nullable: true })
  ended_at: Date;

  @Column("integer", { nullable: true })
  duration_seconds: number;

  @Column("integer", { default: 0 })
  total_items: number;

  @Column("integer", { default: 0 })
  successful_items: number;

  @Column("integer", { default: 0 })
  failed_items: number;

  @Column("integer", { default: 0 })
  skipped_items: number;

  @Column("integer", { default: 0 })
  duplicate_items: number;

  @Column("jsonb", { nullable: true })
  config_snapshot: any;

  @Column("text", { nullable: true })
  error_summary: string;

  @CreateDateColumn()
  created_at: Date;

  constructor(data?: Partial<CrawlBatch>) {
    if (data) {
      Object.assign(this, data);
    }
  }
}
