// SPDX-License-Identifier: Apache-2.0

/**
 * 写入操作人工确认存储 — ConfirmationStore
 *
 * AI 流式对话中写工具被调用时，生成一个短时 token，
 * 通过 SSE confirmation_request 事件发给客户端等待人工决策。
 * 客户端调用 POST /ai/confirmations/:token 后，这里 resolve 对应的 pending promise。
 *
 * D2-1e 持久化：R3 确认请求同时落 ai_confirmation_requests 表（riskLevel=R3，status=pending）
 * ——服务器重启 pending 不丢、为独立治理控制平面的跨服务确认铺路（治理台裁决 → 业务系统回调）。
 * 内存 Map 保留用于「决策 Promise 的即时回调」（等待机制），DB 为持久化事实源。
 *
 * **GA 待我确认中心（2026-09-18，confirmation-lifecycle v2）：两个窗口**
 * - **对话内等待**（`CONFIRMATION_DEFAULT_TTL_MS`，默认 60s）：到期只 resolve 内存 promise 让 SSE 继续，
 *   **不改 DB**；用户在对话里点则走 `resolve`（条件更新裁决）。
 * - **离线待办**（`CONFIRMATION_DEFAULT_OFFLINE_TTL_MS`，默认 24h）：行在窗口内保持 `pending`，
 *   用户可离开对话后经 `decideOutOfBand` 裁决；到期由 `expireStale` 转 `timeout`。
 * 两个窗口的**唯一仲裁点都是 DB 的条件更新**（`status='pending'`），因此并发/重复裁决不会二次执行工具。
 */

import { PresentationText } from '../interfaces/tool.interface';
import { Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, MoreThanOrEqual } from 'typeorm';
import { randomUUID } from 'crypto';
import { AiConfirmationRequest } from '../../governance-shared/entities/ai-confirmation-request.entity';
import {
  buildConfirmationRenderProof,
  buildRunRenderProof,
  ConfirmationRenderProof,
} from './confirmation-render';
import { SettingsService, SETTING_KEYS } from '../../settings/settings.service';
import { MetricsService } from '../../metrics/metrics.service';

export type ConfirmationOutcome = 'approve' | 'decline' | 'timeout';

/**
 * 确认生命周期单一源（跨 Runtime 冻结，见 `specs/protocol/confirmation-lifecycle-v1-vector.json`）：
 * - **状态**（`ai_confirmation_requests.status` 列值域）：`pending → approved | declined | timeout`
 * - **决策 outcome**（内存/SSE `confirmation_decision`）：`approve | decline | timeout`（legacy `reject` 归一 decline）
 * - **默认 TTL**：60s（HS-6 可经 Settings `confirmation_ttl_seconds` 覆盖）
 */
export const CONFIRMATION_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  DECLINED: 'declined',
  TIMEOUT: 'timeout',
} as const;
/**
 * The status union derived from the table above, so consumers have one source for both the value set
 * and its type. This used to be re-typed by hand wherever a signature needed it.
 * 由上面的表派生的状态联合类型，让消费方对「取值集」与「其类型」共用同一个来源。
 * 此前每个需要它的签名都手抄一份。
 */
export type ConfirmationStatus = (typeof CONFIRMATION_STATUS)[keyof typeof CONFIRMATION_STATUS];
export const CONFIRMATION_OUTCOME = {
  APPROVE: 'approve',
  DECLINE: 'decline',
  TIMEOUT: 'timeout',
} as const;
export const CONFIRMATION_DEFAULT_TTL_MS = 60_000;

/**
 * 离线待办窗口（GA 待我确认中心，confirmation-lifecycle **v2** 的两个窗口）：
 * 上面那条 TTL 只决定「对话内还要不要再等」（等不到就让 SSE 继续），**不再决定 DB 行的生死**——
 * 行保持 `pending` 直到本窗口到期，用户可在 Action Center 稍后裁决（`decideOutOfBand`）。
 * 到期由定时任务转 `timeout`（复用既有终态，不新增状态值）。
 */
export const CONFIRMATION_DEFAULT_OFFLINE_TTL_MS = 86_400_000;

