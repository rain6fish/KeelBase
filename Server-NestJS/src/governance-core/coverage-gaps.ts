// SPDX-License-Identifier: Apache-2.0

/**
 * The limitations a package must declare about itself, and the rule that turns them into a verdict.
 *
 * Every evidence package answers "what happened"; none of them answered "what is this package *not*
 * able to show". The governance chain's second breakpoint says that out loud — the claim that the
 * recorded rows are a faithful and complete projection of the business actions is an **assumption**,
 * and while it stays unwritten the reader cannot see it. An auditor handed a package that is silent
 * about its own coverage will read that silence as completeness, which is the one failure this line
 * exists to prevent.
 *
 * So the gaps live here once. Each entry is a fact about the system, not a sentence about one
 * deployment: `appliesWhen` is a predicate over a **closed** set of facts, so a package declares the
 * gaps that actually apply to it rather than carrying a hand-copied caveat list that drifts from
 * reality. `verdictImpact` is what makes the verdict **derived** instead of asserted — see
 * `deriveVerdict`. `statement` is the only field that travels on the wire; `origin` stays here.
 *
 * Single home, two runtimes: this file is the one place gap ids are minted, and the Java runtime
 * mirrors the list (the same shape as the protocol vectors, which also live in one repo and are
 * compared across repos). A gap id means the same thing whichever runtime emitted the package.
 *
 * 每个证据包都回答「发生了什么」；没有一个回答「这份包**看不了**什么」。治理链的**断点二**把这件事
 * 说白了：「账上的行集合是业务动作成员的忠实且完整投影」**只是一个假设** —— 只要它不被写下来，读者就
 * 看不见它。一份对自己的覆盖面保持沉默的包，会被读成「完整」，而那正是这条线要防的那件事。
 *
 * 所以缺口只此一份。每条是**关于系统的事实**，不是一句关于某次部署的话：`appliesWhen` 是**闭集**
 * 事实上的谓词 ⇒ 一份包声明的是**真的适用于它**的那些缺口，而不是一份会与事实漂开的手抄告诫清单。
 * `verdictImpact` 让「结论」变成**算出来的**而不是写上去的 —— 见 `deriveVerdict`。`statement` 是唯一
 * 出门的字段；`origin` 留在这里。
 *
 * 单源、两个运行时：缺口 id 只在这一处铸造，Java 运行时**镜像**这份清单（与协议向量同一形状 ——
 * 向量也住在一个仓、跨仓比对）。一个缺口 id 无论由哪个运行时发出，含义相同。
 */

/**
 * The facts a gap predicate may read — closed on purpose. A predicate that can read anything is a
 * predicate nobody can evaluate, and an entry whose condition cannot be evaluated would have to be
 * included always, which is the silent-completeness failure over again.
 *
 * 缺口谓词可读的事实集合 —— **有意闭集**。什么都能读的谓词等于没人能求值的谓词，而条件求不了值的
 * 条目只能永远算「适用」，那就又回到了「沉默即完整」那个失效模式。
 */
export interface CoverageFacts {
  /** Producing runtime. / 产出这份包的运行时。 */
  runtime: 'ts' | 'java';
  /** Standalone, or embedded in a host. / 独立部署，还是嵌在某个宿主里。 */
  host: 'none' | 'yudao' | 'ruoyi';
  /** The host, not the runtime, writes the business row. / 业务那一行由**宿主**（不是运行时）写。 */
  hostOwnsBusinessWrite: boolean;
  /** The host runs an AI path of its own. / 宿主自己有一条 AI 路径。 */
  hostOwnAiPath: boolean;
  /** `governance-policy.audit.granularity`. / 治理策略的审计粒度。 */
  auditGranularity: 'all' | 'write' | 'off';
  /** One cache serves more than one deployment. / 一个缓存服务于不止一个部署。 */
  sharedCacheAcrossDeployments: boolean;
  /** Action surfaces exist that are not discrete named tools. / 存在不是离散具名工具的动作面。 */
  nonDiscreteActionSurfacesExposed: boolean;
  /** Produced by an external anchor covering the tail. / 由覆盖尾部的**外部锚**产出。 */
  packageHasExternalAnchor: boolean;
  /** Package holds an effect whose before/after was not captured. / 包里有 before/after 未捕获的副作用。 */
  packageHasEffectWithoutSnapshot: boolean;
  /** Package holds an effect with an open revoke dispute. / 包里有撤销争议未结的副作用。 */
  packageHasOpenDispute: boolean;
  /** Package holds an effect stuck in `compensating`. / 包里有卡在 `compensating` 的副作用。 */
  packageHasStalledRevoke: boolean;
  /** Package holds at least one chat row. / 包里至少有一条 chat 行。 */
  packageHasChatRow: boolean;
}

