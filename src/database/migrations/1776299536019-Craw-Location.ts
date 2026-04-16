import { MigrationInterface, QueryRunner } from "typeorm";

export class CrawLocation1776299536019 implements MigrationInterface {
    name = 'CrawLocation1776299536019'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."idx_companies_rating"`);
        await queryRunner.query(`DROP INDEX "public"."idx_companies_place_id"`);
        await queryRunner.query(`DROP INDEX "public"."idx_companies_created_at"`);
        await queryRunner.query(`DROP INDEX "public"."idx_companies_source_id"`);
        await queryRunner.query(`DROP INDEX "public"."idx_hotel_companies_hotel_id"`);
        await queryRunner.query(`DROP INDEX "public"."idx_hotel_companies_hotel_created"`);
        await queryRunner.query(`DROP INDEX "public"."idx_hotel_companies_hotel_distance"`);
        await queryRunner.query(`CREATE TABLE "crawl_locations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "lat" numeric(10,8) NOT NULL, "lng" numeric(11,8) NOT NULL, "radius_km" numeric(10,2) NOT NULL, "source" character varying(100) NOT NULL, "hotel_id" uuid, "location_name" character varying(255), "events_found" integer NOT NULL DEFAULT '0', "filters" jsonb, "last_crawl_at" TIMESTAMP NOT NULL, "crawl_count" integer NOT NULL DEFAULT '0', "status" character varying(50) NOT NULL DEFAULT 'success', "error_message" text, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_d536115e1327f9a3d5e3eff9cbf" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_3fccc1c03589f56b02bc923203" ON "crawl_locations" ("last_crawl_at") `);
        await queryRunner.query(`CREATE INDEX "IDX_7a0d973cd7453d88e6f0b23001" ON "crawl_locations" ("source") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_11937adf0eada3e854c0c4e589" ON "crawl_locations" ("lat", "lng", "radius_km", "source") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_11937adf0eada3e854c0c4e589"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_7a0d973cd7453d88e6f0b23001"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_3fccc1c03589f56b02bc923203"`);
        await queryRunner.query(`DROP TABLE "crawl_locations"`);
        await queryRunner.query(`CREATE INDEX "idx_hotel_companies_hotel_distance" ON "hotel_companies" ("hotel_id", "distance_km") `);
        await queryRunner.query(`CREATE INDEX "idx_hotel_companies_hotel_created" ON "hotel_companies" ("hotel_id", "created_at") `);
        await queryRunner.query(`CREATE INDEX "idx_hotel_companies_hotel_id" ON "hotel_companies" ("hotel_id") `);
        await queryRunner.query(`CREATE INDEX "idx_companies_source_id" ON "companies" ("source_id") `);
        await queryRunner.query(`CREATE INDEX "idx_companies_created_at" ON "companies" ("created_at") `);
        await queryRunner.query(`CREATE INDEX "idx_companies_place_id" ON "companies" ("place_id") `);
        await queryRunner.query(`CREATE INDEX "idx_companies_rating" ON "companies" ("rating") `);
    }

}
