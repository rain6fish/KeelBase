// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * R-1: the **kind** of a lookup answer — `current_state` (a snapshot) or `receipt` (the target's own
 * acceptance record).
 *
 * Nullable with no default on purpose. `NULL` means "the target did not say, or this row predates the
 * column"; the read face reports it as `unknown`. A default would stamp a value onto every historical
 * row — the guess this column exists to prevent — and a backfill would be the same guess spelled as an
 * `UPDATE`. There is no backfill.
 *
 * No index: nothing filters by this column. Adding one later would need a timestamp after every
 * migration that rebuilds this table.
 *
 * Timestamp 1861000000000 is later than the newest existing migration (1860000000000). The filename
 * must not fall into another registered Postgres glob: the existing `*AddTargetStatusLookups*` does
 * not match this name (no trailing `s`), and this migration is registered by its own exact substring.
 *
 * R-1：查询答案的**种类** —— `current_state`（快照）或 `receipt`（目标自己的受理记录）。
 *
 * 有意可空、无默认。`NULL` 表示「目标没说，或该行早于本列」；读面报作 `unknown`。默认值会把值盖到
 * 每一行历史数据上 —— 正是本列要防的那次猜测；回填只是把同一次猜测写成 `UPDATE`。故不回填。
 *
 * 不加索引：没有任何查询按本列过滤。将来若加，时间戳必须排在每一次重建该表的迁移之后。
 *
 * 时间戳 1861000000000 晚于当前最新迁移（1860000000000）。文件名不得落进其它已注册的 Postgres
 * 通配：既有 `*AddTargetStatusLookups*` 不匹配本名（没有末尾的 `s`），本迁移按自己的精确子串注册。
 */
export class AddTargetStatusLookupBasis1861000000000 implements MigrationInterface {
  name = 'AddTargetStatusLookupBasis1861000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    await queryRunner.query(
      isPg
        ? `ALTER TABLE "ai_target_status_lookups" ADD "basis" character varying(16)`
        : `ALTER TABLE "ai_target_status_lookups" ADD COLUMN "basis" varchar(16)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "ai_target_status_lookups" DROP COLUMN "basis"`);
  }
}