export type CoverageFact = keyof CoverageFacts;

/** One conjunct of a predicate: `facts[fact] === equals`. / 谓词的一个合取项。 */
export type CoverageCondition = {
  [K in CoverageFact]: { fact: K; equals: CoverageFacts[K] };
}[CoverageFact];

export interface CoverageGap {
  /**
   * Stable, kebab-case, **never reused** — reusing one would change what an already-issued package
   * means. The console renders Chinese from this id; the wire carries `statement` as the fallback.
   *
   * 稳定、kebab-case、**永不复用** —— 复用会改变一份已发出的包的含义。控制台按这个 id 出中文；
   * wire 上带 `statement` 作兜底。
   */
  readonly id: string;
  readonly severity: 'high' | 'medium' | 'low';
  /**
   * Whether the gap limits *this* package's conclusion, or is a standing caveat about the
   * deployment. / 这个缺口限制的是**这份包**的结论，还是关于整个部署的常设告诫。
   */
  readonly affects: 'this_package' | 'whole_deployment';
  /**
   * What the gap does to the verdict when it applies. `unknown` is for gaps where we cannot even say
   * *what* is missing — not a stronger `partial`. / 适用时它对结论的影响。`unknown` 是「连漏了什么
   * 都说不出」，**不是**更强的 `partial`。
   */
  readonly verdictImpact: 'unknown' | 'partial';
  /** AND-ed; empty means "always applies". / 合取；空数组表示恒适用。 */
  readonly appliesWhen: readonly CoverageCondition[];
  /**
   * English, 1–2 sentences. **This is the wire field** — a third party without our i18n can read it.
   * / 英文 1–2 句。**这是上 wire 的字段** —— 没有我方 i18n 的第三方读得到。
   */
  readonly statement: string;
  /** Internal traceability; **not on the wire**. / 内部追溯用；**不上 wire**。 */
  readonly origin: string;
}

/**
 * Order carries no meaning — append new entries at the end, and let the console sort for display.
 * The spec pins the ids and the predicate behaviour, not the sequence.
 *
 * 顺序不承载语义 —— 新条目追加在末尾，展示顺序交给控制台去排。spec 钉的是 id 与谓词行为，不是先后。
 */
