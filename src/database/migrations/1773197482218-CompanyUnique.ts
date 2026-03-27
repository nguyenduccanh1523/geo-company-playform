import { MigrationInterface, QueryRunner } from "typeorm";

export class CompanyUnique1773197482218 implements MigrationInterface {
    name = 'CompanyUnique1773197482218'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_857516ddc99f1f2adb9a20504a"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_d0448495a97bde88ba93d8e0d4"`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_d690d80280c113b545770351b6" ON "companies" ("place_id") WHERE place_id IS NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_d690d80280c113b545770351b6"`);
        await queryRunner.query(`CREATE INDEX "IDX_d0448495a97bde88ba93d8e0d4" ON "companies" ("lat", "lng") `);
        await queryRunner.query(`CREATE INDEX "IDX_857516ddc99f1f2adb9a20504a" ON "companies" ("place_id") `);
    }

}