/**
 * The offline window's **single source of truth**.
 *
 * The read path (which `pending` rows are still actionable in the "waiting on me" centre) and the
 * maintenance sweep (`expireStale`, which flips rows to `timeout`) must agree on the same instant —
 * otherwise the list shows "waiting on you" for a row the sweep has already killed, and the click is
 * a guaranteed failure. They used to compute the cutoff independently (one comparing in memory, one
 * in SQL), held together only by a comment claiming "the predicate matches `expireStale`".
 *
 * 离线窗口的**单一真源**。读取路径（哪些 `pending` 行在「等我处理」里仍可裁决）与维护清扫
 * （`expireStale` 把行转 `timeout`）必须对同一时刻达成一致，否则会出现「列表显示待确认、点下去必然失败」。
 * 两处原先各自算 cutoff（一处内存比较、一处 SQL），只靠一句「判据与 expireStale 一致」的注释维持。
 */
export function offlineWindowCutoff(ttlMs: number, now: number = Date.now()): Date {
  return new Date(now - ttlMs);
}

/**
 * Whether a confirmation created at `createdAt` is still inside the offline window.
 * Closed on the left, complementing `expireStale`'s strict `<` sweep: `>=` keeps, `<` expires —
 * so a row is never both "shown as actionable" and "already timed out".
 * 某条确认是否仍在离线窗口内。闭区间，与 `expireStale` 的严格 `<` 互补：`>=` 保留、`<` 清扫，
 * 故同一行不会既「显示可裁决」又「已被判超时」。
 */
export function isWithinOfflineWindow(
  createdAt: Date | undefined,
  ttlMs: number,
  now: number = Date.now(),
): boolean {
  if (!createdAt) return false;
  return createdAt.getTime() >= offlineWindowCutoff(ttlMs, now).getTime();
}

/** KB-5 run-level approval：run 批内单个动作（工具名 + 参数 + 人读摘要 + 自身风险级） */
export interface RunItem {
  toolName: string;
  args: Record<string, unknown>;
  /** 人读 diff 摘要（语义 key + 英文兜底 + 参数）；无摘要动作不进 run（§3.3 诚实降级） */
  summary: PresentationText;
  riskLevel: string;
}

export interface PendingConfirmation {
  token: string;
  userId: string;
  toolName: string;
  args: Record<string, unknown>;
  /** KB-5：'single'（默认，单动作）/ 'run'（一次授权整批，token = runId） */
  kind?: 'single' | 'run';
  /** HS-6：本轮是否信任该工具（后续免确认；作用域由调用方定，当前为一次对话轮次） */
  trustTool?: boolean;
  resolve: (result: ConfirmationResolveResult) => void;
  timer: NodeJS.Timeout;
}

export interface ConfirmationResolveResult {
  outcome: ConfirmationOutcome;
  trustTool?: boolean;
}

@Injectable()
export class ConfirmationStore {
  private readonly pending = new Map<string, PendingConfirmation>();
  private readonly ttlMs: number;

  constructor(
    @InjectRepository(AiConfirmationRequest)
    private readonly reqRepo: Repository<AiConfirmationRequest>,
    @Optional() ttlMs?: number,
    @Optional() private readonly settingsService?: SettingsService,
    /** CONF-1 可观测性：缺席（单测直接 new）时不记数，确认流照常 */
    @Optional() private readonly metrics?: MetricsService,
  ) {
    this.ttlMs = ttlMs ?? CONFIRMATION_DEFAULT_TTL_MS;
  }

  /**
   * 离线待办窗口（毫秒）——**单源**：GA 的列表查询、离线裁决、超期清理任务都用这一个值，
   * 免得三处各读一次 Settings 而漂移。取自 Settings `confirmation_offline_ttl_seconds`，
   * 缺席 / 配错（非数、非正）时退回冻结语料默认值。
   */
  async offlineTtlMs(): Promise<number> {
    const secs = this.settingsService
      ? Number(
          await this.settingsService.getWithDefault(
            SETTING_KEYS.CONFIRMATION_OFFLINE_TTL,
            CONFIRMATION_DEFAULT_OFFLINE_TTL_MS / 1000,
          ),
        )
      : Number.NaN;
    return Number.isFinite(secs) && secs > 0 ? secs * 1000 : CONFIRMATION_DEFAULT_OFFLINE_TTL_MS;
  }

