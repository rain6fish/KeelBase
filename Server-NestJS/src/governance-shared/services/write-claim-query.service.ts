// SPDX-License-Identifier: Apache-2.0

import { Inject, Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { In, Repository } from 'typeorm';
import {
  AiWriteClaim,
  WRITE_CLAIM_DECISION_STATE,
  WRITE_CLAIM_STATUS,
} from '../entities/ai-write-claim.entity';
import { TargetStatusLookupRow } from '../entities/target-status-lookup.entity';
import type {
  TargetStatusConclusion,
  TargetStatusLookupBasisView,
} from '../../governance-core/target-status';
import { staleThresholdMinutes } from '../../governance-core/revoke-staleness';
import {
  claimReconcilePlan,
  claimReconcileSchedule,
  type ClaimReconcilePlan,
} from '../../governance-core/claim-reconcile-schedule';
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
    // AW-16 F-64: by default this is the **in-flight** view — a closed hold has been released by a
    // human and is no longer "in flight", while a queued one still is (it is exactly the stuck part
    // of the list). `all` is the only reading that includes closed rows, for history.
    // AW-16 F-64：默认给的是**在途**视图 —— 已关闭的占位由人释放，不再「在途」；待裁的仍在途
    //（它正是列表里卡住的那一段）。只有 `all` 读得到已关闭行，供查历史。
    const decisionState = query.decisionState ?? 'in_flight';
    if (decisionState === 'in_flight') {
      qb.andWhere('c.decisionState IN (:...liveStates)', {
        liveStates: [
          WRITE_CLAIM_DECISION_STATE.OPEN,
          WRITE_CLAIM_DECISION_STATE.AWAITING_DECISION,
        ],
      });
    } else if (decisionState !== 'all') {
      qb.andWhere('c.decisionState = :decisionState', { decisionState });
    }
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
    const lookups = await this.lookupStats(rows.map((c) => c.idempotencyKey));
    const plan = this.reconcilePlan();
    return {
      items: rows.map((c) =>
        this.project(
          c,
          now,
          thresholdMinutes,
          this.canAsk(c.toolName),
          lookups.get(c.idempotencyKey),
          plan,
        ),
      ),
      total,
      limit,
      thresholdMinutes,
      // The cap travels with the page so `autoReconcileStopped` / `autoReconcileDueAt` can be read
      // without a second request — and so the screen shows the number the sweep is actually using.
      // 上限随页带出，故不必再发一次请求就能读懂 `autoReconcileStopped` / `autoReconcileDueAt`，
      // 也让屏幕显示的就是清扫真正在用的那个数。
      autoReconcileMaxAttempts: plan.maxAttempts,
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
    // F-85: what a reviewer reads is the **pair**, not a row. The list keeps its declared newest-first
    // order, but each row carries its chronological position and the gap to the ask before it, and the
    // claim carries when it was written — without the write time, the stretch before the first ask gets
    // read as covered, and nothing covered it.
    //
    // F-85：审阅者读的是**一对**，不是一行。列表保持已声明的「新在前」顺序，但每条带上按时间排的序位、
    // 到上一次询问的间隔，占位再带上写入时刻 —— 少了写入时刻，第一次询问之前那段就会被读成「覆盖过了」，
    // 而它什么都没覆盖。
    const chrono = [...rows].sort((a, b) => a.at.getTime() - b.at.getTime() || a.id - b.id);
    const positionOf = new Map<number, { seq: number; intervalSeconds: number | null }>();
    chrono.forEach((l, i) => {
      const prev = i === 0 ? null : chrono[i - 1];
      positionOf.set(l.id, {
        seq: i + 1,
        intervalSeconds: prev ? Math.round((l.at.getTime() - prev.at.getTime()) / 1000) : null,
      });
    });
    const first = chrono[0] ?? null;
    const firstLookupAfterWriteSeconds = first
      ? Math.round((first.at.getTime() - claim.claimedAt.getTime()) / 1000)
      : null;
    // R-2 / F-86 / F-88: state in fields what the numbers above only imply — the stretch before the
    // first reading was **not observed**, and with no readings the whole life so far was not. The
    // expected first-ask wait comes from the same plan the sweep reads, never a literal here: a
    // deployment that changes the cadence changes this statement with it.
    //
    // R-2 / F-86 / F-88：用可判读的字段把上面那些数字只暗示的事说出来 —— 第一次读数之前那段**没有观测**；
    // 一条读数都没有时，占位以来全部都**没有观测**。预期的首问等待读自清扫用的同一份计划，不在这里写成
    // 字面量：改了首问节奏的部署，这句话随之改。
    const coverage: ClaimLookupCoverage = {
      basis: first ? 'until-first-lookup' : 'no-lookups-yet',
      unobservedSeconds: Math.max(
        0,
        firstLookupAfterWriteSeconds ??
          Math.round((Date.now() - claim.claimedAt.getTime()) / 1000),
      ),
      observedFrom: first ? first.at.toISOString() : null,
      expectedFirstAskAfterMinutes: this.reconcilePlan().backoffMinutes[0],
    };
    return {
      claimId: claim.id,
      toolName: claim.toolName,
      claimStatus: claim.status,
      claimedAt: claim.claimedAt.toISOString(),
      firstLookupAfterWriteSeconds,
      coverage,
      total: rows.length,
      items: rows.map((l) => ({ ...this.projectLookup(l), ...positionOf.get(l.id)! })),
    };
  }

  /** Whether the target has a status query at all — a tool property, never a query. / 目标有没有查询通道。 */
  private canAsk(toolName: string): boolean {
    return this.statusProbe?.canAsk(toolName) === true;
  }

  /**
   * Latest lookup and attempt count per claim key, in one round trip. `DESC` + first-wins = newest per
   * key; the same rows give the count. The count includes manual reconciles — the automatic budget is
   * one number, and this is the number the sweep reads.
   *
   * 每个键的最近一次查询与询问次数，一次往返取回。`DESC` + 先到者胜 = 每键最新；同一批行顺带给出次数。
   * 次数含人工对账 —— 自动预算只有一个数，而这就是清扫读的那个数。
   */
  private async lookupStats(
    keys: string[],
  ): Promise<Map<string, { count: number; latest: TargetStatusLookupRow }>> {
    const stats = new Map<string, { count: number; latest: TargetStatusLookupRow }>();
    const unique = [...new Set(keys)];
    if (unique.length === 0) return stats;
    const rows = await this.lookupsRepo.find({
      where: { idempotencyKey: In(unique) },
      order: { at: 'DESC', id: 'DESC' },
    });
    for (const row of rows) {
      const entry = stats.get(row.idempotencyKey);
      if (entry) entry.count++;
      else stats.set(row.idempotencyKey, { count: 1, latest: row });
    }
    return stats;
  }

  /** The automatic re-ask plan the sweep is using — read here from the same place, with the same defaults. */
  private reconcilePlan(): ClaimReconcilePlan {
    return claimReconcilePlan(
      this.configService?.get<number>('CLAIM_RECONCILE_MAX_ATTEMPTS'),
      this.configService?.get<string>('CLAIM_RECONCILE_BACKOFF_MINUTES'),
    );
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
    lookups: { count: number; latest: TargetStatusLookupRow } | undefined,
    plan: ClaimReconcilePlan,
  ): InFlightClaimRow {
    const ageMinutes = Math.max(0, Math.floor((now.getTime() - c.claimedAt.getTime()) / 60_000));
    const lookupCount = lookups?.count ?? 0;
    const schedule = claimReconcileSchedule(c.claimedAt, lookups?.latest.at ?? null, lookupCount, plan, now);
    // A row that is not in the pending-decision queue is not on the automatic schedule yet, and a row
    // whose target cannot be asked has no schedule at all — `null`, not an invented time. "Stopped" is
    // about the budget only, so a converged or released row reads the same way it did.
    //
    // `autoReconcileDueAt` answers **when this row's schedule allows the next ask**, nothing more. A
    // row still due after a pass that spent its `CLAIM_RECONCILE_MAX_PER_PASS` budget keeps a due time
    // in the past — that means "due, not reached this hour", never "not due yet". Do not compute a
    // future time from the cap: which rows wait depends on the queue, and guessing would turn a
    // scheduling fact into a fake promise.
    // 不在待裁队列里的行还没进入自动计划；目标问不了的行根本没有计划 —— 给 `null`，不造一个时刻。
    // 「已停止」只说预算，故已收敛或已释放的行读法与之前一致。
    //
    // `autoReconcileDueAt` 只回答**这一行的计划何时允许下一次询问**。某趟因 `CLAIM_RECONCILE_MAX_PER_PASS`
    // 用尽而没轮到的行，其到期时刻仍停在过去 —— 那读作「已到期、这一趟没轮到」，绝不是「还没到期」。别根据
    // 上限反推一个未来时刻：谁在等取决于队列，猜出来的会是把排期事实换成一句假承诺。
    const eligible =
      c.status === WRITE_CLAIM_STATUS.CLAIMED &&
      c.decisionState === WRITE_CLAIM_DECISION_STATE.AWAITING_DECISION &&
      reconcilable;
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
      // AW-15: the decision basis travels with the row. A missing reading is the word `unknown` —
      // the same reading the effects list gives — never a guessed role or policy, never backfilled.
      // AW-15：判定依据随行带出。缺读报 `unknown` —— 与副作用列表同一读数 —— 不猜角色、不猜策略、不回填。
      decidedRole: c.decidedRole ?? 'unknown',
      policyRevision: c.policyRevision ?? 'unknown',
      decisionState: c.decisionState ?? WRITE_CLAIM_DECISION_STATE.OPEN,
      // AW-17: two additive readings. `reconcilable` is the **capability** (a status query exists),
      // `lastLookup` is the **history** (latest attempt). `null` means nobody ever asked — it must
      // not be rendered as "executed", because a missing answer is not an answer.
      // AW-17：两个加性读数。`reconcilable` 是**能力**（有没有状态查询），`lastLookup` 是**历史**
      //（最近一次尝试）。`null` = 从没人问过 —— 不得渲染成「已执行」，因为没答案不是答案。
      reconcilable,
      lastLookup: lookups ? this.projectLookup(lookups.latest) : null,
      // F-79: how many times the target has been asked, and whether the automatic asking is over.
      // These are readings off the evidence rows — no new column, no migration — so "asked four times
      // and parked" is visible instead of living only in a log line.
      // F-79：目标被问过几次、自动询问是否已经结束。读数来自证据行 —— 不加列、不写迁移 —— 于是
      //「问满四次、已搁置」看得见，而不是只活在一行日志里。
      lookupCount,
      autoReconcileStopped: schedule.stopped,
      autoReconcileDueAt: eligible && !schedule.stopped ? (schedule.nextDueAt?.toISOString() ?? null) : null,
    };
  }

  /**
   * Field-by-field lookup projection: conclusion, cause, when, by whom, and the path actually asked.
   * R-1 adds the basis, mapped to `unknown` when the row has none (target silent, or predates the
   * column) — the read face never returns `null`, so consumers cannot mistake "not recorded" for a
   * fourth kind, and never backfill it into `current_state`.
   *
   * 逐字段的查询投影：结论、成因、时刻、发起人，以及真正请求过的路径。R-1 增加种类：行上没有时映成
   * `unknown`（目标没说，或该行早于本列）—— 读面不返回 `null`，消费者不会把「未记录」误当成第四种
   * 种类，也不会被回填成 `current_state`。
   */
  private projectLookup(l: TargetStatusLookupRow): TargetStatusLookupView {
    return {
      id: l.id,
      conclusion: l.conclusion,
      reason: l.reason ?? null,
      basis: l.basis ?? 'unknown',
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
  /**
   * Which governance disposition to read: the default in-flight view (`open` + `awaiting_decision`),
   * one state only, or `all` (history, including released holds). Omitted = in-flight.
   *
   * 读哪一种治理处置：默认在途视图（`open` + `awaiting_decision`）、只看某一态、或 `all`（含已释放
   * 占位的历史）。省略 = 在途。
   */
  decisionState?: 'in_flight' | 'open' | 'awaiting_decision' | 'closed_unknown' | 'all';
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
  /** AW-15: role at decision time; `unknown` when the row predates the column. / 判定时的角色；旧行报 unknown。 */
  decidedRole: string;
  /** AW-15: policy revision at decision time; `unknown` when not recorded. / 判定时的策略 revision；未记录报 unknown。 */
  policyRevision: string;
  /** AW-16 F-64: the governance disposition — see `WRITE_CLAIM_DECISION_STATE`. */
  decisionState: string;
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
  /**
   * F-79: how many attempts are on record for this claim — every lookup row, manual and automatic.
   * `/lookups` returns the same rows, so this is a count of evidence, not a separate counter.
   *
   * F-79：这条占位记录在案的询问次数 —— 每一行查询证据，人工与自动都算。`/lookups` 返回的就是同一批行，
   * 故这是一个对证据行的计数，不是另立一个计数器。
   */
  lookupCount: number;
  /**
   * F-79: the automatic re-ask budget is used up — no further hourly query. A person can still ask
   * once by hand; this says only that the sweep has stopped.
   *
   * F-79：自动重问预算已用尽，整点清扫不再问。人仍可手工问一次；这里只说明清扫停了。
   */
  autoReconcileStopped: boolean;
  /**
   * F-79: when the next automatic ask becomes due, or `null` when there is none to wait for (not in
   * the pending-decision queue, target not askable, or budget used up). Never an invented time, and
   * never adjusted for the per-pass cap: a past value means "due — this pass may simply not have
   * reached it yet", not "not due".
   *
   * F-79：下一次自动询问的到期时刻；没有可等的（不在待裁队列、目标问不了、预算已用尽）时为 `null`。
   * 绝不造一个时刻，也不按每趟上限调整：给的是过去时刻，意思是「已到期 —— 只是这一趟可能还没轮到」，
   * 不是「还没到期」。
   */
  autoReconcileDueAt: string | null;
}

/** One recorded attempt to ask the target whether a write happened (AW-17). / 一次目标状态查询的读数。 */
export interface TargetStatusLookupView {
  id: number;
  conclusion: TargetStatusConclusion;
  /** Why it is `unknown`; `null` for a real answer. / 为 `unknown` 的成因；真答案为 `null`。 */
  reason: string | null;
  /**
   * R-1: what the answer is based on. `current_state` and `receipt` are what the target declared;
   * `unknown` means it did not say, or the row predates the column. Never `null` on the read face.
   * Distinct from `ClaimLookupCoverage.basis`, which says which stretch a **coverage statement** is
   * about (`until-first-lookup` / `no-lookups-yet`) — two vocabularies, two objects, never interchangeable.
   *
   * R-1：答案基于什么。`current_state` 与 `receipt` 是目标声明的种类；`unknown` 表示它没说，或该行
   * 早于本列。读面从不为 `null`。与 `ClaimLookupCoverage.basis` 不同：后者说的是**覆盖声明**针对哪一段
   * （`until-first-lookup` / `no-lookups-yet`）—— 两套词表、两个对象，不可互换。
   */
  basis: TargetStatusLookupBasisView;
  /** ISO 8601. / ISO 8601。 */
  at: string;
  queryMethod: string;
  queryPath: string;
  lookedUpBy: string;
  asUserId: string;
}

/**
 * F-85: one reading as it sits in a **sequence**. The base view answers "what did the target say"; this
 * adds "where in time it sat" and "how long we were blind before it" — the two things that turn a set of
 * rows into a pair a reviewer can read.
 *
 * F-85：一条读数在**序列**里的位置。基础视图回答「目标说了什么」，这一层加上「它在时间上的位置」与
 * 「在它之前我们盲了多久」—— 把一组行变成审阅者读得懂的一对，靠的正是这两样。
 */
export interface TargetStatusLookupPositionedView extends TargetStatusLookupView {
  /** Position in chronological order — 1 is the first ask. / 按时间排的序位 —— 1 是第一次询问。 */
  seq: number;
  /**
   * Seconds since the previous ask; `null` for the first one. Reads as "how long we were blind between
   * the two", not as coverage — nothing between the samples was observed.
   *
   * 距上一次询问的秒数；第一次为 `null`。读法是「两次之间盲了多久」，不是「覆盖了多久」——
   * 两次采样之间什么都没观察到。
   */
  intervalSeconds: number | null;
}

/**
 * R-2 / F-86 / F-88: **what this evidence covers, and what it does not** — computed at read time.
 *
 * Lookups are point samples. Nothing is observed between them, and nothing at all is observed before
 * the first one; without this statement the gap before the first ask reads as coverage. The window is
 * read off the recorded rows (not a schedule literal); only the *expectation* comes from the plan the
 * sweep uses.
 *
 * R-2 / F-86 / F-88：**这份证据覆盖了什么、没覆盖什么** —— 读取时现算。
 *
 * 查询是时间点采样。两次之间什么都没观察到，第一次之前更是什么都没有；少了这句话，首问之前的那段
 * 会被读成覆盖。窗口读自记录在案的行（不是计划里的字面量）；只有**预期**来自清扫所用的那份计划。
 */
export interface ClaimLookupCoverage {
  /**
   * Which stretch the statement is about. `until-first-lookup`: from `claimedAt` to the first reading.
   * `no-lookups-yet`: nothing has been observed; from `claimedAt` to this response.
   *
   * 这句话说的是哪一段。`until-first-lookup`：占位到第一条读数；`no-lookups-yet`：尚无观测，
   * 从占位到本次响应。
   */
  basis: 'until-first-lookup' | 'no-lookups-yet';
  /**
   * Seconds in that stretch with no observation at all. Never `null`: an empty history is still a
   * duration, not a blank.
   *
   * 该段内完全没有观测的秒数。永不为 `null`：空历史也是一段时长，不是空白。
   */
  unobservedSeconds: number;
  /** Start of the observed record; `null` when nothing was observed. / 观测记录的起点；尚无观测时为 `null`。 */
  observedFrom: string | null;
  /**
   * The plan's first wait, in minutes (`CLAIM_RECONCILE_BACKOFF_MINUTES[0]`, default 60) — what the
   * schedule expects between the write and the first automatic ask, not a figure written here.
   *
   * 计划里的第一档等待（分钟，`CLAIM_RECONCILE_BACKOFF_MINUTES[0]`，默认 60）—— 计划预期写入到首次
   * 自动询问之间的间隔，不是写在这里的数字。
   */
  expectedFirstAskAfterMinutes: number;
}

/** AW-17: one claim's lookup history, newest first. / 一条占位的查询历史，最近的在前。 */
export interface ClaimLookupsResult {
  claimId: number;
  toolName: string;
  /** The claim's status at read time — so a converged row is not read as still in flight. / 读取时的占位状态。 */
  claimStatus: string;
  /**
   * F-85 / F-86: when the write was claimed. Without it the gap between "the write" and "the first ask"
   * is invisible, and a first ask an hour later looks like an hour of coverage.
   *
   * F-85 / F-86：这次写是什么时候占位的。没有它，「写」到「第一次问」之间那段就看不见 ——
   * 而第一次问若在一小时后，看起来就像覆盖了一小时。
   */
  claimedAt: string;
  /** F-85 / F-86: seconds from `claimedAt` to the first ask; `null` when nobody ever asked. / 从占位到首问的秒数；一次都没问过为 `null`。 */
  firstLookupAfterWriteSeconds: number | null;
  /** R-2: what the readings do and do not cover, computed when this response is built. / R-2：这些读数覆盖与未覆盖的范围，构造响应时现算。 */
  coverage: ClaimLookupCoverage;
  items: TargetStatusLookupPositionedView[];
  total: number;
}

export interface InFlightClaimsResult {
  items: InFlightClaimRow[];
  /** Matching rows before `limit`. / 应用 `limit` 前的匹配行数。 */
  total: number;
  limit: number;
  /** The threshold `stale` was judged by (minutes). / 判 `stale` 用的阈值（分钟）。 */
  thresholdMinutes: number;
  /**
   * F-79: the automatic re-ask cap in force (`CLAIM_RECONCILE_MAX_ATTEMPTS`, capped by the length of
   * the backoff table). Stated once per page because it is a property of the deployment, not a row.
   *
   * F-79：生效的自动重问上限（`CLAIM_RECONCILE_MAX_ATTEMPTS`，并受间隔表长度所限）。每页只说一次，
   * 因为它是部署的属性，不是某一行的。
   */
  autoReconcileMaxAttempts: number;
  /** Which row scope was applied — so a short list explains itself. / 实际施加的行范围，短列表因此有解释。 */
  scope: 'all' | 'org' | 'own';
}
