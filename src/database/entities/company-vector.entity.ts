import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { Company } from "../../modules/company/entities/company.entity";
import { VectorBatch } from "./vector-batch.entity";

/**
 * COMPANY VECTOR ENTITY
 * Lưu trữ embeddings cho companies
 */
@Entity("company_vectors")
@Index(["company_id"])
@Index(["vector_batch_id"])
export class CompanyVector {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column("uuid")
  company_id: string;

  @ManyToOne(() => Company, { onDelete: "CASCADE" })
  @JoinColumn({ name: "company_id" })
  company: Company;

  @Column("uuid")
  vector_batch_id: string;

  @ManyToOne(() => VectorBatch, { onDelete: "CASCADE" })
  @JoinColumn({ name: "vector_batch_id" })
  batch: VectorBatch;

  @Column("text")
  embedding: string; // Vector in text format, hoặc dùng pgvector type

  @Column("text", { nullable: true })
  embedding_text: string;

  @CreateDateColumn()
  created_at: Date;

  constructor(data?: Partial<CompanyVector>) {
    if (data) {
      Object.assign(this, data);
    }
  }
}