  /**
   * 创建待确认项，返回 token 与可等待的决策 Promise。
   * R3 确认请求落库（ai_confirmation_requests，riskLevel=R3）——持久化事实源。
   * TTL 超时后自动 resolve('timeout') 并更新库状态，避免 pending promise 泄漏。
   * @param ttlMs 覆盖默认 TTL（HS-6：经 Settings 可配，如 confirmation_ttl_seconds）
   * @param audience 该 artifact 被批准**写往哪个目的地**（AUTHZ-1，单源解析见 `tools/tool-destination.ts`）。
   *   执行点拿它与当时的目的地比对，跨目标复用即拒。
   * @param summary the presentation text **actually emitted** with this confirmation (CONF-3). When
   *   given, the row records a hash of that exact rendering; callers that omit it (older tests,
   *   trimmed assemblies) get `null` — the rendering generation is then unknown rather than guessed.
   *   `summary` = 本次确认**实际下发**的呈现文案（CONF-3）。给了就把那份渲染的哈希记进行；不给则留
   *   `null` —— 渲染代次不可考，不猜。
   */
  async create(
    userId: string,
    toolName: string,
    args: Record<string, unknown>,
    ttlMs?: number,
    conversationId?: string,
    audience?: string,
    summary?: PresentationText,
  ): Promise<{ token: string; decision: Promise<ConfirmationResolveResult> }> {
    const token = randomUUID();
    let resolveFn!: (result: ConfirmationResolveResult) => void;
    const decision = new Promise<ConfirmationResolveResult>((resolve) => {
      resolveFn = resolve;
    });
    // CONF-3：哈希取自**同一份**下发文案，而不是事后另拼一份。
    const renderProof = summary ? buildConfirmationRenderProof(toolName, args, summary) : undefined;
    // REV-7：窗口在**建行时**落定（用当时的离线 TTL），不再由读时按当前配置推算——否则改配置会把
    // 账上每一行的窗口追溯性地挪走。
    const expiresAt = new Date(Date.now() + (await this.offlineTtlMs()));
    await this._persist({
      token,
      toolName,
      args: JSON.stringify(args),
      operatorId: userId,
      riskLevel: 'R3',
      kind: 'single',
      conversationId,
      audience,
      expiresAt,
      renderProof,
    });
    const timer = this._setupTimer(token, ttlMs);
    this.pending.set(token, { token, userId, toolName, args, kind: 'single', resolve: resolveFn, timer });
    return { token, decision };
  }

  /**
   * KB-5 run-level approval（docs/run-level-approval.spec.md §2.4）：一次授权整批。
   * token 即 runId（§2.3 允许 token=runId）；落库单行 kind='run' + run_items 快照 + riskLevel=runRisk。
   * 前端 POST 同一 run token approve/reject → resolve 该 run 的 decision（一次放行整批/整批跳过）。
   */
  async createRun(
    userId: string,
    items: RunItem[],
    riskLevel: string,
    ttlMs?: number,
    conversationId?: string,
  ): Promise<{ token: string; decision: Promise<ConfirmationResolveResult> }> {
    const token = randomUUID();
    let resolveFn!: (result: ConfirmationResolveResult) => void;
    const decision = new Promise<ConfirmationResolveResult>((resolve) => {
      resolveFn = resolve;
    });
    // CONF-3：run 卡的渲染就是批内逐条 summary；哈希取自即将快照进 run_items 的**同一批**。
    const renderProof = buildRunRenderProof(items);
    // REV-7：同 `create` —— 窗口在建行时落定
    const expiresAt = new Date(Date.now() + (await this.offlineTtlMs()));
    await this._persist({
      token,
      toolName: 'run',
      args: '[]',
      operatorId: userId,
      riskLevel,
      kind: 'run',
      runItems: JSON.stringify(items),
      conversationId,
      expiresAt,
      renderProof,
    });
    const timer = this._setupTimer(token, ttlMs);
    this.pending.set(token, { token, userId, toolName: 'run', args: {}, kind: 'run', resolve: resolveFn, timer });
    return { token, decision };
  }

