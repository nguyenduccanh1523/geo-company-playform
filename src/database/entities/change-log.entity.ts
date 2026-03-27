import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from "typeorm";

/**
 * CHANGE LOG ENTITY
 * Ghi lại tất cả các thay đổi
 */
@Entity("change_logs")
@Index(["entity_type"])
@Index(["entity_id"])
@Index(["created_at"])
export class ChangeLog {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column("varchar", { length: 100 })
  entity_type: string;

  @Column("uuid")
  entity_id: string;

  @Column("varchar", { length: 100 })
  change_type: string; // create, update, merge, archive, restore

  @Column("jsonb", { nullable: true })
  changed_fields: any;

  @Column("jsonb", { nullable: true })
  old_values: any;

  @Column("jsonb", { nullable: true })
  new_values: any;

  @Column("varchar", { length: 100, nullable: true })
  source_name: string;

  @Column("uuid", { nullable: true })
  batch_id: string;

  @CreateDateColumn()
  created_at: Date;

  constructor(data?: Partial<ChangeLog>) {
    if (data) {
      Object.assign(this, data);
    }
  }
}
