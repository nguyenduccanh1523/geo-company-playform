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

/**
 * PERSON ENTITY - TypeORM
 */
@Entity("people")
@Index(["email"])
@Index(["external_id", "external_source"])
export class Person {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column("varchar", { length: 100 })
  first_name: string;

  @Column("varchar", { length: 100 })
  last_name: string;

  @Column("varchar", { length: 255, nullable: true })
  full_name: string;

  @Column("varchar", { length: 255, nullable: true })
  normalized_full_name: string;

  @Column("varchar", { length: 255, nullable: true, unique: true })
  email: string;

  @Column("varchar", { length: 20, nullable: true })
  phone: string;

  @Column("varchar", { length: 20, nullable: true })
  mobile_phone: string;

  @Column("varchar", { length: 255, nullable: true })
  title: string;

  @Column("varchar", { length: 100, nullable: true })
  department: string;

  @Column("varchar", { length: 500, nullable: true })
  linkedin_url: string;

  @Column("varchar", { length: 100, nullable: true })
  external_source: string;

  @Column("varchar", { length: 255, nullable: true })
  external_id: string;

  @Column("varchar", { length: 50, default: "active" })
  status: string;

  @Column("text", { nullable: true })
  bio: string;

  @Column("jsonb", { nullable: true })
  raw_data: any;

  @ManyToMany(() => Company, (company) => company.people)
  companies: Company[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  constructor(data?: Partial<Person>) {
    if (data) {
      Object.assign(this, data);
    }
  }

  /**
   * Business Methods
   */

  getFullName(): string {
    return `${this.first_name} ${this.last_name}`.trim();
  }

  isValid(): boolean {
    return !!(this.first_name && this.last_name);
  }

  isActive(): boolean {
    return this.status === "active";
  }

  hasEmail(): boolean {
    return !!this.email;
  }

  hasPhone(): boolean {
    return !!this.phone;
  }

  hasLinkedIn(): boolean {
    return !!this.linkedin_url;
  }

  getLinkedInUsername(): string | null {
    if (!this.linkedin_url) return null;
    const match = this.linkedin_url.match(
      /(?:linkedin\.com\/in\/)?([a-zA-Z0-9-]+)/,
    );
    return match ? match[1] : null;
  }

  /**
   * Factory Methods
   */
  static fromDatabase(row: any): Person {
    return new Person(row);
  }

  static fromExternalSource(data: any, source: string): Person {
    return new Person({
      first_name: data.first_name || data.firstName || "",
      last_name: data.last_name || data.lastName || "",
      email: data.email || null,
      phone: data.phone || null,
      title: data.title || null,
      linkedin_url: data.linkedin_url || data.linkedinUrl || null,
      external_source: source,
      external_id: data.external_id || data.id,
      status: "active",
      raw_data: data,
    });
  }
}