  /** 落库待确认记录（create / createRun 共用；失败不阻断内存确认流，记错误供审计排查） */
  private async _persist(row: {
    token: string;
    toolName: string;
    args: string;
    operatorId: string;
    riskLevel: string;
    kind: 'single' | 'run';
    runItems?: string;
    conversationId?: string;
    audience?: string;
    /** REV-7：建行时落定的窗口终点（缺席 → null = 未记录，只有本列之前的历史行才该缺席） */
    expiresAt?: Date;
    /** CONF-3：签发时渲染的哈希 + 代次（缺席 = 调用方未提供下发文案，历史口径，留 null 不猜） */
    renderProof?: ConfirmationRenderProof;
  }): Promise<void> {
    // CONF-1 可观测性：**问了几次**在这里记 —— `create` / `createRun` 的唯一共用出口。
    // 记在落库**之前**：落库失败不阻断内存确认流（见方法头），而那次询问**确实已经发生**了。
    this.metrics?.toolConfirmationsTotal.inc({ tool: row.toolName });
    await this.reqRepo
      .save(
        this.reqRepo.create({
          token: row.token,
          toolName: row.toolName,
          args: row.args,
          operatorId: row.operatorId,
          riskLevel: row.riskLevel,
          kind: row.kind,
          status: CONFIRMATION_STATUS.PENDING,
          ...(row.runItems !== undefined ? { runItems: row.runItems } : {}),
          // docs/run-level-approval.spec.md §2.4：run 记录须携带 conversationId，服务器重启后按会话可查可裁决
          ...(row.conversationId !== undefined ? { conversationId: row.conversationId } : {}),
          // AUTHZ-1：artifact 的目的地绑定（链外注解列，不入任何哈希链 payload）
          ...(row.audience !== undefined ? { audience: row.audience } : {}),
          // REV-7：授权窗口（建行时落定；链外注解列）。缺席即 null —— 只有历史行会缺席。
          expiresAt: row.expiresAt ?? null,
          // CONF-3：签发时的渲染凭据（链外注解列）。缺席即 null —— 只有历史行/未提供文案的调用会缺席。
          renderHash: row.renderProof?.renderHash ?? null,
          renderVersion: row.renderProof?.renderVersion ?? null,
        }),
      )
      .catch((err) => {
        console.error(`[ConfirmationStore] persist create failed: ${err.message}`);
      });
  }

  /**
   * 等待窗口定时器（create / createRun 共用）：到期只结束**对话内等待**（resolve 内存 promise），
   * **不写 DB**——行的生死由离线窗口（offline TTL）决定，由 `expireStale` 定时转 timeout。
   * 这是 confirmation-lifecycle v2 把 v1 的单个 `ttl_elapsed` 拆成两个窗口后的行为。
   */
  private _setupTimer(token: string, ttlMs?: number): NodeJS.Timeout {
    const timer = setTimeout(() => {
      const pending = this.pending.get(token);
      if (pending) {
        this.pending.delete(token);
        pending.resolve({ outcome: CONFIRMATION_OUTCOME.TIMEOUT });
      }
    }, ttlMs ?? this.ttlMs);
    timer.unref?.();
    return timer;
  }

  /**
   * 解析确认。校验 token 存在且属于请求用户，否则返回 false（controller 转 404）。
   * 同步更新库状态（approved/declined + decided_at）。
   * HS-6：trustTool 为 true 时，后续同工具写操作免确认。**作用域由调用方持有**
   * （`chatStreamImpl` 的局部 Set）——即一次对话轮次，随请求结束丢弃，不是整个会话。
   */
  async resolve(
    token: string,
    requestUserId: string,
    decision: 'approve' | 'decline' | 'reject',
    trustTool?: boolean,
  ): Promise<boolean> {
    // 决策词统一（CE-1 B3b）：规范集 approve | decline；legacy `reject` 归一为 decline。
    const outcome: 'approve' | 'decline' =
      decision === CONFIRMATION_OUTCOME.APPROVE ? CONFIRMATION_OUTCOME.APPROVE : CONFIRMATION_OUTCOME.DECLINE;
    const pending = this.pending.get(token);
    if (!pending || pending.userId !== requestUserId) {
      return false;
    }
    // 条件更新是**唯一仲裁点**：affected=1 才由本次决策执行；离线裁决与对话内裁决并发时只有一方拿得到。
    let affected: number | undefined;
    try {
      const res = await this.reqRepo.update(
        { token, operatorId: requestUserId, status: CONFIRMATION_STATUS.PENDING },
        {
          status:
            outcome === CONFIRMATION_OUTCOME.APPROVE
              ? CONFIRMATION_STATUS.APPROVED
              : CONFIRMATION_STATUS.DECLINED,
          decidedAt: new Date(),
        },
      );
      affected = res?.affected;
    } catch (err) {
      // Fail closed, matching `decideOutOfBand`: without evidence that the decision reached the
      // database, the tool must not run. The previous stance swallowed the error and resolved the
      // in-memory promise anyway, so a DB hiccup meant "tool executed, row still pending" — the
      // next decision (in conversation or from the Action Center) then executed it a second time.
      // External MCP write tools carry no idempotency key, so that second run is a real replay.
      //
      // 与 `decideOutOfBand` 同口径 **fail-closed**：拿不到「决策已落库」的证据就不放行执行。
      // 旧口径吞掉异常仍 resolve 内存态 → DB 抖动时「工具已执行、行仍 pending」，
      // 再裁决一次即二次执行；外部 MCP 写工具没有幂等键，那第二次是真重放。
      console.error(`[ConfirmationStore] persist resolve failed: ${(err as Error).message}`);
      return false;
    }
    // 只在**明确** 0 行命中时认定「已被并发裁决」——undefined 表示驱动没给该信息
    // （真实 TypeORM 的 update 总是带 affected；此处对不放该字段的替身保持宽容）
    if (affected === 0) {
      return false;
    }
    clearTimeout(pending.timer);
    this.pending.delete(token);
    pending.resolve({
      outcome,
      trustTool,
    });
    return true;
  }

