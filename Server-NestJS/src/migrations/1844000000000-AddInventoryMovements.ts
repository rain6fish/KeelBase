// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Inventory movements (vertical template: purchase / sales / stock).
 * Generated with `migration:generate`, then given its postgres branch by hand — the repository's
 * committed migrations are dual-dialect, while the generator emits sqlite only.
 *
 * 库存出入库（垂直模板：进销存）。SQL 由 `migration:generate` 生成，postgres 分支按本仓
 * 双方言迁移的惯例手写补齐（生成器只产出 sqlite 方言）。
 */
export class AddInventoryMovements1844000000000 implements MigrationInterface {
    name = 'AddInventoryMovements1844000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        if (queryRunner.connection.options.type === 'postgres') {
            await queryRunner.query(`CREATE TABLE "inventory_movements" ("id" SERIAL NOT NULL, "documentNo" character varying(200) NOT NULL, "sku" character varying(200) NOT NULL, "itemName" character varying(200) NOT NULL, "direction" character varying(32) NOT NULL DEFAULT 'in', "quantity" integer NOT NULL, "unit" character varying(200), "partner" character varying(200), "occurredAt" TIMESTAMP, "note" text, "user_id" integer, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "version" integer NOT NULL DEFAULT 1, "deleted_at" TIMESTAMP, CONSTRAINT "PK_d7597827c1dcffae889db3ab873" PRIMARY KEY ("id"))`);
            await queryRunner.query(`CREATE INDEX "IDX_63cca4adcd28b6fe19bc4ceb22" ON "inventory_movements"  ("user_id") `);
            return;
        }
        await queryRunner.query(`CREATE TABLE "inventory_movements" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "documentNo" varchar(200) NOT NULL, "sku" varchar(200) NOT NULL, "itemName" varchar(200) NOT NULL, "direction" varchar(32) NOT NULL DEFAULT ('in'), "quantity" integer NOT NULL, "unit" varchar(200), "partner" varchar(200), "occurredAt" datetime, "note" text, "user_id" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "deleted_at" datetime)`);
        await queryRunner.query(`CREATE INDEX "IDX_63cca4adcd28b6fe19bc4ceb22" ON "inventory_movements" ("user_id") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        if (queryRunner.connection.options.type === 'postgres') {
            await queryRunner.query(`DROP INDEX "public"."IDX_63cca4adcd28b6fe19bc4ceb22"`);
            await queryRunner.query(`DROP TABLE "inventory_movements"`);
            return;
        }
        await queryRunner.query(`DROP INDEX "IDX_63cca4adcd28b6fe19bc4ceb22"`);
        await queryRunner.query(`DROP TABLE "inventory_movements"`);
    }

}
