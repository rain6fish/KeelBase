// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Drops `users.refresh_token_hash`, the second of the two write-only leftovers.
 *
 * It is the single-session design's stub: login refreshed it, logout cleared it, and the field was
 * excluded from every response and from the audit diff — but **nothing ever compared it**. Credentials
 * are checked against `user_sessions.refresh_hash` (one row per device), which is also what logout and
 * password reset actually revoke. So the column held a copy of a value no code path read, and it drifted
 * from `user_sessions` the moment multi-device login landed.
 *
 * Removing it removes a write, too: `generateRefreshToken` used to persist the hash on every login,
 * register, OAuth login and refresh. That save existed only for this column — the login path resets the
 * failure counters through its own `update()`, and OAuth account creation saves explicitly.
 *
 * Same class as `user_roles` (dropped in 1834000000000). Dropping a column on the core `users` table is a
 * larger step than dropping an unused table, which is why it was recorded and ruled on separately rather
 * than folded into that migration.
 *
 * Plain `ALTER TABLE ... DROP COLUMN` on both dialects, matching the existing precedent that drops columns
 * from this same table (1786004759010-AddAccountCompliance). `down()` adds it back as nullable, so the
 * cycle is symmetric; the values are not restored, and cannot be — nothing recorded them anywhere else.
 * One honest caveat: `ADD COLUMN` appends on both dialects, so `down()` restores the column but not its
 * original ordinal position. Nothing reads columns positionally, so this is recorded rather than worked
 * around — the rebuild that would fix the order is not worth its risk on the core users table.
 *
 * Timestamp 1835000000000 is later than the newest existing migration 1834000000000.
 *
 * 删掉 `users.refresh_token_hash` —— 两处「只写不读」遗留中的第二处。
 *
 * 它是单会话设计留下的桩：登录时刷新它、登出时清空它、从所有响应与审计 diff 里排除它 —— 但**没有任何
 * 地方比较过它**。凭据校验走的是 `user_sessions.refresh_hash`（每设备一行），而登出与改密真正撤销的
 * 也是那些会话行。故该列存着一份没有任何代码路径读取的值，且自多设备登录落地起就与会话表脱钩。
 *
 * 删它还顺带删掉一次写：`generateRefreshToken` 原先在每次登录 / 注册 / OAuth 登录 / 刷新时都落一次
 * 哈希，而那次 save **只为这一列而存在** —— 登录路径的失败计数重置走的是它自己的 `update()`，OAuth
 * 建号另有显式 save。
 *
 * 与 `user_roles`（已在 1834000000000 删除）同一类。在核心 `users` 表上删列比删一张无人用的表步子大，
 * 故它单独立项、单独裁决，而非并进那条迁移。
 *
 * 双方言均为普通 `ALTER TABLE ... DROP COLUMN`，与本仓既有的「在同一张表上删列」先例一致
 * （1786004759010-AddAccountCompliance）。`down()` 以 nullable 加回，使往返对称；**值不会恢复，也无法
 * 恢复** —— 没有任何别处记录过它。
 *
 * 时间戳 1835000000000 晚于最新既有迁移 1834000000000。
 */
export class DropUserRefreshTokenHash1835000000000 implements MigrationInterface {
  name = 'DropUserRefreshTokenHash1835000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "refresh_token_hash"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    await queryRunner.query(
      isPg
        ? `ALTER TABLE "users" ADD "refresh_token_hash" character varying(512)`
        : `ALTER TABLE "users" ADD "refresh_token_hash" varchar(512)`,
    );
  }
}
