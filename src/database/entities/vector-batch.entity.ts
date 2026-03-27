import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";

/**
 * VECTOR BATCH ENTITY
 * Theo dõi các batch tạo embeddings
 */
@Entity("vector_batches")
@Index(["model_name"])
@Index(["entity_type"])
@Index(["status"])
export class VectorBatch {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column("varchar", { length: 255 })
  model_name: string;

  @Column("varchar", { length: 100 })
  model_version: string;

  @Column("varchar", { length: 100 })
  entity_type: string; // company, person, event

  @Column("varchar", { length: 50, default: "pending" })
  status: string; // pending, generating, completed, failed

  @Column("timestamp", { nullable: true })
  started_at: Date;

  @Column("timestamp", { nullable: true })
  ended_at: Date;

  @Column("integer", { default: 0 })
  total_embeddings: number;

  @Column("integer", { default: 0 })
  successful_embeddings: number;

  @Column("integer", { default: 0 })
  failed_embeddings: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  constructor(data?: Partial<VectorBatch>) {
    if (data) {
      Object.assign(this, data);
    }
  }
}
