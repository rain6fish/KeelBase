// SPDX-License-Identifier: Apache-2.0

import { DataSource, QueryRunner } from 'typeorm';
import { AddAiToolResultBodies1850000000000 } from '../1850000000000-AddAiToolResultBodies';

/**
 * **This file must stay under `src/migrations/__tests__/`**: the migration globs are non-recursive,
 * so a test living next to the migration would not be loaded as one.
 *
 * Runs the migration class itself against in-memory sqlite — no hand-copied DDL. The two things the
 * retention surface depends on are pinned here: the unique `audit_row_id` (the idempotency gate) and
 * the expiry index (the hourly tombstone sweep).
 *
 * **本文件必须留在 `src/migrations/__tests__/`**：迁移 glob 非递归，测试若与迁移同级会被当成迁移加载。
 *
 * 用真实 sqlite 驱动迁移类本身、不手抄 SQL。留存面依赖的两件事在这里钉死：`audit_row_id` 唯一
 * （幂等闸）与到期索引（每小时墓碑清扫）。
 */
describe('1850000000000 AddAiToolResultBodies（0-B 留存）', () => {
  let ds: DataSource;
  let runner: QueryRunner;
  const migration = new AddAiToolResultBodies1850000000000();

  const columns = async (): Promise<string[]> => {
    const rows = (await ds.query(`PRAGMA table_info("ai_tool_result_bodies")`)) as Array<{
      name: string;
    }>;
    return rows.map((r) => r.name);
  };

  beforeEach(async () => {
    ds = new DataSource({ type: 'better-sqlite3', database: ':memory:' });
    await ds.initialize();
    runner = ds.createQueryRunner();
    await runner.connect();
  });

  afterEach(async () => {
    await runner.release();
    await ds.destroy();
  });

  it('建表：字段齐全（正文/模型投影/字节数/双哈希/期限）', async () => {
    await migration.up(runner);
    expect(await columns()).toEqual([
      'id',
      'audit_row_id',
      'conversation_id',
      'user_id',
      'tool_name',
      'outcome',
      'body_state',
      'body_text',
      'body_bytes',
      'stored_bytes',
      'body_sha256',
      'original_sha256',
      'model_text',
      'model_chars',
      'model_sha256',
      'was_truncated',
      'created_at',
      'expires_at',
    ]);
  });

  it('audit_row_id 唯一：同一审计行不能有第二份正文', async () => {
    await migration.up(runner);
    const insert = () =>
      ds.query(
        `INSERT INTO "ai_tool_result_bodies"
          ("audit_row_id","user_id","tool_name","outcome","body_state","body_bytes","was_truncated","expires_at")
         VALUES (7,'42','query_customers','executed','stored',15,1,'2026-12-14T00:00:00Z')`,
      );
    await insert();
    await expect(insert()).rejects.toThrow();
    const [{ n }] = (await ds.query(
      `SELECT COUNT(*) AS n FROM "ai_tool_result_bodies"`,
    )) as Array<{ n: number }>;
    expect(n).toBe(1);
  });

  it('down 回滚干净（索引与表都删除）', async () => {
    await migration.up(runner);
    await migration.down(runner);
    const tables = (await ds.query(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='ai_tool_result_bodies'`,
    )) as Array<{ name: string }>;
    expect(tables).toHaveLength(0);
    const indexes = (await ds.query(
      `SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'IDX_%'`,
    )) as Array<{ name: string }>;
    expect(indexes).toHaveLength(0);
  });
});
