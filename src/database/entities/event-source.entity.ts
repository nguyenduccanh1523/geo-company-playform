import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { Event } from "../../modules/event/entities/event.entity";

/**
 * EVENT SOURCE ENTITY
 * Lưu trữ thông tin từng nguồn cho event
 */
@Entity("event_sources")
@Index(["event_id"])
@Index(["source_name"])
@Index(["is_primary"])
export class EventSource {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column("uuid")
  event_id: string;

  @ManyToOne(() => Event, { onDelete: "CASCADE" })
  @JoinColumn({ name: "event_id" })
  event: Event;

  @Column("varchar", { length: 100 })
  source_name: string;

  @Column("varchar", { length: 255, nullable: true })
  source_record_id: string;

  @Column("varchar", { length: 500, nullable: true })
  source_url: string;

  @Column("varchar", { length: 100, nullable: true })
  company_role: string; // exhibitor, sponsor, attendee, organizer

  @Column("varchar", { length: 255, nullable: true })
  organizer: string;

  @Column("varchar", { length: 255, nullable: true })
  organizer_email: string;

  @Column("varchar", { length: 20, nullable: true })
  organizer_phone: string;

  @Column("varchar", { length: 500, nullable: true })
  organizer_website: string;

  @Column("timestamp", { nullable: true })
  fetched_at: Date;

  @Column("boolean", { default: false })
  is_primary: boolean;

  @Column("jsonb", { nullable: true })
  raw_data: any;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  constructor(data?: Partial<EventSource>) {
    if (data) {
      Object.assign(this, data);
    }
  }
}
