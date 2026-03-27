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
import { Event } from "../../modules/event/entities/event.entity";

/**
 * HOTEL EVENT RELATIONSHIP
 * Mối quan hệ giữa khách sạn và sự kiện
 */
@Entity("hotel_events")
@Index(["hotel_id", "event_id"], { unique: true })
@Index(["hotel_id"])
@Index(["event_id"])
export class HotelEvent {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column("uuid")
  hotel_id: string;

  @ManyToOne(() => Hotel, { onDelete: "CASCADE" })
  @JoinColumn({ name: "hotel_id" })
  hotel: Hotel;

  @Column("uuid")
  event_id: string;

  @ManyToOne(() => Event, { onDelete: "CASCADE" })
  @JoinColumn({ name: "event_id" })
  event: Event;

  @Column("varchar", { length: 100, nullable: true })
  relationship_type: string; // nearby, venue, recommended

  @Column("decimal", { precision: 8, scale: 2, nullable: true })
  distance_km: number;

  @Column("varchar", { length: 100, nullable: true })
  source_name: string;

  @Column("decimal", { precision: 5, scale: 4, nullable: true })
  confidence_score: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  constructor(data?: Partial<HotelEvent>) {
    if (data) {
      Object.assign(this, data);
    }
  }
}
