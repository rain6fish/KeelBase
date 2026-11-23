// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * F-85b: the query evidence behind a release decision, as a machine-shaped column.
 *
 * Off-chain, same stance as `tool_args`: putting it in the payload would recompute the hash of every
 * historical v2 row and break chain verification. Nullable, so rows that are not releases — and every
 * row written before this column existed — stay valid.
 *
 * F-85b：释放决定背后的查询证据，作为一列机器可读值。
 *
 * 链外，与 `tool_args` 同一立场：入 payload 会让每一行历史 v2 的哈希重算、破坏链校验。可空，
 * 故非释放行与这一列之前写入的行都仍然有效。
 */
export class AddAiAuditReleaseLookups1860000000000 implements MigrationInterface {
  name = 'AddAiAuditReleaseLookups1860000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    await queryRunner.query(
      isPg
        ? `ALTER TABLE "ai_audit_logs" ADD "release_lookups" text`
        : `ALTER TABLE "ai_audit_logs" ADD COLUMN "release_lookups" text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "ai_audit_logs" DROP COLUMN "release_lookups"`);
  }
}
