import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToMany,
  JoinTable,
} from "typeorm";
import { Company } from "../../company/entities/company.entity";
import { Hotel } from "../../hotel/entities/hotel.entity";

/**
 * EVENT ENTITY - TypeORM
 */
@Entity("events")
@Index(["lat", "lng"])
@Index(["start_date", "end_date"])
@Index(["eventbrite_event_id"])
export class Event {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column("varchar", { length: 500 })
  name: string;

  @Column("varchar", { length: 500, nullable: true })
  normalized_name: string;

  @Column("text", { nullable: true })
  description: string;

  @Column("varchar", { length: 100, nullable: true })
  event_type: string;

  @Column("varchar", { length: 255, nullable: true })
  organizer: string;

  @Column("varchar", { length: 255, nullable: true })
  organizer_email: string;

  @Column("varchar", { length: 20, nullable: true })
  organizer_phone: string;

  @Column("varchar", { length: 500, nullable: true })
  organizer_website: string;

  @Column("text")
  location: string;

  @Column("varchar", { length: 255, nullable: true })
  venue_name: string;

  @Column("decimal", { precision: 10, scale: 8 })
  lat: number;

  @Column("decimal", { precision: 11, scale: 8 })
  lng: number;

  @Column("varchar", { length: 500, nullable: true })
  url: string;

  @Column("jsonb", { nullable: true })
  sources: any;

  @Column("timestamp")
  start_date: Date;

  @Column("timestamp", { nullable: true })
  end_date: Date;

  @Column("varchar", { length: 255, nullable: true })
  eventbrite_event_id: string;

  @Column("varchar", { length: 100, nullable: true })
  external_source: string;

  @Column("varchar", { length: 255, nullable: true })
  external_id: string;

  @Column("varchar", { length: 50, default: "active" })
  status: string; // 'active', 'cancelled', 'completed'

  @Column("integer", { default: 0 })
  attendees_count: number;

  @Column("jsonb", { nullable: true })
  raw_data: any;

  @ManyToMany(() => Company, (company) => company.events)
  companies: Company[];

  @ManyToMany(() => Hotel, (hotel) => hotel.events)
  @JoinTable({
    name: "hotel_event",
    joinColumn: { name: "event_id", referencedColumnName: "id" },
    inverseJoinColumn: { name: "hotel_id", referencedColumnName: "id" },
  })
  hotels: Hotel[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  constructor(data?: Partial<Event>) {
    if (data) {
      Object.assign(this, data);
    }
  }

  /**
   * Business Methods
   */

  getCoordinates() {
    return { lat: this.lat, lng: this.lng };
  }

  isValid(): boolean {
    return (
      this.name && this.start_date && this.lat !== null && this.lng !== null
    );
  }

  isActive(): boolean {
    return this.status === "active";
  }

  isUpcoming(): boolean {
    return new Date(this.start_date) > new Date();
  }

  isOngoing(): boolean {
    const now = new Date();
    return new Date(this.start_date) <= now && now <= new Date(this.end_date);
  }

  isPast(): boolean {
    return new Date(this.end_date) < new Date();
  }

  getDuration(): number {
    const start = new Date(this.start_date);
    const end = new Date(this.end_date || new Date());
    return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60));
  }

  getDistance(lat: number, lng: number): number {
    const R = 6371; // km
    const dLat = ((lat - this.lat) * Math.PI) / 180;
    const dLon = ((lng - this.lng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((this.lat as any) * (Math.PI / 180)) *
        Math.cos((lat * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c * 100) / 100;
  }

  /**
   * Factory Methods
   */
  static fromDatabase(row: any): Event {
    return new Event(row);
  }

  static fromExternalSource(data: any, source: string): Event {
    return new Event({
      name: data.name,
      description: data.description,
      event_type: data.event_type || data.type,
      organizer: data.organizer || data.organization_name,
      location: data.location || data.address,
      lat: data.lat || data.latitude,
      lng: data.lng || data.longitude,
      url: data.url || data.link,
      start_date: new Date(data.start_date || data.start_time),
      end_date: data.end_date ? new Date(data.end_date) : undefined,
      eventbrite_event_id:
        source === "eventbrite" ? data.id : data.eventbrite_event_id,
      external_source: source,
      external_id: data.external_id || data.id,
      status: data.status || "active",
      attendees_count: data.attendees_count || 0,
      raw_data: data,
    });
  }
}
