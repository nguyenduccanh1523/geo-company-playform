import { MigrationInterface, QueryRunner } from "typeorm";

export class AddHotelCompaniesIndexes1774100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Index for fast queries by hotel_id
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_hotel_companies_hotel_id 
       ON hotel_companies(hotel_id)`,
    );

    // Composite index for hotel_id + created_at (for sorting)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_hotel_companies_hotel_created 
       ON hotel_companies(hotel_id, created_at DESC)`,
    );

    // Composite index for hotel_id + distance (for distance sorting)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_hotel_companies_hotel_distance 
       ON hotel_companies(hotel_id, distance_km ASC)`,
    );

    // Index on companies for text search
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_companies_name_gin 
       ON companies USING GIN(to_tsvector('english', name))`,
    );

    // Index on companies address for text search
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_companies_address_gin 
       ON companies USING GIN(to_tsvector('english', address))`,
    );

    // Index on rating for sorting
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_companies_rating 
       ON companies(rating DESC NULLS LAST)`,
    );

    // Index on place_id for duplicate checking
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_companies_place_id 
       ON companies(place_id)`,
    );

    // Index on created_at for time-based queries
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_companies_created_at 
       ON companies(created_at DESC)`,
    );

    // Index on source_id for filtering by source
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_companies_source_id 
       ON companies(source_id)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_hotel_companies_hotel_id`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_hotel_companies_hotel_created`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_hotel_companies_hotel_distance`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS idx_companies_name_gin`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_companies_address_gin`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_companies_rating`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_companies_place_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_companies_created_at`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_companies_source_id`);
  }
}
