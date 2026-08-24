import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * AI CRM Customer 360：crm_opportunities（销售机会）表。
 * 双驱动：postgres（SERIAL + 内联 FK）先建并 return；sqlite（AUTOINCREMENT + 临时表重建补 FK）。
 * 索引/FK 约束名取自 migration:generate 输出（TypeORM hash 名，避免一致性漂移）。
 */
export class AddCrmOpportunity1787548027821 implements MigrationInterface {
    name = 'AddCrmOpportunity1787548027821'

    public async up(queryRunner: QueryRunner): Promise<void> {
        if ((queryRunner.connection.options as any).type === 'postgres') {
            await queryRunner.query(`CREATE TABLE "crm_opportunities" ("id" SERIAL NOT NULL, "customer_id" integer NOT NULL, "name" character varying(120) NOT NULL, "amount" double precision NOT NULL DEFAULT '0', "stage" character varying(16) NOT NULL DEFAULT 'qualification', "probability" integer NOT NULL DEFAULT '0', "expected_close_date" TIMESTAMP, "user_id" integer, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_1e2c1a2f8f2b3d8c6c1e3d9c9f" PRIMARY KEY ("id"))`);
            await queryRunner.query(`CREATE INDEX "IDX_cdc4f99e6ae089bc108846b376" ON "crm_opportunities" ("user_id") `);
            await queryRunner.query(`CREATE INDEX "IDX_3f92f847ab5ddf51a2bf3ed3c6" ON "crm_opportunities" ("customer_id") `);
            await queryRunner.query(`ALTER TABLE "crm_opportunities" ADD CONSTRAINT "FK_3f92f847ab5ddf51a2bf3ed3c61" FOREIGN KEY ("customer_id") REFERENCES "crm_customers"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
            return;
        }

        await queryRunner.query(`CREATE TABLE "crm_opportunities" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "customer_id" integer NOT NULL, "name" varchar(120) NOT NULL, "amount" float NOT NULL DEFAULT (0), "stage" varchar(16) NOT NULL DEFAULT ('qualification'), "probability" integer NOT NULL DEFAULT (0), "expected_close_date" datetime, "user_id" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`CREATE INDEX "IDX_cdc4f99e6ae089bc108846b376" ON "crm_opportunities" ("user_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_3f92f847ab5ddf51a2bf3ed3c6" ON "crm_opportunities" ("customer_id") `);
        await queryRunner.query(`DROP INDEX "IDX_cdc4f99e6ae089bc108846b376"`);
        await queryRunner.query(`DROP INDEX "IDX_3f92f847ab5ddf51a2bf3ed3c6"`);
        await queryRunner.query(`CREATE TABLE "temporary_crm_opportunities" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "customer_id" integer NOT NULL, "name" varchar(120) NOT NULL, "amount" float NOT NULL DEFAULT (0), "stage" varchar(16) NOT NULL DEFAULT ('qualification'), "probability" integer NOT NULL DEFAULT (0), "expected_close_date" datetime, "user_id" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_3f92f847ab5ddf51a2bf3ed3c61" FOREIGN KEY ("customer_id") REFERENCES "crm_customers" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "temporary_crm_opportunities"("id", "customer_id", "name", "amount", "stage", "probability", "expected_close_date", "user_id", "createdAt", "updatedAt") SELECT "id", "customer_id", "name", "amount", "stage", "probability", "expected_close_date", "user_id", "createdAt", "updatedAt" FROM "crm_opportunities"`);
        await queryRunner.query(`DROP TABLE "crm_opportunities"`);
        await queryRunner.query(`ALTER TABLE "temporary_crm_opportunities" RENAME TO "crm_opportunities"`);
        await queryRunner.query(`CREATE INDEX "IDX_cdc4f99e6ae089bc108846b376" ON "crm_opportunities" ("user_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_3f92f847ab5ddf51a2bf3ed3c6" ON "crm_opportunities" ("customer_id") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        if ((queryRunner.connection.options as any).type === 'postgres') {
            await queryRunner.query(`ALTER TABLE "crm_opportunities" DROP CONSTRAINT "FK_3f92f847ab5ddf51a2bf3ed3c61"`);
            await queryRunner.query(`DROP INDEX "public"."IDX_3f92f847ab5ddf51a2bf3ed3c6"`);
            await queryRunner.query(`DROP INDEX "public"."IDX_cdc4f99e6ae089bc108846b376"`);
            await queryRunner.query(`DROP TABLE "crm_opportunities"`);
            return;
        }
        await queryRunner.query(`DROP INDEX "IDX_3f92f847ab5ddf51a2bf3ed3c6"`);
        await queryRunner.query(`DROP INDEX "IDX_cdc4f99e6ae089bc108846b376"`);
        await queryRunner.query(`ALTER TABLE "crm_opportunities" RENAME TO "temporary_crm_opportunities"`);
        await queryRunner.query(`CREATE TABLE "crm_opportunities" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "customer_id" integer NOT NULL, "name" varchar(120) NOT NULL, "amount" float NOT NULL DEFAULT (0), "stage" varchar(16) NOT NULL DEFAULT ('qualification'), "probability" integer NOT NULL DEFAULT (0), "expected_close_date" datetime, "user_id" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`INSERT INTO "crm_opportunities"("id", "customer_id", "name", "amount", "stage", "probability", "expected_close_date", "user_id", "createdAt", "updatedAt") SELECT "id", "customer_id", "name", "amount", "stage", "probability", "expected_close_date", "user_id", "createdAt", "updatedAt" FROM "temporary_crm_opportunities"`);
        await queryRunner.query(`DROP TABLE "temporary_crm_opportunities"`);
        await queryRunner.query(`CREATE INDEX "IDX_3f92f847ab5ddf51a2bf3ed3c6" ON "crm_opportunities" ("customer_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_cdc4f99e6ae089bc108846b376" ON "crm_opportunities" ("user_id") `);
        await queryRunner.query(`DROP INDEX "IDX_3f92f847ab5ddf51a2bf3ed3c6"`);
        await queryRunner.query(`DROP INDEX "IDX_cdc4f99e6ae089bc108846b376"`);
        await queryRunner.query(`DROP TABLE "crm_opportunities"`);
    }

}