  /**
   * Out-of-band decision (GA "waiting on me" centre; confirmation-lifecycle v2 `via: out_of_band`):
   * the user decides from the Action Center after leaving the conversation, inside the offline
   * window. Only the DB row is authoritative (not the in-memory map), so this survives a restart.
   *
   * The idempotency guard is the same conditional update: `status='pending'` **and still inside the
   * offline window** are the only gate — `affected=0` returns `already_decided` (the same shape as
   * "already decided"), and the caller must never execute the tool on it. Repeat clicks, a race with
   * an in-conversation decision, and a late decision whose window has passed before the sweep runs
   * all take this path.
   *
   * CONF-7: the window is checked **inside the same conditional update**, not read-then-judged. The
   * bound matches the read side (`isWithinOfflineWindow`, closed `createdAt >= cutoff`) and is the
   * complement of the sweep's strict `<` — otherwise a late approval could still win during the gap
   * before the sweep, and "the list says clickable" and "the decision says refused" would both hold
   * at the same instant.
   *
   * We deliberately do **not** resolve the in-memory wait: if a dialogue stream is still waiting on
   * the same token, let its own wait window expire instead of resolving a decision that came from
   * elsewhere. Two reasons: (1) the dialogue's execution branch accepts only `approve`, so resolving
   * it would hand it an execution opportunity — a possible double execution; (2) the dialogue side
   * then needs no change at all, keeping the seam small. The cost, stated honestly: that dialogue
   * shows "timed out", while the action was in fact approved and executed in the Action Center —
   * and that late fact is written back to the conversation by the caller (`MyConfirmationService`)
   * rather than by resolving the wait here.
   *
   * 离线裁决（GA 待我确认中心；confirmation-lifecycle v2 的 `via: out_of_band`）：
   * 用户离开对话后、在离线窗口内从 Action Center 裁决。**只认 DB 行**（不依赖内存 Map），故服务重启后仍可用。
   *
   * 幂等守卫同样是条件更新：`status='pending'` **且仍在离线窗口内**是唯一闸门——affected=0 一律返回
   * `already_decided`（与「行已被裁决」同形），**调用方据此绝不执行工具**（重复点击 / 与对话内裁决并发 /
   * 清扫尚未跑到但窗口已过的迟到裁决都走这条）。
   *
   * CONF-7：窗口判断**在同一条件更新里**，不是先读再判。边界与读侧 `isWithinOfflineWindow` 同口径
   * （闭区间 `createdAt >= cutoff`），与清扫的严格 `<` 互补——否则清理任务还没跑的那段时间里，
   * 迟到的批准仍能赢，且「列表说可点、裁决说不行」会在同一时刻同时成立。
   *
   * **有意不触碰内存里的等待 promise**：若对话流仍在等同一个 token，让它自然走到等待窗口超时，
   * 而不是替它 resolve 一个「来自别处」的决策。理由有二：① 对话流的执行分支只认 approve，
   * 替它 resolve 等于给它一次执行机会 → 可能双执行；② 这样对话侧一行都不用改，接缝更小。
   * 代价（如实记录）：那条对话会显示「超时未确认」，而操作其实已在 Action Center 里被批准并执行 ——
   * 该「迟到的事实」由调用方（`MyConfirmationService`）回写对话，而不是在这里 resolve 等待。
   */
  async decideOutOfBand(
    token: string,
    requestUserId: string,
    decision: 'approve' | 'decline' | 'reject',
  ): Promise<{ ok: boolean; reason?: 'not_found' | 'already_decided'; status?: string }> {
    const nextStatus =
      decision === CONFIRMATION_OUTCOME.APPROVE ? CONFIRMATION_STATUS.APPROVED : CONFIRMATION_STATUS.DECLINED;

    const row = await this.reqRepo.findOne({ where: { token } });
    // 越权与不存在同形返回（不泄露他人 token 是否存在）
    if (!row || row.operatorId !== requestUserId) return { ok: false, reason: 'not_found' };

    // CONF-7: the window lives in the same condition as `pending` (one atomic write). `>=` shares
    // `offlineWindowCutoff` with the read side, so "exactly at the cutoff" reads the same in both.
    // CONF-7：窗口与 `pending` 同处一个条件（同一原子操作）。`>=` 与读侧共用 `offlineWindowCutoff`，
    // 故「恰好等于截止时刻」在列表与裁决两边结论一致。
    const cutoff = offlineWindowCutoff(await this.offlineTtlMs());
    const res = await this.reqRepo.update(
      {
        token,
        operatorId: requestUserId,
        status: CONFIRMATION_STATUS.PENDING,
        createdAt: MoreThanOrEqual(cutoff),
      },
      { status: nextStatus, decidedAt: new Date() },
    );
    // 离线裁决是安全热路径：这里**必须**拿到明确的「命中 0 行」才认幂等，
    // 拿不到 affected 说明底层没给出可判定的结果 —— 宁可拒绝，也不误执行。
    // Zero rows has two causes (already non-pending / window passed before the sweep ran); they are
    // deliberately the same shape, and neither changes the row.
    // 0 行有两种成因（行已非 pending / 窗口已过且清扫未跑），对外同形；两种都**不改状态**。
    if (!res || res.affected === undefined || res.affected === 0) {
      return { ok: false, reason: 'already_decided', status: row.status };
    }

    // 有意不 resolve 内存里的等待 promise（见方法注释）——对话侧保持零改动，且不可能双执行
    return { ok: true, status: nextStatus };
  }

