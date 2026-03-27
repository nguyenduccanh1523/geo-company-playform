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
import { Person } from "../../modules/person/entities/person.entity";

/**
 * COMPANY PERSON RELATIONSHIP
 * Mối quan hệ giữa công ty và người
 */
@Entity("company_people")
@Index(["company_id", "person_id"], { unique: true })
@Index(["company_id"])
@Index(["person_id"])
@Index(["is_primary_contact"])
export class CompanyPerson {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column("uuid")
  company_id: string;

  @ManyToOne(() => Company, { onDelete: "CASCADE" })
  @JoinColumn({ name: "company_id" })
  company: Company;

  @Column("uuid")
  person_id: string;

  @ManyToOne(() => Person, { onDelete: "CASCADE" })
  @JoinColumn({ name: "person_id" })
  person: Person;

  @Column("varchar", { length: 100, nullable: true })
  role: string;

  @Column("varchar", { length: 100, nullable: true })
  department: string;

  @Column("varchar", { length: 100, nullable: true })
  seniority: string;

  @Column("boolean", { default: false })
  is_primary_contact: boolean;

  @Column("boolean", { default: true })
  is_active: boolean;

  @Column("timestamp", { nullable: true })
  start_date: Date;

  @Column("timestamp", { nullable: true })
  end_date: Date;

  @Column("varchar", { length: 100, nullable: true })
  source_name: string;

  @Column("decimal", { precision: 5, scale: 4, nullable: true })
  confidence_score: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  constructor(data?: Partial<CompanyPerson>) {
    if (data) {
      Object.assign(this, data);
    }
  }
}
