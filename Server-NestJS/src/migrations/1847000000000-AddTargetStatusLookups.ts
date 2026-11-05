// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * AW-17: the evidence trail for target-status lookups — one row per attempt.
 *
 * The write claim row says *that* an external write's outcome is unknown; it has nowhere to say
 * whether anyone asked the target. A column on the claim would hold one reading and be overwritten by
 * the next attempt — the same reason REV-17 moved comparability into its own append-only table. One
 * row per attempt keeps "never asked" and "asked, no answer" apart.
 *
 * **No chain concern by construction**: this is a new table, and a separate table cannot enter
 * `_chainPayload`. Nothing here can break an existing chain.
 *
 * DDL and the index name follow the conventions used by `AddEffectComparabilityHistory`: the index
 * hash is `IDX_` + sha1(`<table>_<column>`) truncated to 26, verified here against that migration's
 * existing `IDX_08b03bd0b778a85035c4e4a30e`; the primary key follows TypeORM's `PK_` + sha1 truncated
 * to 27. Timestamp 1847000000000 is later than the newest existing migration 1845000000000.
 *
 * AW-17：目标状态查询的证据历史 —— 每次尝试一行。
 *
 * 占位行说的是「这笔外部写的结局未知」；它没有地方说「有没有人去问过目标」。写在占位行的一列上只会
 * 装一个读数、被下一次尝试覆盖 —— 与 REV-17 把可比性搬进独立追加表同一个理由。每次尝试一行，才能把
 * 「从没问过」与「问了没答案」分开。
 *
 * **结构上不涉链**：这是一张新表，而独立表进不了 `_chainPayload`。这里没有任何东西会弄坏既有链。
 *
 * DDL 与索引名沿用 `AddEffectComparabilityHistory` 的口径：索引哈希 = `IDX_` + sha1(`<表>_<列>`) 取前
 * 26 位，已用那支迁移既有的 `IDX_08b03bd0b778a85035c4e4a30e` 反验；主键按 TypeORM 的 `PK_` + sha1 取
 * 前 27 位。时间戳 1847000000000 晚于最新既有迁移 1845000000000。
 */
export class AddTargetStatusLookups1847000000000 implements MigrationInterface {
  name = 'AddTargetStatusLookups1847000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    const q = (sql: string) => queryRunner.query(sql);

    if (isPg) {
      await q(
        `CREATE TABLE "ai_target_status_lookups" ("id" SERIAL NOT NULL, "idempotency_key" character varying(64) NOT NULL, "tool_name" character varying(64) NOT NULL, "looked_up_by" character varying(64) NOT NULL, "as_user_id" character varying(64) NOT NULL, "query_method" character varying(8) NOT NULL, "query_path" character varying(255) NOT NULL, "conclusion" character varying(16) NOT NULL, "reason" character varying(32), "at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_6a4209d25fe3f05214f48ae2982" PRIMARY KEY ("id"))`,
      );
    } else {
      await q(
        `CREATE TABLE "ai_target_status_lookups" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "idempotency_key" varchar(64) NOT NULL, "tool_name" varchar(64) NOT NULL, "looked_up_by" varchar(64) NOT NULL, "as_user_id" varchar(64) NOT NULL, "query_method" varchar(8) NOT NULL, "query_path" varchar(255) NOT NULL, "conclusion" varchar(16) NOT NULL, "reason" varchar(32), "at" datetime NOT NULL DEFAULT (datetime('now')))`,
      );
    }
    await q(
      `CREATE INDEX "IDX_0657e88ed8bfeb0bf71e2366df" ON "ai_target_status_lookups" ("idempotency_key") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const q = (sql: string) => queryRunner.query(sql);
    await q(`DROP INDEX "IDX_0657e88ed8bfeb0bf71e2366df"`);
    await q(`DROP TABLE "ai_target_status_lookups"`);
  }
}
