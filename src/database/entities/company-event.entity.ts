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
import { Company } from "../../modules/company/entities/company.entity";
import { Event } from "../../modules/event/entities/event.entity";

/**
 * COMPANY EVENT RELATIONSHIP
 * Mối quan hệ giữa công ty và sự kiện
 */
@Entity("company_events")
@Index(["company_id", "event_id", "role"], { unique: true })
@Index(["company_id"])
@Index(["event_id"])
@Index(["last_seen_at"])
export class CompanyEvent {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column("uuid")
  company_id: string;

  @ManyToOne(() => Company, { onDelete: "CASCADE" })
  @JoinColumn({ name: "company_id" })
  company: Company;

  @Column("uuid")
  event_id: string;

  @ManyToOne(() => Event, { onDelete: "CASCADE" })
  @JoinColumn({ name: "event_id" })
  event: Event;

  @Column("varchar", { length: 100, nullable: true })
  role: string; // exhibitor, sponsor, attendee, organizer, venue_partner

  @Column("varchar", { length: 100, default: "tentative" })
  status: string; // confirmed, inferred, tentative

  @Column("varchar", { length: 100, nullable: true })
  source_name: string;

  @Column("varchar", { length: 500, nullable: true })
  source_url: string;

  @Column("decimal", { precision: 5, scale: 4, nullable: true })
  confidence_score: number;

  @Column("timestamp", { nullable: true })
  first_seen_at: Date;

  @Column("timestamp", { nullable: true })
  last_seen_at: Date;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  constructor(data?: Partial<CompanyEvent>) {
    if (data) {
      Object.assign(this, data);
    }
  }
}
