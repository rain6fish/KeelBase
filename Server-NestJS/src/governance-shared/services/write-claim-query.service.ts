// SPDX-License-Identifier: Apache-2.0

import { Inject, Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { In, Repository } from 'typeorm';
import { AiWriteClaim, WRITE_CLAIM_STATUS } from '../entities/ai-write-claim.entity';
import { TargetStatusLookupRow } from '../entities/target-status-lookup.entity';
import type { TargetStatusConclusion } from '../../governance-core/target-status';
import { staleThresholdMinutes } from '../../governance-core/revoke-staleness';
import {
  auditScopeSql,
  resolveAuditReaderScope,
  type AuditReaderContext,
} from './audit-reader-scope';
import { TARGET_STATUS_PROBE } from './tool-effects.types';
import type { TargetStatusProbe } from './tool-effects.types';
// A **value** import, not `import type`: the DI metadata needs the class at emit time. With a type-only
// import TypeORM/Nest would inject `undefined` and the scope would silently fall back to `own` rows.
// **值**导入，不是 `import type`：DI 元数据在编译期需要这个类。只做类型导入时 Nest 会注入
// `undefined`，行范围就会静默退成「本人行」。
import { OrgService } from '../../org/org.service';

/**
 * AW-16: the read side of "which calls are in flight right now".
 *
 * Before this there was no way to answer that question at an instant: `listStaleClaims` only surfaces
 * the *stale subset*, attached to the side-effect list, and callers cannot ask it about one user, one
 * tool, or a window. Revoking a user's access while a write is still running therefore had no visible
 * list of the executions that access covers. This service is that list — read-only, and the only
 * thing it does is state what the table says at the moment it is asked.
 *
 * What it deliberately does **not** carry:
 * - **No argument plaintext.** The table never stored it (`args_hash` is a 16-hex digest, and the
 *   idempotency key is a sha256), and the projection below does not add a field that could.
 * - **No verdict.** A stale row is not "failed" and not "succeeded": for an external write the truth
 *   lives in the target system, and after a crash it lives in a moment we cannot recover. `stale` is
 *   an age reading, nothing more.
 *
 * Row scope follows the audit reader's existing rule: admins see everything, an auditor sees the
 * account's organisation (or their own rows when they belong to none), and a request-side filter can
 * only narrow that — never replace it.
 *
 * AW-16：「此刻哪些调用在途」的读侧。
 *
 * 在此之前，这个瞬间问题没有答案：`listStaleClaims` 只露出**陈旧子集**、挂在副作用列表上，
 * 且无法按某个用户、某个工具或某段时间提问。于是在一次写仍在执行时撤销权限，拿不到「这次权限覆盖的
 * 执行」的清单。本服务就是那张清单 —— 只读，且只陈述被问那一刻表里写着什么。
 *
 * 它有意**不**带的东西：
 * - **参数明文**。表里从未存过（`args_hash` 是 16 位摘要，幂等键是 sha256），下面的投影也不加任何可能
 *   带出明文的字段。
 * - **判决**。陈旧行既不是「失败」也不是「成功」：外部写的真值在目标系统，崩溃之后真值在找不回来的
 *   那一刻。`stale` 只是年龄读数，仅此而已。
 *
 * 行范围沿用审计读者既有的规则：管理员看全部，审计读者看账号所属组织（不属于任何组织时看本人行），
 * 请求侧过滤只能收紧、不能替换。
 */
@Injectable()
export class WriteClaimQueryService {
  private static readonly DEFAULT_LIMIT = 100;
  private static readonly MAX_LIMIT = 500;

  constructor(
    @InjectRepository(AiWriteClaim) private readonly claimsRepo: Repository<AiWriteClaim>,
    /**
     * AW-17: the lookup evidence trail. **Not optional**: an absent store would force this surface to
     * answer `lastLookup: null` for every row — i.e. "never asked" for rows that were asked about,
     * which is the exact conflation the table exists to remove. A missing repository is a wiring bug,
     * not a degraded mode.
     *
     * AW-17：查询证据历史。**不是可选的**：仓储缺席时本面只能给每一行回 `lastLookup: null` ——
     * 对问过的行也报「从没问过」，正是这张表要消掉的混淆。缺仓储是接线缺陷，不是降级形态。
     */
    @InjectRepository(TargetStatusLookupRow)
    private readonly lookupsRepo: Repository<TargetStatusLookupRow>,
    // Optional like the other staleness readers: a unit test (or a deployment without config) falls
    // back to the Joi default rather than failing construction.
    // 与其余陈旧判定处一样是可选的：单测（或没有配置的部署）回落到 Joi 默认值，而不是构造失败。
    @Optional() private readonly configService?: ConfigService,
    // Optional so a hand-built assembly degrades to the reader's own rows — the narrowest answer.
    // 可选：手工装配时退回读者的本人行 —— 最窄的那个答案。
    @Optional() private readonly orgService?: OrgService,
    /**
     * AW-17: "can this target be asked?" — answered from the tool registry without a request. Optional
     * because the governance process has no outbound targets: there, "cannot ask" is the true reading.
     *
     * AW-17：「这个目标能不能问」—— 由工具注册表回答，不发请求。可选：治理进程没有出站目标，
     * 在那里「问不了」就是真实的读数。
     */
    @Optional()
    @Inject(TARGET_STATUS_PROBE)
    private readonly statusProbe?: TargetStatusProbe,
  ) {}

  /**
   * List the `claimed` rows matching the filters, ordered by claim time (id breaks ties so page
   * membership is deterministic).
   *
   * 列出符合过滤条件的 `claimed` 行，按占位时间排序（并列以 id 决序，故分页成员确定）。
   */
  async list(
    query: InFlightClaimQuery = {},
    reader?: AuditReaderContext,
  ): Promise<InFlightClaimsResult> {
    const thresholdMinutes = staleThresholdMinutes(
      this.configService?.get<number>('REVOKE_STALE_MINUTES'),
    );
    const limit = Math.min(
      Math.max(Math.trunc(query.limit ?? WriteClaimQueryService.DEFAULT_LIMIT), 1),
      WriteClaimQueryService.MAX_LIMIT,
    );
    const scope = await resolveAuditReaderScope(reader, this.orgService);
    // Same cut as `listStaleClaims`, from the same threshold — one ruler for the whole screen.
    // 与 `listStaleClaims` 同一切点、同一阈值 —— 整块屏只用一把尺子。
    const cut = new Date(Date.now() - thresholdMinutes * 60_000);

    const qb = this.claimsRepo
      .createQueryBuilder('c')
      .where('c.status = :status', { status: WRITE_CLAIM_STATUS.CLAIMED });
    if (query.userId) qb.andWhere('c.userId = :userId', { userId: query.userId });
    if (query.toolName) qb.andWhere('c.toolName = :toolName', { toolName: query.toolName });
    // Closed on both ends, like the audit window: `since` and `until` describe the period asked for.
    // 两端闭合，与审计窗口一致：`since` / `until` 描述的就是被问的那段期间。
    if (query.since) qb.andWhere('c.claimedAt >= :since', { since: query.since });
    if (query.until) qb.andWhere('c.claimedAt <= :until', { until: query.until });
    if (query.staleOnly) qb.andWhere('c.claimedAt < :cut', { cut });
    const scopeFragment = auditScopeSql(scope, 'c');
    if (scopeFragment) qb.andWhere(scopeFragment.sql, scopeFragment.params);

    const total = await qb.getCount();
    const rows = await qb
      .orderBy('c.claimedAt', 'ASC')
      .addOrderBy('c.id', 'ASC')
      .limit(limit)
      .getMany();
    const now = new Date();
    // One query for the whole page — the same reason the effects list batches its comparability
    // history: a per-row round trip here would be N+1 on a screen that already lists 500 rows.
    // 整页一次查询 —— 与副作用列表批量取可比性历史的理由相同：这里再按行往返，就是 500 行上的 N+1。
    const latest = await this.latestLookups(rows.map((c) => c.idempotencyKey));
    return {
      items: rows.map((c) =>
        this.project(c, now, thresholdMinutes, this.canAsk(c.toolName), latest.get(c.idempotencyKey)),
      ),
      total,
      limit,
      thresholdMinutes,
      scope: scope === null ? 'all' : scope.kind,
    };
  }

  /**
   * AW-17: the lookup history of one claim — every attempt, newest first.
   *
   * `null` means **there is no such claim in the reader's scope** (the caller answers 404). An
   * out-of-scope claim deliberately gets the same answer as a missing one: a 403 would confirm the
   * row exists, which is itself information the reader is not entitled to.
   *
   * AW-17：一条占位行的查询历史 —— 每次尝试一条，最近的在前。
   *
   * `null` 表示**读者的范围里没有这条占位**（调用方回 404）。范围外的行**有意**与不存在的行同一个
   * 答案：403 会确认「这一行存在」，而那本身就是读者无权得到的信息。
   */
  async lookupsFor(
    claimId: number,
    reader?: AuditReaderContext,
  ): Promise<ClaimLookupsResult | null> {
    const scope = await resolveAuditReaderScope(reader, this.orgService);
    const qb = this.claimsRepo.createQueryBuilder('c').where('c.id = :id', { id: claimId });
    const scopeFragment = auditScopeSql(scope, 'c');
    if (scopeFragment) qb.andWhere(scopeFragment.sql, scopeFragment.params);
    const claim = await qb.getOne();
    if (!claim) return null;

    const rows = await this.lookupsRepo.find({
      where: { idempotencyKey: claim.idempotencyKey },
      order: { at: 'DESC', id: 'DESC' },
    });
    return {
      claimId: claim.id,
      toolName: claim.toolName,
      claimStatus: claim.status,
      total: rows.length,
      items: rows.map((l) => this.projectLookup(l)),
    };
  }

  /** Whether the target has a status query at all — a tool property, never a query. / 目标有没有查询通道。 */
  private canAsk(toolName: string): boolean {
    return this.statusProbe?.canAsk(toolName) === true;
  }

  /** Latest lookup per claim key, in one round trip. `DESC` + first-wins = newest per key. */
  private async latestLookups(keys: string[]): Promise<Map<string, TargetStatusLookupRow>> {
    const latest = new Map<string, TargetStatusLookupRow>();
    const unique = [...new Set(keys)];
    if (unique.length === 0) return latest;
    const rows = await this.lookupsRepo.find({
      where: { idempotencyKey: In(unique) },
      order: { at: 'DESC', id: 'DESC' },
    });
    for (const row of rows) if (!latest.has(row.idempotencyKey)) latest.set(row.idempotencyKey, row);
    return latest;
  }

  /**
   * Field-by-field projection, so a column added to the entity later is **not** silently exposed on
   * this surface. `argsHash` is the argument fingerprint the reader asked for; arguments themselves
   * are absent because they were never stored.
   *
   * 逐字段投影，日后实体新增的列**不会**在这张面上被悄悄带出。`argsHash` 是读者要的参数指纹；
   * 参数本体缺席，因为它从未被保存过。
   */
  private project(
    c: AiWriteClaim,
    now: Date,
    thresholdMinutes: number,
    reconcilable: boolean,
    lastLookup?: TargetStatusLookupRow,
  ): InFlightClaimRow {
    const ageMinutes = Math.max(0, Math.floor((now.getTime() - c.claimedAt.getTime()) / 60_000));
    return {
      id: c.id,
      userId: c.userId,
      toolName: c.toolName,
      argsHash: c.argsHash,
      status: c.status,
      claimedAt: c.claimedAt.toISOString(),
      ageMinutes,
      stale: ageMinutes >= thresholdMinutes,
      attempts: c.attempts,
      agentId: c.agentId ?? null,
      conversationId: c.conversationId ?? null,
      runId: c.runId ?? null,
      authorizationRef: c.authorizationRef ?? null,
      // AW-17: two additive readings. `reconcilable` is the **capability** (a status query exists),
      // `lastLookup` is the **history** (latest attempt). `null` means nobody ever asked — it must
      // not be rendered as "executed", because a missing answer is not an answer.
      // AW-17：两个加性读数。`reconcilable` 是**能力**（有没有状态查询），`lastLookup` 是**历史**
      //（最近一次尝试）。`null` = 从没人问过 —— 不得渲染成「已执行」，因为没答案不是答案。
      reconcilable,
      lastLookup: lastLookup ? this.projectLookup(lastLookup) : null,
    };
  }

  /** Field-by-field lookup projection: conclusion, cause, when, by whom, and the path actually asked. */
  private projectLookup(l: TargetStatusLookupRow): TargetStatusLookupView {
    return {
      id: l.id,
      conclusion: l.conclusion,
      reason: l.reason ?? null,
      at: l.at.toISOString(),
      queryMethod: l.queryMethod,
      queryPath: l.queryPath,
      lookedUpBy: l.lookedUpBy,
      asUserId: l.asUserId,
    };
  }
}

export interface InFlightClaimQuery {
  /** Claim owner (`ai_write_claims.user_id`, a numeric string). */
  userId?: string;
  toolName?: string;
  /** Claimed at or after this instant. / 占位时刻不早于它。 */
  since?: Date;
  /** Claimed at or before this instant. / 占位时刻不晚于它。 */
  until?: Date;
  /** Only rows already past the stale threshold. / 只看已过陈旧阈值的行。 */
  staleOnly?: boolean;
  limit?: number;
}

export interface InFlightClaimRow {
  id: number;
  userId: string;
  toolName: string;
  /** 16-hex argument digest — the argument identity, not the arguments. / 参数摘要，不是参数。 */
  argsHash: string;
  status: string;
  claimedAt: string;
  ageMinutes: number;
  stale: boolean;
  attempts: number;
  agentId: string | null;
  conversationId: string | null;
  runId: string | null;
  authorizationRef: string | null;
  /**
   * AW-17: whether the target offers a status query at all (a `statusPath` is configured and the probe
   * is bound). It does **not** promise an answer — a misconfigured path still reports `unknown`.
   *
   * AW-17：目标有没有状态查询通道（配了 `statusPath` 且探针已绑定）。它**不**承诺一定有答案 ——
   * 配错的路径真去查仍报 `unknown`。
   */
  reconcilable: boolean;
  /** The latest attempt, or `null` when nobody ever asked. / 最近一次尝试；从没问过为 `null`。 */
  lastLookup: TargetStatusLookupView | null;
}

/** One recorded attempt to ask the target whether a write happened (AW-17). / 一次目标状态查询的读数。 */
export interface TargetStatusLookupView {
  id: number;
  conclusion: TargetStatusConclusion;
  /** Why it is `unknown`; `null` for a real answer. / 为 `unknown` 的成因；真答案为 `null`。 */
  reason: string | null;
  /** ISO 8601. / ISO 8601。 */
  at: string;
  queryMethod: string;
  queryPath: string;
  lookedUpBy: string;
  asUserId: string;
}

/** AW-17: one claim's lookup history, newest first. / 一条占位的查询历史，最近的在前。 */
export interface ClaimLookupsResult {
  claimId: number;
  toolName: string;
  /** The claim's status at read time — so a converged row is not read as still in flight. / 读取时的占位状态。 */
  claimStatus: string;
  items: TargetStatusLookupView[];
  total: number;
}

export interface InFlightClaimsResult {
  items: InFlightClaimRow[];
  /** Matching rows before `limit`. / 应用 `limit` 前的匹配行数。 */
  total: number;
  limit: number;
  /** The threshold `stale` was judged by (minutes). / 判 `stale` 用的阈值（分钟）。 */
  thresholdMinutes: number;
  /** Which row scope was applied — so a short list explains itself. / 实际施加的行范围，短列表因此有解释。 */
  scope: 'all' | 'org' | 'own';
}
