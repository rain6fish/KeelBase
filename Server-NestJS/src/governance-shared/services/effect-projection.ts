// SPDX-License-Identifier: Apache-2.0

import { Logger } from '@nestjs/common';
import { LessThan, Repository } from 'typeorm';
import { AiToolSideEffect } from '../../governance-shared/entities/ai-tool-side-effect.entity';
import { AiWriteClaim } from '../entities/ai-write-claim.entity';
import { EffectRegistration } from './effect-registration';
import { WriteClaimStore } from './write-claim.store';
import { EffectComparabilityStore } from './effect-comparability.store';
import { EffectDisputeStore } from './effect-dispute.store';
import type { RevokeClass } from '../../ai/interfaces/tool.interface';
import type { HostHelpers } from './tool-effects.types';
import { revokeAge, revokeWindow } from '../../governance-core/revoke-staleness';
import { REVOKE_STATUS } from '../../governance-core/revoke-status';
import { paginated } from '../../common/dto/paginated';

/**
 * 读侧投影：管理端列表、本人清单、按会话/按业务目标反查、目标富化，以及它们共用的几个投影助手。
 * **从 `ai-tool-effects.service.ts` 整段搬出**（2026-10-11 拆分第九批），实现一字未改 ——
 * 只把几个私有名去掉下划线、`this.host.*` 指向留在服务上的那三样助手。
 *
 * 它是**最杂**的一簇（`list` 一个方法就读遍登记、claims、可比性、争议四家的注解列），所以它要把那四家
 * 都作为依赖收进来 —— 这也正是它此前一直留到最后才搬的原因。
 *
 * The read-side projections. It is the busiest cluster — `list` alone reads annotations written by
 * registration, claims, comparability and dispute — so it takes all four as dependencies, which is why
 * it moved last.
 */
export class EffectProjection {
  /** ⚠ 日志名沿用搬动前那一个：拆分不该让运维看到的日志前缀变样（同前四个 store）。 */
  private readonly logger = new Logger('AiToolEffectsService');

  constructor(
    private readonly effectsRepo: Repository<AiToolSideEffect>,
    private readonly claims: WriteClaimStore,
    private readonly comparability: EffectComparabilityStore,
    private readonly dispute: EffectDisputeStore,
    private readonly registration: EffectRegistration,
    private readonly host: HostHelpers,
  ) {}

  /** KB-6/deferred④：撤销可点 = 服务端单一权威（status=executed 且档位非 none）；三端据此渲染，不各自复制判定 */
  isRevocable(
    revokeClass: string | null | undefined,
    status: string,
  ): boolean {
    if (status !== 'executed') return false;
    return (
      revokeClass === 'local_compensate' ||
      revokeClass === 'governed_external' ||
      revokeClass === 'transactional'
    );
  }

