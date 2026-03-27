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
import { Hotel } from "../../modules/hotel/entities/hotel.entity";
import { Company } from "../../modules/company/entities/company.entity";

/**
 * HOTEL COMPANY RELATIONSHIP
 * Mối quan hệ giữa khách sạn và công ty lân cận
 */
@Entity("hotel_companies")
@Index(["hotel_id", "company_id"], { unique: true })
@Index(["hotel_id"])
@Index(["company_id"])
@Index(["last_seen_at"])
export class HotelCompany {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column("uuid")
  hotel_id: string;

  @ManyToOne(() => Hotel, { onDelete: "CASCADE" })
  @JoinColumn({ name: "hotel_id" })
  hotel: Hotel;

  @Column("uuid")
  company_id: string;

  @ManyToOne(() => Company, { onDelete: "CASCADE" })
  @JoinColumn({ name: "company_id" })
  company: Company;

  @Column("varchar", { length: 100, default: "google_maps" })
  source_name: string; // google_maps, manual, import

  @Column("varchar", { length: 255, nullable: true })
  source_record_id: string;

  @Column("decimal", { precision: 8, scale: 2, nullable: true })
  distance_km: number;

  @Column("integer", { nullable: true })
  travel_time_minutes: number;

  @Column("integer", { nullable: true })
  bearing: number;

  @Column("varchar", { length: 100, default: "nearby" })
  relationship_type: string; // nearby, matched, preferred, visited

  @Column("decimal", { precision: 5, scale: 4, nullable: true })
  confidence_score: number;

  @Column("timestamp", { nullable: true })
  first_seen_at: Date;

  @Column("timestamp", { nullable: true })
  last_seen_at: Date;

  @Column("boolean", { default: true })
  is_active: boolean;

  @Column("text", { nullable: true })
  notes: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  constructor(data?: Partial<HotelCompany>) {
    if (data) {
      Object.assign(this, data);
    }
  }
}
