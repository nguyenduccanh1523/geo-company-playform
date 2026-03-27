import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from "typeorm";

/**
 * DATA QUALITY REPORT ENTITY
 * Báo cáo chất lượng dữ liệu
 */
@Entity("data_quality_reports")
@Index(["batch_id"])
@Index(["entity_type"])
@Index(["created_at"])
export class DataQualityReport {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column("uuid")
  batch_id: string;

  @Column("varchar", { length: 100, nullable: true })
  entity_type: string;

  @Column("decimal", { precision: 5, scale: 4, nullable: true })
  overall_score: number;

  @Column("jsonb", { nullable: true })
  metrics: any;

  @Column("jsonb", { nullable: true })
  issues: any;

  @Column("varchar", { length: 50, nullable: true })
  status: string; // excellent, good, acceptable, poor

  @CreateDateColumn()
  created_at: Date;

  constructor(data?: Partial<DataQualityReport>) {
    if (data) {
      Object.assign(this, data);
    }
  }
}
