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

import { Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { randomUUID } from 'crypto';
import { AiConfirmationRequest } from '../approvals/ai-confirmation-request.entity';
import { SettingsService, SETTING_KEYS } from '../../settings/settings.service';

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

/** KB-5 run-level approval：run 批内单个动作（工具名 + 参数 + 人读摘要 + 自身风险级） */
export interface RunItem {
  toolName: string;
  args: Record<string, unknown>;
  /** 人读 diff 摘要（"创建事件：产品评审…"）；无摘要动作不进 run（§3.3 诚实降级） */
  summary: string;
  riskLevel: string;
}

export interface PendingConfirmation {
  token: string;
  userId: string;
  toolName: string;
  args: Record<string, unknown>;
  /** KB-5：'single'（默认，单动作）/ 'run'（一次授权整批，token = runId） */
  kind?: 'single' | 'run';
  /** HS-6：本次会话是否信任该工具（后续免确认） */
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
   */
  async create(
    userId: string,
    toolName: string,
    args: Record<string, unknown>,
    ttlMs?: number,
    conversationId?: string,
  ): Promise<{ token: string; decision: Promise<ConfirmationResolveResult> }> {
    const token = randomUUID();
    let resolveFn!: (result: ConfirmationResolveResult) => void;
    const decision = new Promise<ConfirmationResolveResult>((resolve) => {
      resolveFn = resolve;
    });
    await this._persist({ token, toolName, args: JSON.stringify(args), operatorId: userId, riskLevel: 'R3', kind: 'single', conversationId });
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
    await this._persist({
      token,
      toolName: 'run',
      args: '[]',
      operatorId: userId,
      riskLevel,
      kind: 'run',
      runItems: JSON.stringify(items),
      conversationId,
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
  }): Promise<void> {
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
   * HS-6：trustTool 为 true 时，后续同工具写操作本会话免确认。
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
   * 离线裁决（GA 待我确认中心；confirmation-lifecycle v2 的 `via: out_of_band`）：
   * 用户离开对话后、在离线窗口内从 Action Center 裁决。**只认 DB 行**（不依赖内存 Map），故服务重启后仍可用。
   *
   * 幂等守卫同样是条件更新：`status='pending'` 是唯一闸门——affected=0 一律返回
   * `already_decided`，**调用方据此绝不执行工具**（重复点击 / 与对话内裁决并发都走这条）。
   *
   * **有意不触碰内存里的等待 promise**：若对话流仍在等同一个 token，让它自然走到等待窗口超时，
   * 而不是替它 resolve 一个「来自别处」的决策。理由有二：① 对话流的执行分支只认 approve，
   * 替它 resolve 等于给它一次执行机会 → 可能双执行；② 这样对话侧一行都不用改，接缝更小。
   * 代价（如实记录）：那条对话会显示「超时未确认」，而操作其实已在 Action Center 里被批准并执行。
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

    const res = await this.reqRepo.update(
      { token, operatorId: requestUserId, status: CONFIRMATION_STATUS.PENDING },
      { status: nextStatus, decidedAt: new Date() },
    );
    // 离线裁决是安全热路径：这里**必须**拿到明确的「命中 0 行」才认幂等，
    // 拿不到 affected 说明底层没给出可判定的结果 —— 宁可拒绝，也不误执行。
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
    const cutoff = new Date(Date.now() - offlineTtlMs);
    const res = await this.reqRepo.update(
      { status: CONFIRMATION_STATUS.PENDING, createdAt: LessThan(cutoff) },
      { status: CONFIRMATION_STATUS.TIMEOUT, decidedAt: new Date() },
    );
    return res?.affected ?? 0;
  }

  /** 当前待确认数量（测试/观测用） */
  get pendingCount(): number {
    return this.pending.size;
  }
}