  /** 管理台：按用户/类型列出 AI 创建的副作用（含目标记录当前状态） */
  async list(options: { userId?: number; page?: number; limit?: number; stale?: boolean } = {}) {
    const page = options.page ?? 1;
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
    const where: Record<string, unknown> = {};
    if (options.userId !== undefined) where.userId = String(options.userId);

    // REV-2：只看「陈旧未了结」时在库侧过滤（compensating 且请求时刻早于 now − 阈值）。
    // 请求时刻为 NULL 的旧行天然不匹配 —— 与 revokeAge 对它们「年龄未知，故不判陈旧」的口径一致，
    // 不把「查不到年龄」悄悄算成「陈旧」。
    const thresholdMinutes = this.host.staleThresholdMinutes();
    if (options.stale === true) {
      where.revokeStatus = REVOKE_STATUS.COMPENSATING;
      where.revokeRequestedAt = LessThan(new Date(Date.now() - thresholdMinutes * 60_000));
    }

    const [items, total] = await this.effectsRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    // REV-17：本页每一行的可比性**历史**，一次查询取全页（不按行 N+1 —— 这个映射里已经有一次
    // `_loadTarget`，不该再加一层按行的往返）。
    const comparabilityHistory = await this.comparability.historyFor(items.map((e) => e.id));

    // 附带目标记录当前状态（软删则标注可恢复）
    const enriched = await Promise.all(
      items.map(async (effect) => {
        const target = await this.host.loadTarget(effect.resultType, effect.resultId);
        const targetSoftDeleted = target?.deletedAt != null;
        // REV-2：`compensating` 的年龄与陈旧度。只回答「多久了 / 可能已陈旧」，
        // 真值仍在目标系统 —— 不据此把 revokeStatus 改写成成功或失败。
        const age = revokeAge(effect.revokeStatus, effect.revokeRequestedAt, new Date(), thresholdMinutes);
        // REV-2 细化：同一条 `compensating` 还分两个窗口 —— 「可能根本没到达」（无确认凭据）与
        // 「确实到达了但对方没给终态」（有确认凭据）。此前两者读数相同，聚合视图因此不诚实。
        const window = revokeWindow(effect.revokeStatus, effect.revokeAcknowledgedAt);
        return {
          id: effect.id,
          toolName: effect.toolName,
          conversationId: effect.conversationId,
          resultType: effect.resultType,
          resultId: effect.resultId,
          argsHash: effect.argsHash,
          createdAt: effect.createdAt,
          targetExists: !!target,
          targetSoftDeleted,
          targetTitle: target?.title ?? null,
          beforeSnapshot: effect.beforeSnapshot ?? null,
          afterSnapshot: effect.afterSnapshot ?? null,
          // KB-6：撤销能力档位 + 归一状态（4 值），供前端据档位诚实渲染（none 不显示撤销钮）
          revokeClass: this.readRevokeClass(effect),
          revokeStatus: effect.revokeStatus ?? null,
          // REV-2：补偿请求时刻 + 年龄 + 陈旧标记（阈值由服务端配置，前端不必硬编码）
          revokeRequestedAt: effect.revokeRequestedAt ? effect.revokeRequestedAt.toISOString() : null,
          revokePending: age.pending,
          revokeAgeMinutes: age.ageMinutes,
          revokeStale: age.stale,
          // REV-2 细化：确认时刻 + 窗口（unacknowledged = 可能未到达 / awaiting_target = 已到达无回音）
          revokeAcknowledgedAt: effect.revokeAcknowledgedAt
            ? effect.revokeAcknowledgedAt.toISOString()
            : null,
          revokeWindow: window,
          // REV-11: **who this is on**. `revokeStale` already answers "is anything stuck" and the two
          // windows answer "stuck how", but neither says whose work it is — and "somewhere to look"
          // and "someone has to look" are different things. The accountable party is the user on
          // whose behalf the write happened; it is an existing column, surfaced rather than inferred.
          // The assignee for this surface is the admin role itself, which is why no assignee field is
          // invented here: only admins can read this list at all.
          // REV-11：**这是谁的活**。`revokeStale` 已答「有没有卡住」、两个窗口已答「怎么卡住的」，
          // 却都没说是谁的活——而「有的看」与「必须有人看」是两件事。责任人是那次写所代表的使用者，
          // 是一个**既有列**的暴露，不是推断。本面的指派对象就是管理端角色本身，故此处不另造指派字段：
          // 这张列表本来就只有管理员读得到。
          ownerUserId: effect.userId,
          // REV-7：**谁在替该用户执行**，读自本行 —— 不 join 审计行即可回答（导入本列之前的行是 null，
          // 语义为「未知」，不回填）。
          agentId: effect.agentId ?? null,
          // REV-10：**账上没有的写**（本次调用在数据层真的写了、而登记层没有对应行）。`null` = 没观察到。
          undeclaredWrites: this.registration.parseUndeclaredWrites(effect.undeclaredWrites),
          // REV-11: "needs claiming" is **derived**, never stored — a stale row nobody has taken on.
          // One fact, one home: storing it alongside the two columns below would let the flag and the
          // columns disagree, and no reader could tell which one to believe.
          // REV-11：「需认领」是**派生**的，从不落库——滞留且无人接手。同一事实只住一处：若与下面两列
          // 并列存一份，flag 与列就可能互相矛盾，而读者无从判断该信哪个。
          revokeNeedsClaim: age.stale && effect.revokeClaimedBy == null,
          revokeClaimedBy: effect.revokeClaimedBy ?? null,
          revokeClaimedAt: effect.revokeClaimedAt ? effect.revokeClaimedAt.toISOString() : null,
          // REV-1：该组是否「声明与持有不一致」——标记 + 证据（被拒声明与双向差集），供管理端解释为何撤销未报完成
          disputed: this.dispute.hasOpenDispute(effect),
          dispute: this.dispute.parseDispute(effect.revokeDispute),
          // REV-17: **the history of what this revoke promised to check and could not** — one entry per
          // attempt, oldest first, plus the legacy single-column reading when one exists (it predates the
          // table, so its moment is unknown and is not invented). An empty list is the one reading that
          // says nothing was ever checked; `checked` says which of the two a given attempt's reading is,
          // so "checked and clean" and "never revoked" no longer collapse into the same value.
          // REV-17：**这次撤销承诺要查、却没能查到的那些的历史** —— 每次尝试一条、按时间升序；若存在旧的
          // 单列读数也带上（它早于本表，其时刻不可考，故不臆造）。空列表是唯一一个「从未查过」的读数；
          // `checked` 说明某次尝试的读数属于哪一种，故「查过且干净」与「从未撤销」不再塌成同一个值。
          revokeComparability: this.comparability.comparabilityFor(effect, comparabilityHistory),
          // REV-6：该行身份缺「变更」那半（成组行登记时无变更快照）——读取侧不得默认为完整身份
          identityIncomplete: effect.identityIncomplete === true,
          // REV-13: **why** the change half is missing. `null` means one of two things and neither
          // pretends to be knowledge: the row is not flagged, or it was flagged before this column
          // existed (reason unknowable). Two of the four values are faults, two are design choices.
          // REV-13：缺变更那半的**成因**。`null` 有两种读法，都不冒充已知：该行未置标，或置标于本列
          // 出现之前（原因不可考）。四个取值里两个是故障、两个是设计选择。
          identityIncompleteReason: effect.identityIncompleteReason ?? null,
          // 级联补偿（v3）：组标识 + 根引用，供前端显示「这是 N 条中的第 M 条」
          compensationGroup: effect.compensationGroup ?? null,
          parentEffectId: effect.parentEffectId ?? null,
          status: this.normalizeStatus(effect, targetSoftDeleted),
          // 服务端单一权威的撤销可点判定（status=executed 且档位非 none）
          revocable: this.isRevocable(
            this.readRevokeClass(effect),
            this.normalizeStatus(effect, targetSoftDeleted),
          ),
          // D2：AI 决策证据 ↔ 实际状态变化——由快照导出紧凑变更摘要（不返回全量值，控载荷）
          change: this.summarizeChange(effect.beforeSnapshot, effect.afterSnapshot),
        };
      }),
    );

    const page_ = paginated(enriched, total, page, limit);
    if (options.stale !== true) return page_;

    // ACT-6 第 2 片留下缺口、用户 2026-09-30 裁定接到这条车道：卡住的**占位行**此前只对代码可见 ——
    // `listStaleClaims` 的唯一调用者是它的用例，没有端点、没有管理台露出。它装两类东西，同一口径
    // 「**可见，不自动解决**」：**崩溃残留**（claim 没走到落定）与**外部写失败**（目标是否收到不可知，
    // 故既不释放也不落定）。阈值与上面副作用行的 `stale` **同源**（`_staleThresholdMinutes`），
    // 免得同一屏里两个「陈旧」各说各的。
    const staleClaims = (await this.claims.listStaleClaims(thresholdMinutes * 60_000)).map((c) =>
      this.projectStaleClaim(c),
    );
    return { ...page_, staleClaims };
  }

