// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 权限-2 通用数据范围 · 基础列（sqlite + postgres 双驱动）。
 *
 * - `departments.ancestors`：物化路径（祖先 id 以 '/' 包裹拼接，形如 `/1/3/`；根为 `/`），
 *   供「本部门及以下」下钻（`ancestors LIKE '%/<deptId>/%'`）。建表时回填既有部门。
 * - `crm_customers` / `pm_projects` / `app_requests`：补 `org_id` / `dept_id` 列。
 *   **本步不回填**——这三者今天都是 owner-only，回填会把历史行放开给组织/部门可见（行为变更）。
 *   `null` = 仅 owner 可见；由写入路径盖章。
 */
export class AddDataScopeColumns1819000000000 implements MigrationInterface {
  name = 'AddDataScopeColumns1819000000000';

  /** 被范围实体（表名） */
  private static readonly SCOPED_TABLES = ['crm_customers', 'pm_projects', 'app_requests'];

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';

    await queryRunner.query(
      `ALTER TABLE "departments" ADD "ancestors" varchar(500) NOT NULL DEFAULT ''`,
    );
    await this._backfillAncestors(queryRunner, isPg);

    for (const table of AddDataScopeColumns1819000000000.SCOPED_TABLES) {
      await queryRunner.query(`ALTER TABLE "${table}" ADD "org_id" integer`);
      await queryRunner.query(`ALTER TABLE "${table}" ADD "dept_id" integer`);
      await queryRunner.query(
        `CREATE INDEX "IDX_scope_${table}_org_dept" ON "${table}" ("org_id", "dept_id")`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of AddDataScopeColumns1819000000000.SCOPED_TABLES) {
      await queryRunner.query(`DROP INDEX "IDX_scope_${table}_org_dept"`);
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN "dept_id"`);
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN "org_id"`);
    }
    await queryRunner.query(`ALTER TABLE "departments" DROP COLUMN "ancestors"`);
  }

  /**
   * 单趟内存走 parent_id 链算出物化路径，再逐行回填。
   * 值全部由本迁移内部推导（整数 id + '/' 拼接），无外部输入；占位符按驱动切换。
   */
  private async _backfillAncestors(queryRunner: QueryRunner, isPg: boolean): Promise<void> {
    const rows: Array<{ id: number | string; parent_id: number | string | null }> =
      await queryRunner.query(`SELECT "id", "parent_id" FROM "departments"`);
    const parentOf = new Map<number, number | null>();
    for (const r of rows) {
      parentOf.set(Number(r.id), r.parent_id == null ? null : Number(r.parent_id));
    }

    const cache = new Map<number, string>();
    const visiting = new Set<number>();
    const pathOf = (id: number): string => {
      const cached = cache.get(id);
      if (cached !== undefined) return cached;
      if (visiting.has(id)) return '/'; // 环（历史脏数据）→ 截断，防无限递归
      visiting.add(id);
      const parent = parentOf.get(id) ?? null;
      const path =
        parent != null && parentOf.has(parent) ? `${pathOf(parent)}${parent}/` : '/';
      visiting.delete(id);
      cache.set(id, path);
      return path;
    };

    const ph = (n: number) => (isPg ? `$${n}` : '?');
    for (const r of rows) {
      const id = Number(r.id);
      await queryRunner.query(
        `UPDATE "departments" SET "ancestors" = ${ph(1)} WHERE "id" = ${ph(2)}`,
        [pathOf(id), id],
      );
    }
  }
}
