import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { Person } from "../../modules/person/entities/person.entity";
import { VectorBatch } from "./vector-batch.entity";

/**
 * PERSON VECTOR ENTITY
 * Lưu trữ embeddings cho persons
 */
@Entity("person_vectors")
@Index(["person_id"])
@Index(["vector_batch_id"])
export class PersonVector {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column("uuid")
  person_id: string;

  @ManyToOne(() => Person, { onDelete: "CASCADE" })
  @JoinColumn({ name: "person_id" })
  person: Person;

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

  constructor(data?: Partial<PersonVector>) {
    if (data) {
      Object.assign(this, data);
    }
  }
}