  /**
   * 陈旧占位行的读侧投影 —— 同 REV-11 的口径：只陈述**谁的、哪一次、卡了多久、试了几次**。
   * 真值在目标系统（外部写）或崩溃前那一刻（残留），**本读数不下判决**，故没有「成功/失败」字段。
   */
  projectStaleClaim(c: AiWriteClaim): Record<string, unknown> {
    return {
      id: c.id,
      idempotencyKey: c.idempotencyKey,
      userId: c.userId,
      conversationId: c.conversationId ?? null,
      runId: c.runId ?? null,
      toolName: c.toolName,
      agentId: c.agentId ?? null,
      status: c.status,
      claimedAt: c.claimedAt.toISOString(),
      ageMinutes: Math.floor((Date.now() - c.claimedAt.getTime()) / 60_000),
      attempts: c.attempts,
    };
  }

  /**
   * AI Action Center（§internal.17 北极星用户侧，docs/ai-action-center.spec.md）：本人 AI 写副作用清单 + 归一状态 + 目标富化。
   * 数据最小化：不回显 args/argsHash/before/after 快照（字段级证据走 B4/审计面）；人类标签由前端按 toolName 映射（D2 toolLabel）。
   * status 归一：目标软删（targetSoftDeleted=true）→ revoked，否则 executed。
   */
  /**
   * D2：从 before/after 快照导出紧凑「实际状态变化」摘要——kind（created/updated/unknown）+ 变更字段名。
   * 只给字段名（不给全量值），列表载荷可控；详细 diff 仍走动作详情（FieldDiff）。
   */
  summarizeChange(
    beforeRaw: string | null | undefined,
    afterRaw: string | null | undefined,
  ): { kind: 'created' | 'updated' | 'unknown'; fields: string[] } {
    const parse = (raw: string | null | undefined): Record<string, unknown> | null => {
      if (!raw) return null;
      try {
        const v = JSON.parse(raw) as unknown;
        return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
      } catch {
        return null;
      }
    };
    const before = parse(beforeRaw);
    const after = parse(afterRaw);
    if (!before && after) return { kind: 'created', fields: Object.keys(after) };
    if (before && after) {
      const fields = Object.keys(after).filter(
        (k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]),
      );
      return { kind: 'updated', fields };
    }
    return { kind: 'unknown', fields: [] };
  }

  async listOwned(userId: string, options: { page?: number; limit?: number } = {}) {
    const page = options.page ?? 1;
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 50);

    const [items, total] = await this.effectsRepo.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const enriched = await Promise.all(
      items.map(async (effect) => {
        const target = await this.host.loadTarget(effect.resultType, effect.resultId);
        const targetSoftDeleted = target?.deletedAt != null;
        return {
          id: effect.id,
          toolName: effect.toolName,
          conversationId: effect.conversationId,
          resultType: effect.resultType,
          resultId: effect.resultId,
          createdAt: effect.createdAt,
          targetExists: !!target,
          targetSoftDeleted,
          targetTitle: target?.title ?? null,
          // KB-6：撤销能力档位 + 归一状态（4 值，禁把 governed_external 显示为 revoked）
          revokeClass: this.readRevokeClass(effect),
          revokeStatus: effect.revokeStatus ?? null,
          // 级联补偿（v3）：组标识 + 根引用
          compensationGroup: effect.compensationGroup ?? null,
          parentEffectId: effect.parentEffectId ?? null,
          status: this.normalizeStatus(effect, targetSoftDeleted),
          // 服务端单一权威的撤销可点判定（status=executed 且档位非 none）
          revocable: this.isRevocable(
            this.readRevokeClass(effect),
            this.normalizeStatus(effect, targetSoftDeleted),
          ),
          // D2：AI 决策证据 ↔ 实际状态变化——由快照导出紧凑变更摘要（不返回全量值，控载荷）
          change: this.summarizeChange(effect.beforeSnapshot, effect.afterSnapshot),
        };
      }),
    );

    return paginated(enriched, total, page, limit);
  }

  /**
   * P0-14：按对话取副作用（含目标记录当前状态），供用户可见的执行轨迹用。
   * 复用 _loadTarget 富化，按 createdAt 升序。
   */
  /**
   * B4 治理视图：按业务动作（resultType+resultId，如 crm_task:42）反查 AI 副作用（供「业务动作 → 治理轨迹」展示）。
   *
   * The pair is not naturally unique for result types with no local entity: rows written before the
   * proxy identity carried a user dimension can share one pair across users. Both consequences are
   * handled here rather than at each call site — `viewerUserId` narrows the lookup to that user, so a
   * viewer can neither be served someone else's effect nor get a 403 that leaks its existence; and
   * `order` makes "which row" deterministic, so an admin or service identity that passes no viewer
   * still gets a stable answer instead of whatever the driver returned first.
   *
   * 该二元组对**无本地实体**的 resultType 不天然唯一：在代理身份带上用户维度之前写入的行，
   * 可能跨用户共享同一对值。两个后果都在此处理，不推给每个调用点：`viewerUserId` 把查询收窄到
   * 该用户，查看者既拿不到他人的副作用、也不会吃到「存在但不属于你」的 403（那泄露行的存在）；
   * `order` 让「取到哪一行」确定，不传查看者的管理员 / 服务身份也拿到稳定答案。
   */
  async findByTarget(
    resultType: string,
    resultId: number,
    viewerUserId?: string,
  ): Promise<AiToolSideEffect | null> {
    const where: Record<string, unknown> = { resultType, resultId };
    if (viewerUserId !== undefined) where.userId = viewerUserId;
    return this.effectsRepo.findOne({ where: where as any, order: { id: 'ASC' } });
  }

  /**
   * A-3 restore state, **three-valued** — because a boolean cannot say "we do not know".
   *
   * `restored`: `revoke_status='revoked'` proves a compensation happened and `targetSoftDeleted=false`
   * proves the target is live again (the recycle-bin restore clears `deletedAt` and leaves
   * `revoke_status` alone, so the pair is exactly "revoked, then restored").
   * `unknown`: the row is `compensating` — the intent was recorded but the outcome was not. After a
   * restore that row has exactly the same observable shape as "never revoked", so the only honest
   * answer is "unknown". Reading it as `not_restored` was the PRE-3 silent degradation.
   * `not_restored`: everything else (never revoked, still revoked, or a recorded failure).
   *
   * A-3 恢复态，**三值** —— 布尔值说不出「不知道」。
   *
   * `restored`：`revoke_status='revoked'` 证明补偿发生过，`targetSoftDeleted=false` 证明目标已回到生效态
   *（回收站恢复只清 `deletedAt`、不动 `revoke_status`，两者组合即「撤销后又恢复」这一历史事实）。
   * `unknown`：该行是 `compensating` —— 意图写了、结果没落。回收站恢复之后，它的可观测形状与
   *「从未撤销」完全相同，唯一诚实的答案是「未知」。把它读成 `not_restored` 正是 PRE-3 的静默退化。
   * `not_restored`：其余情形（从未撤销 / 仍是撤销态 / 有记录的失败）。
   */
  restoreState(
    effect: AiToolSideEffect,
    targetSoftDeleted: boolean,
  ): 'restored' | 'not_restored' | 'unknown' {
    if (effect.revokeStatus === REVOKE_STATUS.COMPENSATING) return 'unknown';
    return effect.revokeStatus === REVOKE_STATUS.REVOKED && !targetSoftDeleted
      ? 'restored'
      : 'not_restored';
  }

  /**
   * Boolean view of `restoreState`. **`false` means "not proven restored", not "known not revoked"**:
   * when the state is `unknown` this returns `false` and the caller must read `revokeStatus` (which the
   * detail endpoint already carries) to see the unknown. The tri-state is the single source; this is
   * only the boolean face of it.
   *
   * `restoreState` 的布尔视图。**`false` 的含义是「未被证明恢复」，不是「确知未撤销」**：
   * 状态为 `unknown` 时它返回 `false`，调用方必须读 `revokeStatus`（详情端点已带该字段）才能看见「未知」。
   * 三值是单一来源，这里只是它的布尔面。
   */
  isRestored(effect: AiToolSideEffect, targetSoftDeleted: boolean): boolean {
    return this.restoreState(effect, targetSoftDeleted) === 'restored';
  }


  /** B4/A-3 生命周期富化：副作用目标记录当前状态（是否存在/软删/标题）——撤销态判定依赖 targetSoftDeleted */
  async describeTarget(
    resultType: string,
    resultId: number,
  ): Promise<{ targetExists: boolean; targetSoftDeleted: boolean; targetTitle: string | null }> {
    const target = await this.host.loadTarget(resultType, resultId);
    return {
      targetExists: !!target,
      targetSoftDeleted: target?.deletedAt != null,
      targetTitle: target?.title ?? null,
    };
  }

  /**
   * KB-6：读时 revokeClass 兜底（旧行/未快照行）。工具注册命中优先；否则按本地可软删推导。
   */
  readRevokeClass(effect: AiToolSideEffect): RevokeClass {
    if (effect.revokeClass) return effect.revokeClass as RevokeClass;
    return this.host.resolveSnapshotClass(effect.toolName, effect.resultType);
  }

  /**
   * KB-6：status 归一（4 值），供 list/listOwned/listForConversation 共用。
   * - targetSoftDeleted（本地 live 信号权威，RG-3 回收站恢复后自动回 executed）→ revoked
   * - 否则按 revoke_status：compensating → revoking_external（**结果未知**，禁 revoked；PRE-3 起也包括
   *   「本地软删已执行、终态未能落库」——枚举已冻结，`revoking_external` 是它唯一的「未了结」桶）；
   *   revoke_failed → revoke_failed；null/其他 → executed
   * 兼容：旧本地已撤行经 targetSoftDeleted 仍 revoked；旧 proxy 行 class 兜底 none → executed（前端据此藏钮）。
   */
  normalizeStatus(effect: AiToolSideEffect, targetSoftDeleted: boolean): string {
    if (targetSoftDeleted) return 'revoked';
    switch (effect.revokeStatus) {
      case REVOKE_STATUS.COMPENSATING:
        return 'revoking_external';
      case REVOKE_STATUS.REVOKE_FAILED:
        return 'revoke_failed';
      default:
        return 'executed';
    }
  }

  /** §internal.16 A-2 业务实体账本：按实体取全部 AI 副作用（时间升序，供行为史聚合） */
  async findManyByTarget(resultType: string, resultId: number): Promise<AiToolSideEffect[]> {
    return this.effectsRepo.find({
      where: { resultType, resultId } as any,
      order: { createdAt: 'ASC' },
    });
  }

  async listForConversation(conversationId: string) {
    const items = await this.effectsRepo.find({
      where: { conversationId },
      order: { createdAt: 'ASC' },
    });
    return Promise.all(
      items.map(async (effect) => {
        const target = await this.host.loadTarget(effect.resultType, effect.resultId);
        const targetSoftDeleted = target?.deletedAt != null;
        return {
          id: effect.id,
          toolName: effect.toolName,
          conversationId: effect.conversationId,
          resultType: effect.resultType,
          resultId: effect.resultId,
          argsHash: effect.argsHash,
          createdAt: effect.createdAt.toISOString(),
          targetExists: !!target,
          targetSoftDeleted,
          targetTitle: target?.title ?? null,
          beforeSnapshot: effect.beforeSnapshot ?? null,
          afterSnapshot: effect.afterSnapshot ?? null,
          // KB-6：撤销能力档位 + 归一状态（执行轨迹面同样据档位诚实渲染）
          revokeClass: this.readRevokeClass(effect),
          revokeStatus: effect.revokeStatus ?? null,
          // 级联补偿（v3）：组标识 + 根引用
          compensationGroup: effect.compensationGroup ?? null,
          parentEffectId: effect.parentEffectId ?? null,
          status: this.normalizeStatus(effect, targetSoftDeleted),
          // 服务端单一权威的撤销可点判定（status=executed 且档位非 none）
          revocable: this.isRevocable(
            this.readRevokeClass(effect),
            this.normalizeStatus(effect, targetSoftDeleted),
          ),
        };
      }),
    );
  }
}
