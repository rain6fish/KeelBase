// SPDX-License-Identifier: Apache-2.0

import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditReviewService, mergeRanges, uncoveredRanges } from './audit-review.service';
import type { AuditService } from './audit.service';

/**
 * AW-12, the parts that are pure or decided before the database is touched:
 *  - the range algebra (merge what a receipt covers, and say what is left),
 *  - the explicit assignment (owner + cadence),
 *  - the write guards (only the assigned reviewer; never a range ahead of the chain).
 *
 * The chain-facing half — deleting a receipt flips its range back to unreviewed, forging one fails
 * verification — needs a real database and lives in `test/audit-record-review.e2e-spec.ts`.
 *
 * AW-12 中**纯函数**与**落库之前**就决定的那一半：区间代数、显式指派（复核人 + 频度）、写入门禁
 * （只有被指派的复核人能签；不得签一个越过链尾的区间）。面对真链的那一半在 e2e 里。
 */
const configOf = (env: Record<string, string>): ConfigService =>
  ({ get: (key: string) => env[key] }) as unknown as ConfigService;

function repoWithMaxId(maxId: number | null) {
  const qb = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getRawOne: jest.fn().mockResolvedValue({ maxId }),
    getCount: jest.fn().mockResolvedValue(0),
  };
  return { createQueryBuilder: jest.fn(() => qb) } as never;
}

function build(env: Record<string, string>, maxId: number | null = 10) {
  const auditService = { log: jest.fn().mockResolvedValue({ id: 11, createdAt: new Date('2026-11-06T00:00:00Z') }) };
  const service = new AuditReviewService(
    repoWithMaxId(maxId),
    auditService as unknown as AuditService,
    configOf(env),
  );
  return { service, auditService };
}

describe('AW-12 review range algebra', () => {
  it('merges overlapping and adjacent ranges; order does not matter', () => {
    expect(
      mergeRanges([
        { fromId: 5, throughId: 8 },
        { fromId: 1, throughId: 4 },
        { fromId: 10, throughId: 12 },
      ]),
    ).toEqual([
      { fromId: 1, throughId: 8 },
      { fromId: 10, throughId: 12 },
    ]);
  });

  it('reports exactly what is left: the ends and the holes', () => {
    expect(uncoveredRanges([{ fromId: 3, throughId: 5 }], 8)).toEqual([
      { fromId: 1, throughId: 2 },
      { fromId: 6, throughId: 8 },
    ]);
  });

  it('nothing covered ⇒ everything is unreviewed; coverage past the end adds no phantom range', () => {
    expect(uncoveredRanges([], 4)).toEqual([{ fromId: 1, throughId: 4 }]);
    expect(uncoveredRanges([{ fromId: 1, throughId: 99 }], 4)).toEqual([]);
  });
});

describe('AW-12 explicit assignment', () => {
  it('is assigned only when BOTH owner and cadence are set', () => {
    expect(build({}).service.reviewConfig()).toEqual({ configured: false, owner: null, cadenceDays: null });
    expect(build({ AUDIT_REVIEW_OWNER: 'alice' }).service.reviewConfig().configured).toBe(false);
    expect(build({ AUDIT_REVIEW_CADENCE_DAYS: '7' }).service.reviewConfig().configured).toBe(false);
    expect(build({ AUDIT_REVIEW_OWNER: 'alice', AUDIT_REVIEW_CADENCE_DAYS: '7' }).service.reviewConfig()).toEqual({
      configured: true,
      owner: 'alice',
      cadenceDays: 7,
    });
  });

  it('reads the cadence the validator actually hands over — a number, not the raw string', () => {
    // The env schema declares this key `Joi.number()`, and Nest stores the validated (coerced) value.
    // A string-only reading called `.trim()` on that number and threw on the very configuration this
    // feature exists for; this pins the shape the validator produces.
    // 环境 schema 把该键声明为 `Joi.number()`，Nest 存的是**校验后**的值。只按字符串读会在数字上
    // 调 `.trim()` 并抛错 —— 正是「本功能存在的那一种配置」。此用例钉住校验器实际交出来的形状。
    const validatorEnv = { get: (key: string) => (key === 'AUDIT_REVIEW_CADENCE_DAYS' ? 7 : 'alice') };
    const service = new AuditReviewService(
      repoWithMaxId(10),
      { log: jest.fn() } as unknown as AuditService,
      validatorEnv as unknown as ConfigService,
    );
    expect(service.reviewConfig()).toEqual({ configured: true, owner: 'alice', cadenceDays: 7 });
  });

  it('rejects a cadence that is not a positive integer', () => {
    expect(
      build({ AUDIT_REVIEW_OWNER: 'alice', AUDIT_REVIEW_CADENCE_DAYS: '0' }).service.reviewConfig().cadenceDays,
    ).toBeNull();
    expect(
      build({ AUDIT_REVIEW_OWNER: 'alice', AUDIT_REVIEW_CADENCE_DAYS: '7.5' }).service.reviewConfig().cadenceDays,
    ).toBeNull();
  });
});

