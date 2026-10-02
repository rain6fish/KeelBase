// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * AU-2 余项（§22.19 归因层）：ai_audit_logs 加 device_id（varchar(64) 可空）——客户端设备标识
 * （取自请求头 `X-Device-Id`）。与 ip 互补：**NAT / 移动运营商之后多个客户端共用一个地址**，
 * 「这是哪一个客户端」光看地址答不出来。
 *
 * 列宽取 64，与既有的两处 device_id（`user_sessions` / `push_tokens`）及 `guest_id` 一致 ——
 * 同一个客户端标识不该在不同表里有不同的宽度上限。
 *
 * 链外列：**不入 hash payload**（§22.19 护栏③「只补归因维度、新列不进链 payload」）——故不与链冲突、不改既有行。
 * postgres / sqlite 均简单 ALTER ADD COLUMN（同 AddAiAuditIp 先例）。
 */
export class AddAiAuditDeviceId1836000000002 implements MigrationInterface {
  name = 'AddAiAuditDeviceId1836000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "ai_audit_logs" ADD "device_id" varchar(64)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "ai_audit_logs" DROP COLUMN "device_id"`);
  }
}
