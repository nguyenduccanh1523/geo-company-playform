import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from "typeorm";

/**
 * DEDUP LOG ENTITY
 * Ghi lại các merges/duplicates
 */
@Entity("dedup_logs")
@Index(["entity_type"])
@Index(["primary_id"])
@Index(["merged_id"])
export class DedupLog {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column("varchar", { length: 100 })
  entity_type: string; // company, person, event, hotel

  @Column("uuid")
  primary_id: string;

  @Column("uuid")
  merged_id: string;

  @Column("decimal", { precision: 5, scale: 4, nullable: true })
  match_score: number;

  @Column("text", { nullable: true })
  merge_reason: string;

  @Column("varchar", { length: 255, nullable: true })
  merged_by: string;

  @Column("uuid", { nullable: true })
  batch_id: string;

  @CreateDateColumn()
  created_at: Date;

  constructor(data?: Partial<DedupLog>) {
    if (data) {
      Object.assign(this, data);
    }
  }
}
