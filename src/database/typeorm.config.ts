import "reflect-metadata";
import { DataSource } from "typeorm";
import * as dotenv from "dotenv";
// Core entities
import { Company } from "../modules/company/entities/company.entity";
import { Event } from "../modules/event/entities/event.entity";
import { Person } from "../modules/person/entities/person.entity";
import { Hotel } from "../modules/hotel/entities/hotel.entity";
// Crawl entities
import { CrawlBatch } from "../modules/crawl-batch/entities/crawl-batch.entity";
import { CrawlItem } from "./entities/crawl-item.entity";
// Source entities
import { CompanySource } from "./entities/company-source.entity";
import { EventSource } from "./entities/event-source.entity";
// Relationship entities
import { HotelCompany } from "./entities/hotel-company.entity";
import { CompanyPerson } from "./entities/company-person.entity";
import { CompanyEvent } from "./entities/company-event.entity";
import { HotelEvent } from "./entities/hotel-event.entity";
// Vector entities
import { VectorBatch } from "./entities/vector-batch.entity";
import { CompanyVector } from "./entities/company-vector.entity";
import { EventVector } from "./entities/event-vector.entity";
import { PersonVector } from "./entities/person-vector.entity";
// Audit entities
import { DedupLog } from "./entities/dedup-log.entity";
import { ChangeLog } from "./entities/change-log.entity";
import { DataQualityReport } from "./entities/data-quality-report.entity";

dotenv.config();

/**
 * TypeORM AppDataSource Configuration
 * Cấu hình kết nối PostgreSQL
 */
const AppDataSource = new DataSource({
  type: "postgres",
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432"),
  username: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "postgres",
  database: process.env.DB_NAME || "geo_company_db",

  // Entities
  entities: [
    // Core
    Company,
    Event,
    Person,
    Hotel,
    // Crawl
    CrawlBatch,
    CrawlItem,
    // Source
    CompanySource,
    EventSource,
    // Relationships
    HotelCompany,
    CompanyPerson,
    CompanyEvent,
    HotelEvent,
    // Vectors
    VectorBatch,
    CompanyVector,
    EventVector,
    PersonVector,
    // Audit
    DedupLog,
    ChangeLog,
    DataQualityReport,
  ],

  // Migrations
  migrations: ["src/database/migrations/*.ts"],

  // Settings
  synchronize: false, // Không tự động đồng bộ, sử dụng migrations
  logging: ["query", "error", "warn"],
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
});

export default AppDataSource;
