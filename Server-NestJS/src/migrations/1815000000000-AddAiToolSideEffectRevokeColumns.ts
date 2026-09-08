// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * KB-6（做空"revoke≠rollback"诚实边界，语义源 docs/protocol-trust-proof-card.spec.md R9）：
 * ai_tool_side_effects 加撤销能力分档 + 撤销结果状态两列（可空，varchar 避开 sqlite/postgres enum 差异）。
 * - revoke_class：副作用发生时刻的撤销能力快照（none / local_compensate / governed_external / transactional）——
 *   工具/ProxyTool 配置可随 ai_proxy_tools 变更，副作用是历史事实须固化当时档位。
 * - revoke_status：撤销结果运维态（revoked=本地软删 / compensating=已请求外部补偿/结果未知 / revoke_failed=补偿失败；null=未撤）。
 * 两列均**不参与** G-3 副作用哈希链 _chainPayload（旧行按旧 canonical 哈希，加 key 会使全部链化行验链失败）。
 */
export class AddAiToolSideEffectRevokeColumns1815000000000 implements MigrationInterface {
  name = 'AddAiToolSideEffectRevokeColumns1815000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "ai_tool_side_effects" ADD "revoke_class" varchar(32)`,
    );
    await queryRunner.query(
      `ALTER TABLE "ai_tool_side_effects" ADD "revoke_status" varchar(32)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "ai_tool_side_effects" DROP COLUMN "revoke_status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ai_tool_side_effects" DROP COLUMN "revoke_class"`,
    );
  }
}
