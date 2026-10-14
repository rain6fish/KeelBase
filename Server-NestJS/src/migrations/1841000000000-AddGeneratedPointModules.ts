// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 两个生成模块的建表迁移：`points_ledgers` 与 `point_records`。
 *
 * 由来：`specs/point-records.json` 与 `specs/point-ledger.json` 经 `keelbase init --spec` 生成（「复制模块」那次
 * 实跑，2026-10-13 留档：`c81232a0`），而**提交时漏了两张表的迁移** ⇒ CI 的 `migration-consistency` 与
 * `migration-consistency-postgres` 自那时起红（同一次 `CI` job 的其余 25 项全绿）。
 *
 * 两侧 DDL **都取自 `migration:generate` 的权威输出**（sqlite 一次、postgres 一次），不是手写 —— 手写会与实体
 * 元数据差一个约束名或一个默认值，而那道闸比的正是这个（`PK_…` 名、`DEFAULT 'checkin'`、`DEFAULT '1'` 都在
 * 其中）。索引名沿用生成器给出的 hash 名，与两个实体的元数据一致。
 *
 * 只加迁移、**不动那两个模块**：spec 已提交，样本门已把它们算进 161 → 184 ⇒ 模块是**留着的**，缺的只是迁移。
 */
export class AddGeneratedPointModules1841000000000 implements MigrationInterface {
  name = 'AddGeneratedPointModules1841000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type === 'postgres') {
      await queryRunner.query(
        `CREATE TABLE "points_ledgers" ("id" SERIAL NOT NULL, "points" integer NOT NULL, "checkinDate" character varying(200) NOT NULL, "reason" character varying(32) NOT NULL DEFAULT 'checkin', "description" character varying(200) NOT NULL, "user_id" integer, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "version" integer NOT NULL DEFAULT '1', "deleted_at" TIMESTAMP, CONSTRAINT "PK_d518e237b19e5e3ca6f26ded288" PRIMARY KEY ("id"))`,
      );
      await queryRunner.query(
        `CREATE INDEX "IDX_2a47a9bf7bb30fa8ece677a9fa" ON "points_ledgers"  ("user_id") `,
      );
      await queryRunner.query(
        `CREATE TABLE "point_records" ("id" SERIAL NOT NULL, "points" integer NOT NULL, "checkinDate" character varying(200) NOT NULL, "reason" character varying(32) NOT NULL DEFAULT 'checkin', "description" character varying(200) NOT NULL, "user_id" integer, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "version" integer NOT NULL DEFAULT '1', "deleted_at" TIMESTAMP, CONSTRAINT "PK_1d9b416e3de52427fc9812a25e6" PRIMARY KEY ("id"))`,
      );
      await queryRunner.query(
        `CREATE INDEX "IDX_82835f165c8ccdf538b88193df" ON "point_records"  ("user_id") `,
      );
      return;
    }

    // sqlite（`migration:generate` 在该方言下的原始输出）
    await queryRunner.query(
      `CREATE TABLE "points_ledgers" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "points" integer NOT NULL, "checkinDate" varchar(200) NOT NULL, "reason" varchar(32) NOT NULL DEFAULT ('checkin'), "description" varchar(200) NOT NULL, "user_id" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "deleted_at" datetime)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_2a47a9bf7bb30fa8ece677a9fa" ON "points_ledgers" ("user_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "point_records" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "points" integer NOT NULL, "checkinDate" varchar(200) NOT NULL, "reason" varchar(32) NOT NULL DEFAULT ('checkin'), "description" varchar(200) NOT NULL, "user_id" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "deleted_at" datetime)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_82835f165c8ccdf538b88193df" ON "point_records" ("user_id") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_82835f165c8ccdf538b88193df"`);
    await queryRunner.query(`DROP TABLE "point_records"`);
    await queryRunner.query(`DROP INDEX "IDX_2a47a9bf7bb30fa8ece677a9fa"`);
    await queryRunner.query(`DROP TABLE "points_ledgers"`);
  }
}
