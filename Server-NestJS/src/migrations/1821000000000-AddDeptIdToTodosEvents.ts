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

  /** dept_id 索引名 = TypeORM 由实体 `@Index(['deptId'])` 派生的 hash 名（手写名会与实体漂移，release-gate 迁移一致性会 FAIL） */
  private static readonly DEPT_INDEX: Record<string, string> = {
    todos: 'IDX_17452ccf5dd6c8be81ec69bf86',
    events: 'IDX_f1d3164c694e81ba307f0dc315',
  };

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['todos', 'events']) {
      await queryRunner.query(`ALTER TABLE "${table}" ADD "dept_id" integer`);
      await queryRunner.query(
        `CREATE INDEX "${AddDeptIdToTodosEvents1821000000000.DEPT_INDEX[table]}" ON "${table}" ("dept_id")`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['todos', 'events']) {
      await queryRunner.query(`DROP INDEX "${AddDeptIdToTodosEvents1821000000000.DEPT_INDEX[table]}"`);
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN "dept_id"`);
    }
  }
}
