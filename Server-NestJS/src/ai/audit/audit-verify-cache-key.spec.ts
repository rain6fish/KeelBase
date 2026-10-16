// SPDX-License-Identifier: Apache-2.0

import type { DataSource } from 'typeorm';
import { AuditEvidenceService } from './audit-evidence.service';
import { auditVerifyCacheKey } from './cache-keys';
import type { CacheService } from '../../common/cache/cache.service';

/**
 * AW-5: the verify cache key must carry the **database identity**.
 *
 * <p>The defect this pins: with the key a bare `audit:verify`, one shared cache and two databases, a
 * verdict computed for database A is served for a query about database B. For an audit feature that is a
 * wrong answer, not a slow one. The governance console is the concrete second database (it keeps its own,
 * `config/governance-data-source.ts`). Two services differing only in their DataSource's `database` must
 * therefore never read each other's verdict — even from the same cache.
 *
 * AW-5：校验缓存键必须带**数据库身份**。本用例钉住的缺陷：键是裸 `audit:verify`、缓存共享、又出现第二个库时，
 * 对 A 库算出的结论会被当 B 库的答案发出——对审计而言这是**答错**而非变慢。独立治理台就是那个真实的第二个库
 * （自带治理库，`config/governance-data-source.ts`）。因此，仅 DataSource 的 `database` 不同的两个服务，即便
 * 共用同一份缓存，也**绝不**能读到对方的结论。
 */

/** 最小内存缓存：驱动 get/set/delete/delByPrefix，等价于 CacheService 在启用时的语义。 */
class InMemoryCache {
  readonly store = new Map<string, unknown>();
  async get<T>(key: string): Promise<T | undefined> {
    return this.store.get(key) as T | undefined;
  }
  async set(key: string, value: unknown): Promise<void> {
    if (value != null) this.store.set(key, value);
  }
  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
  async delByPrefix(prefix: string): Promise<void> {
    for (const k of [...this.store.keys()]) if (k.startsWith(prefix)) this.store.delete(k);
  }
  get enabled(): boolean {
    return true;
  }
}

/** 一个只认自己那份数据与结论的 verify 服务；DataSource 只通过 `database` 与另一个区分。 */
function buildService(
  database: string,
  rows: Array<Record<string, unknown>>,
  verdict: { valid: boolean; checked: number; brokenIndex?: number | null },
  cache: CacheService,
): AuditEvidenceService {
  const logRepo = { find: jest.fn().mockResolvedValue(rows) };
  const chain = { computeHash: jest.fn(), verifyChain: jest.fn().mockReturnValue(verdict) };
  const dataSource = { options: { type: 'better-sqlite3', database } } as unknown as DataSource;
  // 构造参数按序：logRepo, effectsRepo, auditChain, cacheService, [@Optional…], dataSource（末位）
  return new AuditEvidenceService(
    logRepo as never,
    {} as never,
    chain as never,
    cache,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    dataSource,
  );
}

describe('AW-5: 审计链校验缓存键带数据库身份', () => {
  it('两个库各自的结论不互相串——即便命中同一份缓存', async () => {
    const cache = new InMemoryCache() as unknown as CacheService;

    // 库 A：链是断的。库 B：链是好的。两库结论必须相反。
    const svcA = buildService('./data/front.sqlite', [{ id: 1, hash: 'a' }], { valid: false, checked: 1, brokenIndex: 1 }, cache);
    const svcB = buildService(
      './data/governance.sqlite',
      [{ id: 1, hash: 'b' }, { id: 2, hash: 'c' }],
      { valid: true, checked: 2, brokenIndex: null },
      cache,
    );

    const a = await svcA.verifyChain(); // 先算 A，写进共享缓存
    const b = await svcB.verifyChain(); // B 必须自算，不得读到 A 的结论

    expect(a.valid).toBe(false);
    // ⚠ 旧实现（单一键 `audit:verify`）此处会拿到 A 缓存的 false —— 这正是本用例要拦住的红。
    // ⚠ Against the old key (a single `audit:verify`) this reads A's cached false — the red this test pins.
    expect(b.valid).toBe(true);
    expect(b.checked).toBe(2);

    // 两个库各占一个键，形状带 type + database（单一来源 = cache-keys.ts）
    expect([...(cache as unknown as InMemoryCache).store.keys()].sort()).toEqual([
      'audit:verify:better-sqlite3:./data/front.sqlite',
      'audit:verify:better-sqlite3:./data/governance.sqlite',
    ]);
  });

  it('失效作用域收窄到一个库：A 的键前缀匹配不到 B 的键', () => {
    const dsA = { options: { type: 'better-sqlite3', database: './data/front.sqlite' } } as unknown as DataSource;
    const dsB = { options: { type: 'better-sqlite3', database: './data/governance.sqlite' } } as unknown as DataSource;

    const keyA = auditVerifyCacheKey(dsA);
    const keyB = auditVerifyCacheKey(dsB);

    expect(keyA).not.toBe(keyB);
    // delByPrefix(keyA) 走 MATCH `${keyA}*` —— 不能命中 B 的键
    expect(keyB.startsWith(keyA)).toBe(false);
    expect(keyA.startsWith(keyB)).toBe(false);
  });

  it('无 DataSource（手工构造）回落共享前缀——不抛、与加身份前一致', () => {
    expect(auditVerifyCacheKey(undefined)).toBe('audit:verify');
    expect(auditVerifyCacheKey(null)).toBe('audit:verify');
  });
});
