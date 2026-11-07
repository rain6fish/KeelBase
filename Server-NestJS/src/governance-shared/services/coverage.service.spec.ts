// SPDX-License-Identifier: Apache-2.0

import type { CoverageFacts } from '../../governance-core/coverage-gaps';
import { CoverageService } from './coverage.service';

/**
 * The parts of AW-3's statement that are decided without touching the database: the registry revision
 * a statement names, the deployment fact AW-17 adds, and the pure assembly (`forFacts`) that turns
 * facts into a verdict and a gap list.
 *
 * 覆盖声明里不碰数据库的那一半：声明点名的登记表版本、AW-17 新增的部署事实，以及把事实变成结论与
 * 缺口清单的纯装配（`forFacts`）。
 */

const facts = (overrides: Partial<CoverageFacts> = {}): CoverageFacts => ({
  runtime: 'ts',
  host: 'none',
  hostOwnsBusinessWrite: false,
  hostOwnAiPath: false,
  auditGranularity: 'all',
  sharedCacheAcrossDeployments: false,
  nonDiscreteActionSurfacesExposed: false,
  packageHasExternalAnchor: false,
  packageHasEffectWithoutSnapshot: false,
  packageHasOpenDispute: false,
  packageHasStalledRevoke: false,
  packageHasChatRow: false,
  externalWriteTargetWithoutStatusQuery: false,
  recordReviewConfigured: true,
  packageHasUnreviewedRows: false,
  ...overrides,
});

/** Only the pure half is exercised here, so the repositories are never reached. */
const service = (outboundFacts?: { hasWriteTargetWithoutStatusQuery: () => boolean }) =>
  new CoverageService(
    {} as never,
    {} as never,
    {} as never,
    undefined,
    outboundFacts as never,
    undefined,
  );

describe('AW-3 coverage statement (assembly)', () => {
  it('names the registry revision it was judged by — 12 hex, stable for a given registry', () => {
    const first = CoverageService.registryRevision();
    expect(first).toMatch(/^[0-9a-f]{12}$/);
    // Same registry, same revision: a statement can be read back against the gaps it was judged by.
    // 同一版登记表得到同一 revision：一份声明能对照当时据以判断的缺口读回来。
    expect(CoverageService.registryRevision()).toBe(first);
  });

  it('carries the scope it was asked about, in ISO 8601', () => {
    const statement = service().forFacts({
      kind: 'period',
      since: new Date('2026-11-01T00:00:00Z'),
      to: new Date('2026-11-02T00:00:00Z'),
      subjectRef: null,
      sources: [],
      facts: facts(),
    });

    expect(statement.scope).toEqual({
      kind: 'period',
      since: '2026-11-01T00:00:00.000Z',
      to: '2026-11-02T00:00:00.000Z',
      subjectRef: null,
    });
    expect(statement.registryRevision).toBe(CoverageService.registryRevision());
  });

  it('a review nobody is assigned to shows up as a gap — and an unknown-impact gap makes the verdict unknown', () => {
    // `record-review-unassigned` applies only when the reviewer/cadence pair is not configured, and it
    // is unknown-impact: the statement must not read as `complete` when nobody owns the reading.
    // 未配置复核人/频度时才出现 `record-review-unassigned`，且它是 unknown 级：没人负责这项阅读时，
    // 声明不得读作 `complete`。
    const statement = service().forFacts({
      kind: 'period',
      since: new Date('2026-11-01T00:00:00Z'),
      to: new Date('2026-11-02T00:00:00Z'),
      subjectRef: null,
      sources: [],
      // Both conjuncts: unassigned *and* rows someone should have read — an empty window has
      // nothing to review, so the standing caveat would be noise there.
      // 两个合取项都要：既未指派，又存在「本该有人读」的行 —— 空窗口没有可复核的东西，常设告诫在那儿只是噪音。
      facts: facts({ recordReviewConfigured: false, packageHasUnreviewedRows: true }),
    });

    expect(statement.gaps.map((g) => g.id)).toContain('record-review-unassigned');
    expect(statement.verdict).not.toBe('complete');
    // The wire shape keeps four fields per gap and nothing from the registry's own vocabulary.
    // 上线缆的每条缺口只有四个字段，登记表的自有词汇不外泄。
    for (const gap of statement.gaps) {
      expect(Object.keys(gap).sort()).toEqual(['affects', 'id', 'severity', 'statement']);
    }
  });

  it('gaps are ordered by severity, then by id — the order a reader acts on', () => {
    const statement = service().forFacts({
      kind: 'entity',
      since: new Date('2026-11-01T00:00:00Z'),
      to: new Date('2026-11-02T00:00:00Z'),
      subjectRef: 'event:1',
      sources: [],
      facts: facts({
        recordReviewConfigured: false,
        packageHasUnreviewedRows: true,
        externalWriteTargetWithoutStatusQuery: true,
      }),
    });

    const rank: Record<string, number> = { high: 0, medium: 1, low: 2 };
    const sorted = [...statement.gaps].sort(
      (a, b) => rank[a.severity] - rank[b.severity] || a.id.localeCompare(b.id),
    );
    expect(statement.gaps).toEqual(sorted);
  });

  it('AW-17 deployment fact: unbound says false, bound asks the facts object', async () => {
    // An unbound token means this assembly has no outbound targets to enumerate — the honest `false`,
    // not a green one.
    // 未绑定 token 表示这次装配没有可枚举的出站目标 —— 诚实的 `false`，而不是绿色的那一个。
    await expect(service().hasWriteTargetWithoutStatusQuery()).resolves.toBe(false);
    await expect(
      service({ hasWriteTargetWithoutStatusQuery: () => true }).hasWriteTargetWithoutStatusQuery(),
    ).resolves.toBe(true);
  });
});
