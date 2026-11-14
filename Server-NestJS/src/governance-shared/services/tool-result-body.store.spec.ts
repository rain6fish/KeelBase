// SPDX-License-Identifier: Apache-2.0

import { DataSource } from 'typeorm';
import { AiToolResultBody } from '../entities/ai-tool-result-body.entity';
import { ToolResultBodyStore } from './tool-result-body.store';

/**
 * Real in-memory sqlite, real entity metadata: this is also what proves the nullable unions carry
 * their explicit `type` (a `string | null` column without one makes TypeORM throw
 * `DataTypeNotSupportedError` on synchronize).
 *
 * 真实内存 sqlite + 真实实体元数据：这同时证明 nullable 联合类型都显式带了 `type`
 * （`string | null` 漏写会让 TypeORM 在 synchronize 时抛 `DataTypeNotSupportedError`）。
 */
describe('ToolResultBodyStore', () => {
  let ds: DataSource;
  let store: ToolResultBodyStore;

  const base = {
    auditRowId: 7,
    conversationId: 'c1',
    userId: '42',
    toolName: 'query_customers',
    outcome: 'executed',
    bodyState: 'stored',
    bodyText: '{"success":true}',
    bodyBytes: 15,
    storedBytes: 15,
    bodySha256: 'b'.repeat(64),
    originalSha256: 'a'.repeat(64),
    modelText: '{"success":true}',
    modelChars: 15,
    modelSha256: 'c'.repeat(64),
    wasTruncated: true,
    expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
  };

  beforeEach(async () => {
    ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [AiToolResultBody],
      synchronize: true,
    });
    await ds.initialize();
    store = new ToolResultBodyStore(ds.getRepository(AiToolResultBody));
  });

  afterEach(async () => {
    await ds.destroy();
  });

  it('按审计行写入并读回', async () => {
    await store.saveIfAbsent(base);
    const row = await store.findOneByAuditRow(7);
    expect(row).not.toBeNull();
    expect(row!.toolName).toBe('query_customers');
    expect(row!.bodyState).toBe('stored');
    expect(row!.wasTruncated).toBe(true);
  });

  it('同一 audit_row_id 重复写入被忽略（幂等，不产生第二行）', async () => {
    await store.saveIfAbsent(base);
    await store.saveIfAbsent({ ...base, bodyText: '{"success":false}' });
    expect(await ds.getRepository(AiToolResultBody).count()).toBe(1);
    expect((await store.findOneByAuditRow(7))!.bodyText).toBe('{"success":true}');
  });

  it('过期只清文本与模型投影，保留墓碑（哈希/大小/标记）', async () => {
    await ds.getRepository(AiToolResultBody).save({
      ...base,
      expiresAt: new Date(Date.now() - 1000),
    });

    const affected = await store.expireBefore(new Date());
    expect(affected).toBe(1);

    const row = await store.findOneByAuditRow(7);
    expect(row!.bodyState).toBe('expired');
    expect(row!.bodyText).toBeNull();
    expect(row!.modelText).toBeNull();
    expect(row!.bodySha256).toBe('b'.repeat(64));
    expect(row!.originalSha256).toBe('a'.repeat(64));
    expect(row!.bodyBytes).toBe(15);
    expect(row!.wasTruncated).toBe(true);
  });

  it('未到期的行不被清理', async () => {
    await store.saveIfAbsent(base);
    expect(await store.expireBefore(new Date())).toBe(0);
    expect((await store.findOneByAuditRow(7))!.bodyState).toBe('stored');
  });
});
