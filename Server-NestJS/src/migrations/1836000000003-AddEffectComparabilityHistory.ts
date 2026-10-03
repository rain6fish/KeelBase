// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * REV-17: the comparability record becomes append-only — one row per revoke attempt.
 *
 * The record used to live in a single column on the root effect row, so the next attempt overwrote it: a
 * pass with nothing to report wrote `null`, and a later `null` reads the same whether the row was checked
 * and found clean or was never revoked at all. A promise broken in one attempt could be gone by the next
 * with nothing left to show it happened. History is a sequence of events, and a column holds one value.
 *
 * `checked` separates the two readings at the source — `diff` carries the promised/uncomparable sets,
 * `clean` says this attempt reached the comparison and had nothing to report — so the absence of a row
 * means the absence of a check, and nothing else.
 *
 * **No chain concern by construction**: the previous carrier was a chain-external column and a separate
 * table cannot enter `_chainPayload` at all.
 *
 * DDL and the index name come from `migration:generate` against a **fresh, fully migrated** database (so
 * the entity↔migration parity gate sees no drift). The postgres branch is the same DDL in that dialect;
 * the primary-key name is what TypeORM's naming strategy derives (`PK_` + sha1 of
 * `<table>_<pk columns>` truncated to 27), verified here against `ai_write_claims`'s existing
 * `PK_d27fb1a4177c62fe408df4c176e`. Timestamp 1836000000003 is later than the newest existing migration
 * 1836000000002.
 *
 * REV-17：可比性记录改为**追加式**——每次撤销尝试一行。
 *
 * 该记录原先是根副作用行上的**单列**，于是下一次尝试会把它覆盖：一次无可报的比对写 `null`，而事后的
 * `null` 无论「查过且干净」还是「从未撤销」都读成同一个样子。一次尝试里被破掉的承诺，到下一次可能已消失、
 * 不留痕迹。历史是一串**事件**，而一列只装一个值。
 *
 * `checked` 在源头把两种读数分开 —— `diff` 带 promised/uncomparable 两个集合，`clean` 说明这次走到了
 * 比对、无可报 —— 故没有行只意味着没有查过，别无其它。
 *
 * **结构上不涉链**：原载体是链外列，而独立表根本无法进入 `_chainPayload`。
 *
 * DDL 与索引名取自**对全新且已迁移完毕的库**跑 `migration:generate` 的结果（使实体↔迁移 parity 门看不到
 * 漂移）。postgres 分支是同一 DDL 的该方言写法；主键名用 TypeORM 命名策略推导（`PK_` + `<表>_<主键列>`
 * 的 sha1 取前 27 位），并已用本仓 `ai_write_claims` 既有的 `PK_d27fb1a4177c62fe408df4c176e` 反验。
 * 时间戳 1836000000003 晚于最新既有迁移 1836000000002。
 */
export class AddEffectComparabilityHistory1836000000003 implements MigrationInterface {
  name = 'AddEffectComparabilityHistory1836000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    const q = (sql: string) => queryRunner.query(sql);

    if (isPg) {
      await q(
        `CREATE TABLE "ai_tool_effect_comparability" ("id" SERIAL NOT NULL, "effect_id" integer NOT NULL, "checked" character varying(16) NOT NULL, "promised" text, "uncomparable" text, "at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_4cf08c0c6387e30223f4c696a94" PRIMARY KEY ("id"))`,
      );
    } else {
      await q(
        `CREATE TABLE "ai_tool_effect_comparability" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "effect_id" integer NOT NULL, "checked" varchar(16) NOT NULL, "promised" text, "uncomparable" text, "at" datetime NOT NULL DEFAULT (datetime('now')))`,
      );
    }
    await q(`CREATE INDEX "IDX_08b03bd0b778a85035c4e4a30e" ON "ai_tool_effect_comparability" ("effect_id") `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const q = (sql: string) => queryRunner.query(sql);
    await q(`DROP INDEX "IDX_08b03bd0b778a85035c4e4a30e"`);
    await q(`DROP TABLE "ai_tool_effect_comparability"`);
  }
}
