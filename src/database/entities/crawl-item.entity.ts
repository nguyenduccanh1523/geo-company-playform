import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { CrawlBatch } from "../../modules/crawl-batch/entities/crawl-batch.entity";

/**
 * CRAWL ITEM ENTITY
 * Chi tiết từng item trong batch crawl
 */
@Entity("crawl_items")
@Index(["batch_id"])
@Index(["entity_type"])
@Index(["status"])
@Index(["batch_id", "status"])
export class CrawlItem {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column("uuid")
  batch_id: string;

  @ManyToOne(() => CrawlBatch)
  @JoinColumn({ name: "batch_id" })
  batch: CrawlBatch;

  @Column("varchar", { length: 100 })
  entity_type: string; // hotel, company, person, event, relation

  @Column("varchar", { length: 255, nullable: true })
  external_id: string;

  @Column("varchar", { length: 100, nullable: true })
  source_name: string;

  @Column("uuid", { nullable: true })
  entity_id: string;

  @Column("varchar", { length: 50, default: "pending" })
  status: string; // pending, success, failed, duplicate, skipped

  @Column("varchar", { length: 100, nullable: true })
  error_code: string;

  @Column("text", { nullable: true })
  error_message: string;

  @Column("integer", { default: 0 })
  retry_count: number;

  @Column("jsonb", { nullable: true })
  raw_data: any;

  @CreateDateColumn()
  created_at: Date;

  constructor(data?: Partial<CrawlItem>) {
    if (data) {
      Object.assign(this, data);
    }
  }
}
