// SPDX-License-Identifier: Apache-2.0

import { readdirSync } from 'fs';
import { join } from 'path';
import {
  POSTGRES_MIGRATION_GLOBS,
  POSTGRES_EXCLUDED_MIGRATIONS,
} from './postgres-migrations';

/**
 * 守卫：postgres 迁移清单不得与 src/migrations 目录漂移。
 *
 * 背景（2026-09-10 生产事故）：清单曾有两份手工平行列表（app.module 运行时 / typeorm-data-source CLI），
 * 6 个迁移漏进运行时清单 → 生产 migrationsRun 永不执行 → ECS ai_tool_side_effects.revoke_class 缺列 → trace 500。
 * 现已合为单一权威源（postgres-migrations.ts），本测试防止「新增迁移忘记登记」复发。
 */
describe('postgres 迁移清单守卫', () => {
  const migrationsDir = join(__dirname, '..', 'migrations');
  const files = readdirSync(migrationsDir).filter(
    (f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'),
  );
  const stripWildcards = (g: string) => g.replace(/^\*/, '').replace(/\*$/, '');

  it('每个迁移要么在 postgres 清单内，要么显式登记为排除（防漏加）', () => {
    const uncovered = files.filter(
      (f) =>
        !POSTGRES_MIGRATION_GLOBS.some((g) => f.includes(stripWildcards(g))) &&
        !POSTGRES_EXCLUDED_MIGRATIONS.some((e) => f.includes(e)),
    );
    expect(uncovered).toEqual([]);
  });

  it('每个迁移至多被一个 glob 命中（防同文件重复入列 → pg Duplicate migrations）', () => {
    const duplicated = files
      .map((f) => ({
        file: f,
        hits: POSTGRES_MIGRATION_GLOBS.filter((g) => f.includes(stripWildcards(g))).length,
      }))
      .filter((x) => x.hits > 1)
      .map((x) => `${x.file} (${x.hits} globs)`);
    expect(duplicated).toEqual([]);
  });

  it('排除清单每项都对应真实文件（防过期登记）', () => {
    const orphans = POSTGRES_EXCLUDED_MIGRATIONS.filter(
      (e) => !files.some((f) => f.includes(e)),
    );
    expect(orphans).toEqual([]);
  });

  it('清单命中非空且覆盖全部迁移（清单 + 排除 = 全部）', () => {
    const hits = files.filter((f) =>
      POSTGRES_MIGRATION_GLOBS.some((g) => f.includes(stripWildcards(g))),
    );
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.length + POSTGRES_EXCLUDED_MIGRATIONS.length).toBe(files.length);
  });
});
