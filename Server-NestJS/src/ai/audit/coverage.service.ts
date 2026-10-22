// SPDX-License-Identifier: Apache-2.0

import { Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, IsNull, Not, Repository, type FindOptionsWhere } from 'typeorm';
import { createHash } from 'node:crypto';
import { AiAuditLog } from '../../governance-shared/entities/ai-audit-log.entity';
import { AiToolSideEffect } from '../../governance-shared/entities/ai-tool-side-effect.entity';
import { REVOKE_STATUS } from '../../governance-core/revoke-status';
import { GovernancePolicyService } from '../governance-bridge/governance-policy.service';
import { COVERAGE_GAPS, CoverageFacts, applicableGaps, deriveVerdict } from '../../governance-core/coverage-gaps';
import { OrgService } from '../../org/org.service';
import {
  applyAuditScopeToWhere,
  resolveAuditReaderScope,
  type AuditReaderContext,
} from './audit-reader-scope';

/**
 * Assembles the coverage statement for a scope — "what was read, and what this reading cannot show".
 *
 * It is the reader half of `coverage-gaps.ts`: that file says what the gaps *are* and computes the
 * verdict from a fact set; this file is the only place that **produces** a fact set, so a reader never
 * has to guess which caveats apply. Nothing here decides which gaps exist — adding one to the registry
 * makes it appear in every statement with no change to this file, which is what AW-3 asks for.
 *
 * The facts split in two, and the split matters:
 * - **Deployment facts** (runtime, host, granularity) — read from configuration and the governance
 *   policy.
 * - **Scope facts** (`packageHas…`) — counted from the data in the scope, because "does this period
 *   contain an effect whose change was never captured" is not answerable from configuration.
 *
 * Two facts are deliberately pinned rather than derived; both say why, and neither is optimistic:
 * - `sharedCacheAcrossDeployments` — the code cannot see a second deployment sharing its Redis. `false`
 *   is the correct answer for the deployment shape this repository supports (one deployment, one set of
 *   databases), and the gap stays in the registry for the shape it does not support. There is no input
 *   for that yet; recorded rather than papered over.
 * - `packageHasExternalAnchor` — **the anchor has no endpoint** (measured 2026-10-16, AW-1). So a
 *   package cannot carry one, and the statement says `unknown` instead of pretending the chain is
 *   enough. This is the honest end of that finding.
 *
 * 为某个口径组装覆盖声明 —— 「读了什么，以及这份读法**看不了**什么」。
 *
 * 它是 `coverage-gaps.ts` 的读者那一半：那个文件说缺口**是什么**、并从一组事实算出结论；本文件是**唯一
 * 生产**这组事实的地方，于是读者不必猜哪几条告诫适用。这里**不决定**有哪些缺口 —— 往登记表里加一条，
 * 它就会出现在每一份声明里、本文件一字不改，而那正是 `AW-3` 要的。
 *
 * 事实分两半，这个分法要紧：
 * - **部署事实**（runtime / host / 粒度）—— 读自配置与治理策略。
 * - **口径事实**（`packageHas…`）—— 从该口径下的数据点出来，因为「这一期里有没有一次变更没被捕获」
 *   不是配置能回答的。
 *
 * 两条事实**有意写死**而不是派生，各自写明理由，且**都不乐观**：
 * - `sharedCacheAcrossDeployments` —— 代码看不见是否另有部署共用它的 Redis。对本仓支持的部署形态
 *   （一个部署 + 一套库）取 `false` 是**正确**的，而那条缺口留在登记表里，供它不支持的形态用。今天
 *   没有那个输入口，**如实记下**而不是糊过去。
 * - `packageHasExternalAnchor` —— **外部锚没有端点**（2026-10-16 实测，`AW-1`）。故一份包带不了它，
 *   声明于是说 `unknown`，而不是假装链就够了。这是那条发现的**诚实收尾**。
 */

export interface CoverageSource {
  id: string;
  state: 'complete' | 'partial' | 'absent' | 'unreachable';
  rows: number | null;
}

/** The wire shape: `registryRevision` / `scope` / `sources` / `verdict` / `gaps`. `origin` and
 *  `verdictImpact` stay in the registry — they are ours, not the reader's. */
export interface CoverageStatement {
  registryRevision: string;
  scope: { kind: 'action' | 'period' | 'entity'; since: string; to: string; subjectRef: string | null };
  sources: CoverageSource[];
  verdict: 'complete' | 'partial' | 'unknown';
  gaps: { id: string; severity: string; affects: string; statement: string }[];
}

/**
 * Everything a statement needs, with the facts already computed. Two callers supply it: the period
 * query below, and the evidence root — which packages **one action** and already holds that action's
 * rows, so making it re-query would be both slower and a second definition of the same facts.
 *
 * 一份声明所需的全部，事实已经算好。两个调用方提供它：下面的期间查询，以及**证据根** —— 后者打包的是
 * **单条动作**、那几行本来就在它手上，让它重新查一遍既更慢、又是同一组事实的第二份定义。
 */
export interface CoverageScopeInput {
  kind: 'action' | 'period' | 'entity';
  since: Date;
  to: Date;
  subjectRef: string | null;
  /** Only the sources that were actually read. / 只列**真的读过**的源。 */
  sources: CoverageSource[];
  facts: CoverageFacts;
}

const SEVERITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

