// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * REV-13: the reason a grouped member could not carry its change, recorded beside the flag.
 *
 * `ai_tool_side_effects.identity_incomplete` says *that* the after-snapshot was missing; it cannot say
 * *why*, and the four reasons are not equivalent — two are design choices (`no_captor` when the captor
 * is not wired, `no_entity_and_empty_fallback` for an external write) and two are faults (`row_missing`
 * when the entity resolves but the row is gone, `failed` when the capture threw). Collapsed into one
 * bit, "by design" and "something broke" read identically, while they call for opposite responses.
 *
 * **No backfill.** The reason depends on the runtime conditions at capture time and cannot be rebuilt
 * from any stored column, so historical flagged rows keep `null` and read as "flagged, reason unknown".
 * Writing a default value there would turn "not knowable" into "known" — the same trap the F-10d
 * review named for degraded defaults.
 *
 * **Chain-external annotation column**: not in any `_chainPayload`, so existing chains and rows are
 * untouched and need no re-signing.
 *
 * Plain `ALTER TABLE ADD COLUMN` on both dialects (no index, so no sqlite table rebuild). Timestamp
 * 1830000000000 is later than the newest existing migration 1829100000000.
 *
 * REV-13：成组成员「承载不了变更」的**成因**，与那个布尔标记并列记录。
 *
 * `identity_incomplete` 说得清**有没有**缺 after 快照，说不清**为什么**缺；而四种成因并不等价 ——
 * 两种是设计选择（`no_captor`：捕获器未装配；`no_entity_and_empty_fallback`：外部写），
 * 两种是故障（`row_missing`：实体解析得到而行不在；`failed`：抓取抛错）。压成一个 bit 后，
 * 「设计如此」与「出问题了」读数完全相同，而两者的处置恰好相反。
 *
 * **不回填**。成因取决于捕获当时的运行条件，无法从任何落库列重建，故历史置标行保持 `null`，
 * 读作「标了但原因不可考」。在那里写一个默认值，等于把「不可考」变成「已知」——正是 F-10d
 * 评审为「退化默认值」点名的那个陷阱。
 *
 * **链外注解列**：不入任何 `_chainPayload`，故既有链与既有行不受影响、不需重签。
 *
 * 双方言均为普通 `ALTER TABLE ADD COLUMN`（不建索引，故无 sqlite 整表重建）。时间戳
 * 1830000000000 晚于最新既有迁移 1829100000000。
 */
export class AddIdentityIncompleteReason1830000000000 implements MigrationInterface {
  name = 'AddIdentityIncompleteReason1830000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const varchar = queryRunner.connection.options.type === 'postgres' ? 'character varying' : 'varchar';
    await queryRunner.query(
      `ALTER TABLE "ai_tool_side_effects" ADD "identity_incomplete_reason" ${varchar}(32)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "ai_tool_side_effects" DROP COLUMN "identity_incomplete_reason"`,
    );
  }
}