export const COVERAGE_GAPS: readonly CoverageGap[] = [
  {
    id: 'chain-tail-deletion',
    severity: 'high',
    affects: 'this_package',
    verdictImpact: 'unknown',
    // An external anchor is what closes this — the chain alone cannot, by construction.
    // 关掉它的是**外部锚**；链本身按构造做不到。
    appliesWhen: [{ fact: 'packageHasExternalAnchor', equals: false }],
    statement:
      'A valid hash chain proves the recorded rows are internally consistent; it does not prove that no row was removed from the tail.',
    origin: 'ACT-8 / hs11-audit-chain.spec §边界',
  },
  {
    id: 'audit-granularity-off',
    severity: 'high',
    affects: 'whole_deployment',
    verdictImpact: 'unknown',
    appliesWhen: [{ fact: 'auditGranularity', equals: 'off' }],
    statement:
      'Audit granularity is off, so no AI audit rows are written at all; an absence of AI actions here is not evidence that none occurred.',
    origin: 'HS-9 governance-policy.audit.granularity',
  },
  {
    id: 'audit-granularity-write-drops-conversation-rows',
    severity: 'medium',
    affects: 'whole_deployment',
    verdictImpact: 'partial',
    appliesWhen: [{ fact: 'auditGranularity', equals: 'write' }],
    statement:
      'Audit granularity is write, so conversation-level rows are not written; only tool-scoped actions appear here.',
    origin: 'HS-9 governance-policy.audit.granularity',
  },
  {
    id: 'effect-change-not-captured',
    severity: 'medium',
    affects: 'this_package',
    verdictImpact: 'partial',
    appliesWhen: [{ fact: 'packageHasEffectWithoutSnapshot', equals: true }],
    statement:
      'An effect here has no before/after snapshot, so what it changed can neither be shown nor compared; its identity is not fully establishable.',
    origin: 'REV-6',
  },
  {
    id: 'chat-content-by-reference',
    severity: 'low',
    affects: 'this_package',
    verdictImpact: 'partial',
    appliesWhen: [{ fact: 'packageHasChatRow', equals: true }],
    statement:
      'Chat rows reference the conversation rather than embedding its text; the message content requires a separate, explicitly authorized request.',
    origin: 'AU-4 (by design)',
  },
  {
    id: 'revoke-dispute-never-auto-cleared',
    severity: 'medium',
    affects: 'this_package',
    verdictImpact: 'partial',
    appliesWhen: [{ fact: 'packageHasOpenDispute', equals: true }],
    statement:
      'An open revoke dispute is cleared only when an administrator acknowledges it; it is never cleared automatically, and re-opens if the set of missing declarations changes.',
    origin: 'ARC-6',
  },
  {
    id: 'revoke-can-stall-indefinitely',
    severity: 'medium',
    affects: 'this_package',
    verdictImpact: 'partial',
    appliesWhen: [{ fact: 'packageHasStalledRevoke', equals: true }],
    statement:
      'A revoke can remain in compensating indefinitely; staleness is surfaced as a read-only flag and never changes the stored status by itself.',
    origin: 'REV-11',
  },
  {
    id: 'chain-verification-cached-without-deployment-identity',
    severity: 'medium',
    affects: 'whole_deployment',
    verdictImpact: 'partial',
    appliesWhen: [{ fact: 'sharedCacheAcrossDeployments', equals: true }],
    statement:
      'Chain verification is cached for 60 seconds under a key that does not identify the deployment, so a shared cache can return another deployment verdict.',
    origin: 'AW-5',
  },
  {
    id: 'risk-level-not-expressible-for-non-discrete-actions',
    severity: 'high',
    affects: 'whole_deployment',
    verdictImpact: 'unknown',
    appliesWhen: [{ fact: 'nonDiscreteActionSurfacesExposed', equals: true }],
    statement:
      'Risk is assigned per declared tool; an action surface that is not a discrete named tool cannot carry a risk level and would not appear here.',
    origin: '治理链断点一（RISK-A）',
  },
  {
    id: 'host-write-not-in-same-transaction',
    severity: 'medium',
    affects: 'this_package',
    verdictImpact: 'partial',
    appliesWhen: [
      { fact: 'runtime', equals: 'java' },
      { fact: 'hostOwnsBusinessWrite', equals: true },
    ],
    statement:
      'Where the runtime is embedded in a host that owns the business write, that write and its audit row are not written in one transaction; a crash between them leaves an executed write unaudited.',
    origin: 'D28④（KeelBase4J）',
  },
  {
    id: 'host-ai-path-not-governed',
    severity: 'high',
    affects: 'this_package',
    verdictImpact: 'unknown',
    appliesWhen: [{ fact: 'hostOwnAiPath', equals: true }],
    statement:
      'The host runs an AI path of its own that does not pass through the governance engine, so its tool calls are outside this package.',
    origin: 'D42 / D44（KeelBase4YuDao）',
  },
];

function conditionHolds(condition: CoverageCondition, facts: CoverageFacts): boolean {
  const actual: unknown = (facts as Record<CoverageFact, unknown>)[condition.fact];
  return actual === condition.equals;
}

/** The gaps whose predicate holds for `facts`. / 谓词在 `facts` 下成立的缺口。 */
export function applicableGaps(facts: CoverageFacts): CoverageGap[] {
  return COVERAGE_GAPS.filter((gap) => gap.appliesWhen.every((c) => conditionHolds(c, facts)));
}

/**
 * The verdict is **computed**, never written by hand: no applicable gap means `complete`; a gap that
 * says "we cannot even tell what is missing" makes the whole thing `unknown`; anything else is
 * `partial`. Reporting `unknown` as `partial` would claim we know what we are missing — which is the
 * one thing that gap says we do not.
 *
 * 结论是**算出来的**，从不手写：没有适用的缺口 ⇒ `complete`；只要有一条缺口说「连漏了什么都说不出」
 * ⇒ 整份 `unknown`；其余 ⇒ `partial`。把 `unknown` 报成 `partial` 等于声称我们知道漏了什么 ——
 * 而那恰恰是那条缺口说我们**不知道**的事。
 */
export function deriveVerdict(facts: CoverageFacts): 'complete' | 'partial' | 'unknown' {
  const gaps = applicableGaps(facts);
  if (gaps.length === 0) return 'complete';
  return gaps.some((gap) => gap.verdictImpact === 'unknown') ? 'unknown' : 'partial';
}
