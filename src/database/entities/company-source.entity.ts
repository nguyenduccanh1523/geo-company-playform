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

/**
 * COMPANY SOURCE ENTITY
 * Lưu trữ thông tin từng nguồn cho company
 */
@Entity("company_sources")
@Index(["company_id"])
@Index(["source_name"])
@Index(["is_primary"])
export class CompanySource {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column("uuid")
  company_id: string;

  @ManyToOne(() => Company, { onDelete: "CASCADE" })
  @JoinColumn({ name: "company_id" })
  company: Company;

  @Column("varchar", { length: 100 })
  source_name: string; // google_maps, manual, internal_import, web_crawl

  @Column("varchar", { length: 255, nullable: true })
  source_record_id: string;

  @Column("varchar", { length: 500, nullable: true })
  source_url: string;

  @Column("varchar", { length: 255, nullable: true })
  name: string;

  @Column("varchar", { length: 100, nullable: true })
  industry: string;

  @Column("text", { nullable: true })
  address: string;

  @Column("decimal", { precision: 10, scale: 8, nullable: true })
  lat: number;

  @Column("decimal", { precision: 11, scale: 8, nullable: true })
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

  @Column("varchar", { length: 100, nullable: true })
  business_status: string;

  @Column("jsonb", { nullable: true })
  types: any;

  @Column("varchar", { length: 255, nullable: true })
  contact_person: string;

  @Column("varchar", { length: 20, nullable: true })
  contact_person_phone: string;

  @Column("jsonb", { nullable: true })
  business_hours: any;

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

  constructor(data?: Partial<CompanySource>) {
    if (data) {
      Object.assign(this, data);
    }
  }
}
