// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 权限-2 补：`todos` / `events` 加 `dept_id`（sqlite + postgres 双驱动）。
 *
 * 起因：Step 1 给 CRM/PM/Approval 补了 `org_id`/`dept_id`，但 Todo/Event 只有 `org_id`——
 * 而**恰恰只有 Todo/Event 的列表走数据范围构造器**，导致「本部门 / 本部门及以下」在端到端上够不着。
 * 只加列 + 建索引，**不回填**（历史行 `null` 在部门范围下不可见，是收紧方向）。
 */
export class AddDeptIdToTodosEvents1821000000000 implements MigrationInterface {
  name = 'AddDeptIdToTodosEvents1821000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['todos', 'events']) {
      await queryRunner.query(`ALTER TABLE "${table}" ADD "dept_id" integer`);
      await queryRunner.query(`CREATE INDEX "IDX_scope_${table}_dept" ON "${table}" ("dept_id")`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['todos', 'events']) {
      await queryRunner.query(`DROP INDEX "IDX_scope_${table}_dept"`);
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN "dept_id"`);
    }
  }
}
