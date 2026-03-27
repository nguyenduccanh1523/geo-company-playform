import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { Event } from "../../modules/event/entities/event.entity";
import { VectorBatch } from "./vector-batch.entity";

/**
 * EVENT VECTOR ENTITY
 * Lưu trữ embeddings cho events
 */
@Entity("event_vectors")
@Index(["event_id"])
@Index(["vector_batch_id"])
export class EventVector {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column("uuid")
  event_id: string;

  @ManyToOne(() => Event, { onDelete: "CASCADE" })
  @JoinColumn({ name: "event_id" })
  event: Event;

  @Column("uuid")
  vector_batch_id: string;

  @ManyToOne(() => VectorBatch, { onDelete: "CASCADE" })
  @JoinColumn({ name: "vector_batch_id" })
  batch: VectorBatch;

  @Column("text")
  embedding: string;

  @Column("text", { nullable: true })
  embedding_text: string;

  @CreateDateColumn()
  created_at: Date;

  constructor(data?: Partial<EventVector>) {
    if (data) {
      Object.assign(this, data);
    }
  }
}