describe('AW-12 signing guards', () => {
  it('only the assigned reviewer may sign when an owner is configured', async () => {
    const { service, auditService } = build({ AUDIT_REVIEW_OWNER: 'alice', AUDIT_REVIEW_CADENCE_DAYS: '7' });
    await expect(
      service.record({ id: 2, username: 'bob' }, { fromId: 1, throughId: 5 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(auditService.log).not.toHaveBeenCalled();

    await expect(
      service.record({ id: 1, username: 'alice' }, { fromId: 1, throughId: 5 }),
    ).resolves.toMatchObject({ fromId: 1, throughId: 5, cadenceDays: 7 });
  });

  it('any audit reader may sign when nobody is assigned (and the statement says so)', async () => {
    const { service } = build({});
    await expect(
      service.record({ id: 2, username: 'bob' }, { fromId: 1, throughId: 5 }),
    ).resolves.toMatchObject({ fromId: 1, throughId: 5, cadenceDays: null });
  });

  it('refuses an inverted or non-positive range', async () => {
    const { service, auditService } = build({});
    await expect(service.record({ id: 1, username: 'a' }, { fromId: 5, throughId: 4 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.record({ id: 1, username: 'a' }, { fromId: 0, throughId: 4 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('refuses a range ahead of the chain — a review cannot cover rows nobody wrote', async () => {
    const { service, auditService } = build({}, 10);
    await expect(service.record({ id: 1, username: 'a' }, { fromId: 1, throughId: 11 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('writes the scope into the attested detail, as canonical JSON', async () => {
    const { service, auditService } = build({ AUDIT_REVIEW_OWNER: 'alice', AUDIT_REVIEW_CADENCE_DAYS: '7' });
    await service.record({ id: 1, username: 'alice' }, { fromId: 3, throughId: 9 });

    const entry = auditService.log.mock.calls[0][0] as { action: string; detail: string; userId: string };
    expect(entry.action).toBe('audit_review');
    expect(entry.userId).toBe('1');
    expect(JSON.parse(entry.detail)).toEqual({
      cadenceDays: 7,
      fromId: 3,
      kind: 'audit_review',
      throughId: 9,
    });
  });
});

/**
 * The chain-facing half of `status()` decided against a fake repository: which receipts are read,
 * which of them are malformed, and what is left unreviewed once their ranges are merged.
 *
 * `status()` 在假仓储上判的那一半：读回哪些回执、其中哪些读不出来，以及区间合并后还剩什么没复核。
 */
describe('AW-12 review status', () => {
  /** A receipt row as the chain stores it: the claim lives in `detail`, signed as one JSON object. */
  const receipt = (id: number, detail: string | null, username: string | null = 'alice') => ({
    id,
    detail,
    userId: '1',
    username,
    createdAt: new Date('2026-11-01T00:00:00Z'),
  });
  const claimDetail = (fromId: number, throughId: number, cadenceDays: number | null = 7) =>
    JSON.stringify({ cadenceDays, fromId, kind: 'audit_review', throughId });

  function statusRepo(opts: {
    receipts: ReturnType<typeof receipt>[];
    maxId: number | null;
    totalRows: number;
    /** Rows the sweep finds inside a given range — the `describeRanges` aggregate. */
    rowsIn: (fromId: number, throughId: number) => number;
    /** Rows inside a merged covered range — the `countInRanges` count. */
    coveredIn: (fromId: number, throughId: number) => number;
  }) {
    let rawCalls = 0;
    let pendingRange: { fromId: number; throughId: number } | null = null;
    const builder = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockImplementation(function (
        this: unknown,
        sql: string,
        params: { from: number; through: number },
      ) {
        if (sql.includes('BETWEEN')) pendingRange = { fromId: params.from, throughId: params.through };
        return this;
      }),
      getRawOne: jest.fn(async () => {
        if (rawCalls++ === 0) return { maxId: opts.maxId };
        const range = pendingRange ?? { fromId: 1, throughId: 1 };
        const rows = opts.rowsIn(range.fromId, range.throughId);
        return rows === 0
          ? { rows: 0, minId: null, maxId: null, firstRowAt: null }
          : { rows, minId: range.fromId, maxId: range.throughId, firstRowAt: '2026-11-01T00:00:00Z' };
      }),
      getCount: jest.fn(async () => {
        const range = pendingRange ?? { fromId: 1, throughId: 1 };
        return opts.coveredIn(range.fromId, range.throughId);
      }),
    };
    return {
      find: jest.fn(async () => opts.receipts),
      count: jest.fn(async (arg?: unknown) => (arg ? opts.receipts.length : opts.totalRows)),
      createQueryBuilder: jest.fn(() => builder),
      builder,
      opts,
    } as never;
  }

  const serviceWith = (repo: unknown) =>
    new AuditReviewService(repo as never, { log: jest.fn() } as unknown as AuditService, configOf({}));

  it('merges what receipts cover, reports the holes, and counts receipts out of the reviewable total', async () => {
    const repo = statusRepo({
      receipts: [receipt(2, claimDetail(1, 5)), receipt(7, claimDetail(9, 9))],
      maxId: 10,
      totalRows: 10,
      rowsIn: (from, through) => (from === 6 && through === 8 ? 3 : 0),
      coveredIn: () => 0,
    });

    const status = await serviceWith(repo).status();

    expect(status.maxAuditId).toBe(10);
    expect(status.totalRows).toBe(10);
    // Two of the ten positions are receipts, so eight rows are what a receipt could speak about.
    expect(status.reviewableRows).toBe(8);
    expect(status.reviewedRanges).toEqual([
      { fromId: 1, throughId: 5 },
      { fromId: 9, throughId: 9 },
    ]);
    expect(status.unreviewedRanges).toEqual([
      { fromId: 6, throughId: 8, rows: 3, firstRowAt: '2026-11-01T00:00:00.000Z' },
    ]);
    expect(status.malformedReceipts).toBe(0);
    // Newest first — the list is for a reader scanning recent attestations.
    // 最近的在前 —— 这份清单是给扫最近一次见证的读者看的。
    expect(status.receipts.map((r) => [r.fromId, r.throughId])).toEqual([
      [9, 9],
      [1, 5],
    ]);
  });

  it('a receipt whose claim cannot be read covers nothing and is counted, not guessed', async () => {
    const repo = statusRepo({
      receipts: [receipt(1, '{not json'), receipt(2, null), receipt(3, claimDetail(4, 4))],
      maxId: 4,
      totalRows: 4,
      rowsIn: (from, through) => (from === 1 && through === 3 ? 2 : 0),
      coveredIn: (from, through) => (from === 4 ? 1 : 0),
    });

    const status = await serviceWith(repo).status();

    expect(status.malformedReceipts).toBe(2);
    expect(status.reviewedRanges).toEqual([{ fromId: 4, throughId: 4 }]);
    expect(status.receipts).toHaveLength(1);
    // Four positions, three consumed by (unreadable) receipts, one record reviewed ⇒ two left.
    expect(status.reviewableRows).toBe(1);
    expect(status.reviewedRows).toBe(1);
    expect(status.unreviewedRows).toBe(0);
  });

  it('"is this row covered" answers from the receipts, not from a window', async () => {
    const repo = statusRepo({
      receipts: [receipt(2, claimDetail(1, 5)), receipt(7, claimDetail(9, 9))],
      maxId: 10,
      totalRows: 10,
      rowsIn: () => 0,
      coveredIn: () => 0,
    });
    const service = serviceWith(repo);

    await expect(service.isRowCovered(3)).resolves.toBe(true);
    await expect(service.isRowCovered(5)).resolves.toBe(true);
    await expect(service.isRowCovered(6)).resolves.toBe(false);
    await expect(service.isRowCovered(9)).resolves.toBe(true);
  });

  it('the window reading subtracts what the receipts cover; an empty window answers zero', async () => {
    const window = { since: new Date('2026-11-01T00:00:00Z'), until: new Date('2026-11-02T00:00:00Z') };
    const repoAnswering = (counts: number[]) => {
      let i = 0;
      const builder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn(async () => counts[i++] ?? 0),
      };
      return {
        find: jest.fn(async () => [receipt(2, claimDetail(1, 5))]),
        count: jest.fn(async () => 0),
        createQueryBuilder: jest.fn(() => builder),
      } as never;
    };

    // Ten rows in the window, four of them inside the reviewed range ⇒ six are unreviewed.
    // 窗口内 10 行，其中 4 行落在已复核区间内 ⇒ 6 行未复核。
    await expect(
      serviceWith(repoAnswering([10, 4])).unreviewedRowsInWindow(window),
    ).resolves.toBe(6);

    // No rows at all ⇒ zero, and the per-range counts are not asked (there is nothing to subtract).
    // 一行都没有 ⇒ 零，且不再去问各区间计数（没有可减的东西）。
    const empty = repoAnswering([0]);
    await expect(serviceWith(empty).unreviewedRowsInWindow(window)).resolves.toBe(0);
    expect((empty as unknown as { createQueryBuilder: jest.Mock }).createQueryBuilder).toHaveBeenCalledTimes(1);
  });

  it('an empty chain reports nothing reviewed and nothing unreviewed', async () => {
    const repo = statusRepo({
      receipts: [],
      maxId: null,
      totalRows: 0,
      rowsIn: () => 0,
      coveredIn: () => 0,
    });

    const status = await serviceWith(repo).status();

    expect(status.maxAuditId).toBeNull();
    expect(status.totalRows).toBe(0);
    expect(status.unreviewedRanges).toEqual([]);
    expect(status.receipts).toEqual([]);
    expect(status.truncated).toBe(false);
  });
});
