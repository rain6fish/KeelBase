import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * AI CRM Customer 360：crm_contacts（联系人）表。
 * 双驱动：postgres（SERIAL + 内联 FK）先建并 return；sqlite（AUTOINCREMENT + 临时表重建补 FK）。
 * 索引/FK 约束名取自 migration:generate 输出（TypeORM hash 名，避免一致性漂移）。
 */
export class AddCrmContact1787550568399 implements MigrationInterface {
    name = 'AddCrmContact1787550568399'

    public async up(queryRunner: QueryRunner): Promise<void> {
        if ((queryRunner.connection.options as any).type === 'postgres') {
            await queryRunner.query(`CREATE TABLE "crm_contacts" ("id" SERIAL NOT NULL, "customer_id" integer NOT NULL, "name" character varying(64) NOT NULL, "email" character varying(120), "phone" character varying(32), "role" character varying(32), "department" character varying(64), "is_primary" boolean NOT NULL DEFAULT false, "user_id" integer, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_a5c9a1f4b2d3e6c7f8a9b0c1d2" PRIMARY KEY ("id"))`);
            await queryRunner.query(`CREATE INDEX "IDX_716652046341807ab127c9b127" ON "crm_contacts" ("user_id") `);
            await queryRunner.query(`CREATE INDEX "IDX_73ddc5a7db8c3edb2d25060f84" ON "crm_contacts" ("customer_id") `);
            await queryRunner.query(`ALTER TABLE "crm_contacts" ADD CONSTRAINT "FK_73ddc5a7db8c3edb2d25060f845" FOREIGN KEY ("customer_id") REFERENCES "crm_customers"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
            return;
        }

        await queryRunner.query(`CREATE TABLE "crm_contacts" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "customer_id" integer NOT NULL, "name" varchar(64) NOT NULL, "email" varchar(120), "phone" varchar(32), "role" varchar(32), "department" varchar(64), "is_primary" boolean NOT NULL DEFAULT (0), "user_id" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`CREATE INDEX "IDX_716652046341807ab127c9b127" ON "crm_contacts" ("user_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_73ddc5a7db8c3edb2d25060f84" ON "crm_contacts" ("customer_id") `);
        await queryRunner.query(`DROP INDEX "IDX_716652046341807ab127c9b127"`);
        await queryRunner.query(`DROP INDEX "IDX_73ddc5a7db8c3edb2d25060f84"`);
        await queryRunner.query(`CREATE TABLE "temporary_crm_contacts" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "customer_id" integer NOT NULL, "name" varchar(64) NOT NULL, "email" varchar(120), "phone" varchar(32), "role" varchar(32), "department" varchar(64), "is_primary" boolean NOT NULL DEFAULT (0), "user_id" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_73ddc5a7db8c3edb2d25060f845" FOREIGN KEY ("customer_id") REFERENCES "crm_customers" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "temporary_crm_contacts"("id", "customer_id", "name", "email", "phone", "role", "department", "is_primary", "user_id", "createdAt", "updatedAt") SELECT "id", "customer_id", "name", "email", "phone", "role", "department", "is_primary", "user_id", "createdAt", "updatedAt" FROM "crm_contacts"`);
        await queryRunner.query(`DROP TABLE "crm_contacts"`);
        await queryRunner.query(`ALTER TABLE "temporary_crm_contacts" RENAME TO "crm_contacts"`);
        await queryRunner.query(`CREATE INDEX "IDX_716652046341807ab127c9b127" ON "crm_contacts" ("user_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_73ddc5a7db8c3edb2d25060f84" ON "crm_contacts" ("customer_id") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_73ddc5a7db8c3edb2d25060f84"`);
        await queryRunner.query(`DROP INDEX "IDX_716652046341807ab127c9b127"`);
        await queryRunner.query(`ALTER TABLE "crm_contacts" RENAME TO "temporary_crm_contacts"`);
        await queryRunner.query(`CREATE TABLE "crm_contacts" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "customer_id" integer NOT NULL, "name" varchar(64) NOT NULL, "email" varchar(120), "phone" varchar(32), "role" varchar(32), "department" varchar(64), "is_primary" boolean NOT NULL DEFAULT (0), "user_id" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`INSERT INTO "crm_contacts"("id", "customer_id", "name", "email", "phone", "role", "department", "is_primary", "user_id", "createdAt", "updatedAt") SELECT "id", "customer_id", "name", "email", "phone", "role", "department", "is_primary", "user_id", "createdAt", "updatedAt" FROM "temporary_crm_contacts"`);
        await queryRunner.query(`DROP TABLE "temporary_crm_contacts"`);
        await queryRunner.query(`CREATE INDEX "IDX_73ddc5a7db8c3edb2d25060f84" ON "crm_contacts" ("customer_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_716652046341807ab127c9b127" ON "crm_contacts" ("user_id") `);
        await queryRunner.query(`DROP INDEX "IDX_73ddc5a7db8c3edb2d25060f84"`);
        await queryRunner.query(`DROP INDEX "IDX_716652046341807ab127c9b127"`);
        await queryRunner.query(`DROP TABLE "crm_contacts"`);
    }

}
