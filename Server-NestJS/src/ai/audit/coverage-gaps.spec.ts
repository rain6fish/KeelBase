// SPDX-License-Identifier: Apache-2.0

import {
  COVERAGE_GAPS,
  CoverageFacts,
  applicableGaps,
  deriveVerdict,
} from './coverage-gaps';

/**
 * What these cases pin is that the verdict is **derived**, and that the registry cannot quietly
 * lose its teeth: the ids stay stable and unique, the wire text stays English (a Chinese `statement`
 * would be rendered to a third party who has no i18n), and only a `high` gap is allowed to say
 * "we cannot even tell what is missing".
 *
 * The last case is the one worth reading twice: **today no package can come back `complete` unless
 * it carries an external anchor** — that is intended, not a bug. The chain cannot prove absence of a
 * tail deletion; the anchor is what closes it. If someone later "fixes" that by dropping the gap,
 * this case goes red on purpose.
 *
 * 这些用例钉的是「结论是**算出来的**」，以及登记表不会悄悄失去牙齿：id 稳定且唯一；出门的文本保持英文
 * （一份中文 `statement` 会被交给**没有 i18n 的第三方**）；只有 `high` 缺口才允许说「连漏了什么都说不出」。
 *
 * 最后一条值得读两遍：**今天除非带着外部锚，没有一份包能判 `complete`** —— 这是**有意的**，不是 bug。
 * 链证明不了尾部删除，关掉它的是外部锚。若将来有人靠删掉那条缺口来「修」它，这条用例会**故意变红**。
 */
const CLEAN: CoverageFacts = {
  runtime: 'ts',
  host: 'none',
  hostOwnsBusinessWrite: false,
  hostOwnAiPath: false,
  auditGranularity: 'all',
  sharedCacheAcrossDeployments: false,
  nonDiscreteActionSurfacesExposed: false,
  packageHasExternalAnchor: true,
  packageHasEffectWithoutSnapshot: false,
  packageHasOpenDispute: false,
  packageHasStalledRevoke: false,
  packageHasChatRow: false,
};

const facts = (overrides: Partial<CoverageFacts> = {}): CoverageFacts => ({ ...CLEAN, ...overrides });

describe('coverage-gaps（缺口登记表单一真源）', () => {
  it('id：唯一、kebab-case（复用一个 id 会改变一份已发出的包的含义）', () => {
    const ids = COVERAGE_GAPS.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('覆盖面：AW-1 点名的那几处，每一处都能在表里找到它的由来', () => {
    const origins = COVERAGE_GAPS.map((g) => g.origin);
    for (const named of ['ACT-8', 'HS-9', 'REV-6', 'D28④', 'D42']) {
      expect(origins.some((o) => o.includes(named))).toBe(true);
    }
    // D49⑤（副作用行显示不了「谁」）**有意不在表里** —— JV-65 要先核定它是否仍成立：
    // 本仓 `SideEffect` 实体是带 owner 的，那句读数可能只是「实体有、端点不透」。
    // 一条**未经核实**的缺口比没有更糟：它会给每一份包挂上一句假的告诫。
    // D49⑤ is deliberately absent — JV-65 must first settle whether it still holds. An unverified
    // gap is worse than none: it would attach a false caveat to every package.
    expect(origins.some((o) => o.includes('D49'))).toBe(false);
  });

  it('每一条都留由来（origin 不上 wire，但缺了就没法追溯它为什么存在）', () => {
    for (const gap of COVERAGE_GAPS) expect(gap.origin.trim().length).toBeGreaterThan(0);
  });

  it('statement：非空、以句号收尾、**不含中文**（wire 上给的是没有 i18n 的第三方）', () => {
    for (const gap of COVERAGE_GAPS) {
      expect(gap.statement.trim().length).toBeGreaterThan(0);
      expect(gap.statement.endsWith('.')).toBe(true);
      expect(gap.statement).not.toMatch(/[一-鿿]/);
    }
  });

  it('只有 high 才允许判 unknown —— 说「连漏了什么都说不出」是最强的一句话', () => {
    for (const gap of COVERAGE_GAPS) {
      if (gap.verdictImpact === 'unknown') expect(gap.severity).toBe('high');
    }
  });

  it('谓词求值：空 appliesWhen 恒适用；有条件的按事实命中', () => {
    const always = COVERAGE_GAPS.filter((g) => g.appliesWhen.length === 0);
    for (const gap of always) expect(applicableGaps(CLEAN)).toContainEqual(gap);

    // granularity=off 与 write 是两条互斥的条目，不该同时出现。
    // granularity=off and write are two mutually exclusive entries; they must not both fire.
    const off = applicableGaps(facts({ auditGranularity: 'off' })).map((g) => g.id);
    const write = applicableGaps(facts({ auditGranularity: 'write' })).map((g) => g.id);
    expect(off).toContain('audit-granularity-off');
    expect(off).not.toContain('audit-granularity-write-drops-conversation-rows');
    expect(write).toContain('audit-granularity-write-drops-conversation-rows');
    expect(write).not.toContain('audit-granularity-off');
  });

  it('谓词是多条件合取：宿主那两条只在 java + 对应条件同时成立时才出', () => {
    const tsHost = applicableGaps(
      facts({ runtime: 'ts', host: 'yudao', hostOwnsBusinessWrite: true, hostOwnAiPath: true }),
    ).map((g) => g.id);
    expect(tsHost).not.toContain('host-write-not-in-same-transaction');

    const java = applicableGaps(
      facts({ runtime: 'java', hostOwnsBusinessWrite: true, hostOwnAiPath: true }),
    ).map((g) => g.id);
    expect(java).toContain('host-write-not-in-same-transaction');
    expect(java).toContain('host-ai-path-not-governed');
  });

  it('结论：一条缺口都没有 ⇒ complete', () => {
    expect(deriveVerdict(CLEAN)).toBe('complete');
  });

  it('结论：只有 partial 类缺口 ⇒ partial', () => {
    expect(deriveVerdict(facts({ packageHasChatRow: true }))).toBe('partial');
  });

  it('结论：partial 与 unknown 并存时取 unknown（更强的那个说了算）', () => {
    expect(deriveVerdict(facts({ packageHasChatRow: true, hostOwnAiPath: true }))).toBe('unknown');
  });

  it('**今天没有外部锚的包一律判 unknown —— 这是有意的**', () => {
    // 尾部删除检不出：链本身关不掉这个缺口，只有外部锚能。见 hs11-audit-chain.spec。
    // A tail deletion is undetectable: the chain cannot close this gap, only an external anchor can.
    expect(deriveVerdict(facts({ packageHasExternalAnchor: false }))).toBe('unknown');
    expect(deriveVerdict(CLEAN)).toBe('complete');
  });
});
