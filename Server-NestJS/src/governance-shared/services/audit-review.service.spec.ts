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