  /**
   * 离线窗口到期清理（由 maintenance 定时任务调用）：把创建时间早于 `now - offlineTtlMs` 且仍 `pending`
   * 的行转 `timeout`（复用既有终态）。返回受影响行数（观测用）。
   */
  async expireStale(offlineTtlMs: number = CONFIRMATION_DEFAULT_OFFLINE_TTL_MS): Promise<number> {
    const cutoff = offlineWindowCutoff(offlineTtlMs);
    const res = await this.reqRepo.update(
      { status: CONFIRMATION_STATUS.PENDING, createdAt: LessThan(cutoff) },
      { status: CONFIRMATION_STATUS.TIMEOUT, decidedAt: new Date() },
    );
    return res?.affected ?? 0;
  }

  /**
   * ACT-7：这个 artifact 是**由第二个人批准**的吗？
   *
   * 执行点要重算「这个工具现在是否要求审批」（等待窗口内策略可以把 R3 升成 R4），而判据的落脚点不是
   * 调用方声明的布尔，是**凭据本身**：只有 `status='approved'` **且** `approverId` 非空的行才算「有过
   * 一位审批人」—— 操作者本人点的 R3 确认同样落 `approved`，但它不是双人审批（本仓 R4 的语义就是
   * **第二个人**点头）。
   *
   * 判据窄到只回答这一个问题、不返回整行：调用方要的只是「有没有第二个人的批准」，多给的东西会诱使
   * 别处拿它当授权快照用——那是确认域自己的事（快照走 `authorization` 列与解释器）。
   */
  async isSecondPersonApproval(token: string): Promise<boolean> {
    const row = await this.reqRepo.findOne({ where: { token } });
    return row?.status === CONFIRMATION_STATUS.APPROVED && row.approverId != null;
  }

  /** 当前待确认数量（测试/观测用） */
  get pendingCount(): number {
    return this.pending.size;
  }
}
