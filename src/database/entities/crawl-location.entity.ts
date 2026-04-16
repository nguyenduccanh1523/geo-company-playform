/**
 * CRAWL LOCATION ENTITY
 * Lưu trữ thông tin các vị trí đã được crawl để tránh duplicate queries
 * Sử dụng cho PredictHQ API events search
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";

@Entity("crawl_locations")
@Index(["lat", "lng", "radius_km", "source"], { unique: true })
@Index(["source"])
@Index(["last_crawl_at"])
export class CrawlLocation {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column("decimal", { precision: 10, scale: 8 })
  lat: number;

  @Column("decimal", { precision: 11, scale: 8 })
  lng: number;

  @Column("decimal", { precision: 10, scale: 2 })
  radius_km: number;

  @Column("varchar", { length: 100 })
  source: string; // 'predicthq', 'eventbrite', etc.

  @Column("uuid", { nullable: true })
  hotel_id: string; // Reference to hotel

  @Column("varchar", { length: 255, nullable: true })
  location_name: string;

  @Column("integer", { default: 0 })
  events_found: number;

  @Column("jsonb", { nullable: true })
  filters: any;

  @Column("timestamp")
  last_crawl_at: Date;

  @Column("integer", { default: 0 })
  crawl_count: number;

  @Column("varchar", { length: 50, default: "success" })
  status: string; // 'success', 'failed', 'partial'

  @Column("text", { nullable: true })
  error_message: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  constructor(data?: Partial<CrawlLocation>) {
    if (data) {
      Object.assign(this, data);
    }
  }

  /**
   * Check xem crawl location này có expired không (mặc định 7 ngày)
   */
  isExpired(daysThreshold: number = 7): boolean {
    const now = new Date();
    const lastCrawl = new Date(this.last_crawl_at);
    const diffDays = (now.getTime() - lastCrawl.getTime()) / (1000 * 3600 * 24);
    return diffDays > daysThreshold;
  }

  hasBeenCrawled(): boolean {
    return this.crawl_count > 0;
  }
}