@Injectable()
export class CoverageService {
  constructor(
    @InjectRepository(AiAuditLog) private readonly auditLogs: Repository<AiAuditLog>,
    @InjectRepository(AiToolSideEffect) private readonly effects: Repository<AiToolSideEffect>,
    private readonly policy: GovernancePolicyService,
    // AW-2 aggregate half: the statement's counts are rows too, so an audit reader's statement
    // counts only their own organisation. Optional like the other scope helpers — an absent org
    // service falls back to the reader's own rows, never to everything.
    //
    // AW-2 聚合那一半：声明里的计数同样是「行」，故审计读者的声明只数它自己的组织。与其余范围助手
    // 一样可选 —— 组织服务缺席时退回读者本人行，绝不是全部。
    @Optional() private readonly orgService?: OrgService,
  ) {}

  /**
   * Identifies **which version of the registry** a statement was computed against — first 12 hex of the
   * registry's own serialisation, the same convention `governance-policy.revision` uses. Without it a
   * statement saying `complete` cannot be read back against the gaps it was judged by.
   *
   * 标明一份声明是**按哪一版登记表**算出来的 —— 取该登记表自身序列化的前 12 hex，与
   * `governance-policy.revision` 同一约定。没有它，一句 `complete` 就无法对照当时的缺口读回来。
   */
  static registryRevision(): string {
    return createHash('sha256').update(JSON.stringify(COVERAGE_GAPS)).digest('hex').slice(0, 12);
  }

  /**
   * Assembles a statement from facts the caller already has. **Pure** — no queries, no clock — so the
   * one place that decides how a verdict reads is here, whoever supplies the facts.
   *
   * 从调用方已有的事实组装一份声明。**纯函数** —— 不查库、不读时钟 —— 于是「结论怎么读」只由这一处决定，
   * 无论事实由谁提供。
   */
  forFacts(input: CoverageScopeInput): CoverageStatement {
    const gaps = applicableGaps(input.facts)
      .slice()
      .sort(
        (a, b) =>
          (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9) ||
          a.id.localeCompare(b.id),
      )
      .map((g) => ({
        id: g.id,
        severity: g.severity,
        affects: g.affects,
        statement: g.statement,
      }));

    return {
      registryRevision: CoverageService.registryRevision(),
      scope: {
        kind: input.kind,
        since: input.since.toISOString(),
        to: input.to.toISOString(),
        subjectRef: input.subjectRef,
      },
      sources: input.sources,
      verdict: deriveVerdict(input.facts),
      gaps,
    };
  }

  async forScope(scope: {
    since: Date;
    until: Date;
    userId?: string;
    reader?: AuditReaderContext;
  }): Promise<CoverageStatement> {
    const { since, until, userId, reader } = scope;
    const granularity = await this.policy.getAuditGranularity();
    // Row scope: the request's `userId` narrows, the reader's account scope narrows — the two AND.
    // Admin and an unidentified caller get `null`, which adds nothing (behaviour unchanged).
    // 行范围：请求的 `userId` 收紧、读者的账号范围收紧，两者取 AND。管理员与无身份调用者得到
    // `null`，不追加任何约束（行为不变）。
    const rowScope = await resolveAuditReaderScope(reader, this.orgService);

    const effectWhere: FindOptionsWhere<AiToolSideEffect> = {
      createdAt: Between(since, until),
      ...(userId ? { userId } : {}),
    };
    const auditWhere: FindOptionsWhere<AiAuditLog> = {
      createdAt: Between(since, until),
      ...(userId ? { userId } : {}),
    };
    applyAuditScopeToWhere(effectWhere, rowScope, 'userId');
    applyAuditScopeToWhere(auditWhere, rowScope, 'userId');

    const [auditRows, effectRows, chatRows, withoutSnapshot, openDispute, stalledRevoke] =
      await Promise.all([
        this.auditLogs.count({ where: auditWhere }),
        this.effects.count({ where: effectWhere }),
        this.auditLogs.count({ where: { ...auditWhere, action: 'chat' } }),
        // Either column missing means the change was never captured — the pair is what REV-6 is about.
        // 任一侧缺失都算「变更没被捕获」—— 这一对正是 REV-6 说的东西。
        this.effects.count({
          where: [
            { ...effectWhere, beforeSnapshot: IsNull() },
            { ...effectWhere, afterSnapshot: IsNull() },
          ],
        }),
        this.effects.count({
          where: { ...effectWhere, revokeDispute: Not(IsNull()), revokeAcknowledgedAt: IsNull() },
        }),
        this.effects.count({ where: { ...effectWhere, revokeStatus: REVOKE_STATUS.COMPENSATING } }),
      ]);

    const facts: CoverageFacts = {
      runtime: 'ts',
      host: 'none',
      hostOwnsBusinessWrite: false,
      hostOwnAiPath: false,
      auditGranularity: granularity,
      sharedCacheAcrossDeployments: false,
      nonDiscreteActionSurfacesExposed: false,
      packageHasExternalAnchor: false,
      packageHasEffectWithoutSnapshot: withoutSnapshot > 0,
      packageHasOpenDispute: openDispute > 0,
      packageHasStalledRevoke: stalledRevoke > 0,
      packageHasChatRow: chatRows > 0,
    };

    // Only the sources this statement actually read — the list is "what was consulted", not "what
    // exists in the system". Listing a source nobody queried would be the same silence this whole
    // thing exists to break.
    // 只列**这份声明真的读了**的源 —— 这张表是「问过谁」，不是「系统里有什么」。列一个谁也没查过的源，
    // 恰恰是整件事要打破的那种沉默。
    const sources: CoverageSource[] = [
      {
        id: 'ai_audit_chain',
        state: granularity === 'off' ? 'absent' : granularity === 'write' ? 'partial' : 'complete',
        rows: auditRows,
      },
      { id: 'side_effect_ledger', state: 'complete', rows: effectRows },
      { id: 'governance_policy', state: 'complete', rows: 1 },
    ];

    return this.forFacts({ kind: 'period', since, to: until, subjectRef: null, sources, facts });
  }
}
