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
import { Person } from "../../person/entities/person.entity";

/**
 * COMPANY ENTITY - TypeORM
 * Đại diện cho 1 hàng trong bảng company
 *
 * ⭐ DEDUPLICATION STRATEGY:
 * 1. place_id UNIQUE - Chặn duplicate từ Google Places (chính xác nhất)
 * 2. Nếu place_id NULL → Dùng hotel_company relationship
 *    - UNIQUE(hotel_id, company_id) ngăn chặn duplicate qua khách sạn
 * 3. Khi thêm company → Check place_id trước (select by place_id + status != deleted)
 */
@Entity("companies")
@Index(["place_id"], { unique: true, where: "place_id IS NOT NULL" })
@Index(["external_id", "source_id"])
@Index(["status"])
export class Company {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column("varchar", { length: 255 })
  name!: string;

  @Column("varchar", { length: 255, nullable: true })
  normalized_name?: string;

  @Column("varchar", { length: 255, nullable: true })
  place_id?: string;

  @Column("varchar", { length: 100, nullable: true })
  industry?: string;

  @Column("text")
  address!: string;

  @Column("decimal", { precision: 10, scale: 8 })
  lat!: number;

  @Column("decimal", { precision: 11, scale: 8 })
  lng!: number;

  @Column("varchar", { length: 255, nullable: true })
  website?: string;

  @Column("varchar", { length: 255, nullable: true })
  email?: string;

  @Column("varchar", { length: 20, nullable: true })
  phone?: string;

  @Column("varchar", { length: 500, nullable: true })
  google_url?: string;

  @Column("decimal", { precision: 3, scale: 2, nullable: true })
  rating?: number;

  @Column("integer", { default: 0 })
  reviews_count!: number;

  @Column("varchar", { length: 100, nullable: true })
  business_status?: string;

  @Column("text", { nullable: true })
  description?: string;

  @Column("varchar", { length: 50, nullable: true })
  source_id?: string;

  @Column("varchar", { length: 255, nullable: true })
  external_id?: string;

  @Column("varchar", { length: 50, default: "active" })
  status!: string;

  @Column("uuid", { nullable: true })
  merged_into_id?: string;

  @Column("jsonb", { nullable: true })
  raw_data?: any;

  @ManyToMany(() => Event, (event) => event.companies)
  @JoinTable({
    name: "company_event",
    joinColumn: { name: "company_id", referencedColumnName: "id" },
    inverseJoinColumn: { name: "event_id", referencedColumnName: "id" },
  })
  events!: Event[];

  @ManyToMany(() => Person, (person) => person.companies)
  @JoinTable({
    name: "company_person",
    joinColumn: { name: "company_id", referencedColumnName: "id" },
    inverseJoinColumn: { name: "person_id", referencedColumnName: "id" },
  })
  people!: Person[];

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;

  constructor(data?: Partial<Company>) {
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

  /**
   * Check if this company is a duplicate
   * ⭐ Deduplication Logic:
   * 1. If has place_id → Check UNIQUE constraint (place_id)
   * 2. If NO place_id → Can only be detected via hotel_company relationship
   */
  isDuplicate(): boolean {
    // Không có place_id = không thể xác định duplicate chỉ từ company
    // Phải check qua hotel_company relationship
    if (!this.place_id) return false;

    return false; // Will be checked in repository via database
  }

  /**
   * Get deduplication key
   * - place_id nếu có (UNIQUE constraint sẽ chặn)
   * - null nếu không có place_id (phải dùng hotel_company để deduplicate)
   */
  getDeduplicationKey(): string | null {
    return this.place_id || null;
  }

  isValid(): boolean {
    return !!(
      this.name &&
      this.address &&
      this.lat !== null &&
      this.lng !== null
    );
  }

  isComplete(): boolean {
    return !!(
      this.isValid() &&
      this.website &&
      this.email &&
      this.phone &&
      this.description &&
      this.industry
    );
  }

  getAgeInDays(): number | null {
    if (!this.created_at) return null;
    return Math.floor(
      (new Date().getTime() - new Date(this.created_at).getTime()) /
        (1000 * 60 * 60 * 24),
    );
  }

  /**
   * Factory Methods
   */
  static fromDatabase(row: any): Company {
    return new Company(row);
  }

  static fromExternalSource(
    data: any,
    source: string,
    sourceId: string,
  ): Company {
    return new Company({
      name: data.name,
      industry: data.industry || null,
      address: data.address,
      lat: data.lat,
      lng: data.lng,
      website: data.website || null,
      email: data.email || null,
      phone: data.phone || null,
      description: data.description || null,
      source_id: source,
      external_id: data.external_id || data.id,
    });
  }
}
