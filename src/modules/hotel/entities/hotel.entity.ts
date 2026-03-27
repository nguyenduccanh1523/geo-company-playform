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
import { Event } from "../../event/entities/event.entity";

/**
 * HOTEL ENTITY - TypeORM
 * Đại diện khách sạn - điểm gốc của hệ thống
 */
@Entity("hotels")
@Index(["lat", "lng"])
@Index(["external_id", "external_source"])
export class Hotel {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column("varchar", { length: 100, nullable: true })
  external_source: string;

  @Column("varchar", { length: 255, nullable: true })
  external_id: string;

  @Column("varchar", { length: 255 })
  name: string;

  @Column("text")
  address: string;

  @Column("decimal", { precision: 10, scale: 8 })
  lat: number;

  @Column("decimal", { precision: 11, scale: 8 })
  lng: number;

  @Column("varchar", { length: 20, nullable: true })
  phone: string;

  @Column("varchar", { length: 255, nullable: true })
  email: string;

  @Column("varchar", { length: 500, nullable: true })
  website: string;

  @Column("varchar", { length: 500, nullable: true })
  google_url: string;

  @Column("decimal", { precision: 3, scale: 2, nullable: true })
  rating: number;

  @Column("integer", { default: 0 })
  reviews_count: number;

  @Column("integer", { nullable: true })
  room_count: number;

  @Column("varchar", { length: 50, default: "active" })
  status: string; // 'active', 'inactive'

  @Column("text", { nullable: true })
  description: string;

  @Column("jsonb", { nullable: true })
  raw_data: any;

  @ManyToMany(() => Event, (event) => event.hotels)
  events: Event[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  constructor(data?: Partial<Hotel>) {
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
    return this.name && this.lat !== null && this.lng !== null;
  }

  isActive(): boolean {
    return this.status === "active";
  }

  getRating(): number | null {
    return this.rating ? parseFloat(this.rating.toString()) : null;
  }

  getDistance(lat: number, lng: number): number {
    // Haversine formula
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
  static fromDatabase(row: any): Hotel {
    return new Hotel(row);
  }

  static fromExternalSource(data: any, source: string): Hotel {
    return new Hotel({
      external_source: source,
      external_id: data.external_id || data.id,
      name: data.name,
      address: data.address,
      lat: data.lat,
      lng: data.lng,
      phone: data.phone || null,
      email: data.email || null,
      website: data.website || null,
      google_url: data.google_url || null,
      rating: data.rating || null,
      reviews_count: data.reviews_count || 0,
      room_count: data.room_count || null,
      status: "active",
      description: data.description || null,
      raw_data: data,
    });
  }
}
