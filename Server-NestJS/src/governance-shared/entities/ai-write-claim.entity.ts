// SPDX-License-Identifier: Apache-2.0

import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** 占位行的三态（见下方状态机）。**字面量单源**：服务与读侧共用，勿各自硬编码字符串。 */
export const WRITE_CLAIM_STATUS = {
  /** 已占位，执行中（或崩溃残留；两者当前不可区分） */
  CLAIMED: 'claimed',
  /** 执行完成且副作用已登记（`effectId` 指向那行；无副作用可登记的写为 null） */
  SETTLED: 'settled',
  /** 执行失败且**确认未落库**（本地实体写 = 事务未提交）⇒ 允许重试重新占位 */
  RELEASED: 'released',
} as const;

/**
 * 占位行的**治理处置**（AW-16 F-64）—— 与 `status` 正交：`status` 说的是执行账本的事实
 * （占住 / 已执行 / 确认未执行），本列说的是这份滞留**有没有人管、管到什么程度**。
 *
 * - `open`：仍在途窗口内。
 * - `awaiting_decision`：窗口已到期，进入**待裁队列**。`status` 不变、结论不变；只有人或目标的
 *   回答能移动它。
 * - `closed_unknown`：人已释放这份滞留，**结论仍未知**（`status` 保持 `claimed`，键仍被占住）。
 *   这正是「释放不等于允许静默重试」：同一次调用不会因为释放而悄悄重跑。
 *
 * The governance disposition of a claim — orthogonal to `status`. `status` is the execution ledger's
 * fact; this column answers whether the stuck hold has an owner and how far that has gone. Expiry only
 * moves `open → awaiting_decision`; a human release moves it to `closed_unknown` while `status` stays
 * `claimed`, so the key remains occupied and the same call is never silently retried.
 */
export const WRITE_CLAIM_DECISION_STATE = {
  /** 在途窗口内 / within the in-flight window */
  OPEN: 'open',
  /** 已到期，待裁 / window expired, awaiting a human decision */
  AWAITING_DECISION: 'awaiting_decision',
  /** 人已释放滞留，结论未知 / released by a human; conclusion unknown */
  CLOSED_UNKNOWN: 'closed_unknown',
} as const;

export type WriteClaimDecisionState =
  (typeof WRITE_CLAIM_DECISION_STATE)[keyof typeof WRITE_CLAIM_DECISION_STATE];

/**
 * 执行级幂等的**占位行**（ACT-5/6 切片 1，roadmap §2.1.16）。
 *
 * 回答的是「**这一次写正在执行 / 已执行 / 试过但没成**」——在**执行之前**就落定。
 * 此前这条信息不存在：`findExisting → execute → record` 是 check-then-act，两份并发请求
 * 都读到「没有」，于是**目标系统被写两次**，而账上只有一份（`idempotency_key` 的唯一约束
 * 兜的是**账**，不是**动作**）。
 *
 * ## 键 = 既有的幂等键，不新造身份
 * `idempotencyKey` 与 `ai_tool_side_effects.idempotency_key` **同源同值**
 * （`AiToolEffectsService.buildKey`）。它命名的是「**这个用户的这一次逻辑调用**」
 * （`userId:conversationId:toolName:sortKeys(args)`），且**执行前即可算出** —— 故这里不需要
 * 发明第二套身份，唯一约束本身就是**仲裁点**：插入成功者拥有这次执行。
 *
 * ## 为什么单独一张表，不塞进 `ai_tool_side_effects`
 * 后者一行 = 「**已记录的动作成员**」，而「行集合 = 业务动作成员集合」正是本仓自己跟踪的
 * 最大风险 **RISK-B**（roadmap §2.1.12）。往里放**未落定**的行会**主动削弱**那条投影假设，
 * 使撤销/聚合/证据三处都开始看见「可能是动作、可能不是」的行。
 *
 * ## 状态机
 *   claimed  —— 已占位，执行中（或崩溃残留；残留可见但不自动解决，见 service 的 stale 读）
 *   settled  —— 执行完成且副作用已登记（`effectId` 指向那行）
 *   released —— 执行**失败且确认未落库**（本地实体写失败 = 事务未提交）⇒ 允许重试重新占位
 *
 * **范围（切片1 + 切片2）**：**本地实体写**与**代理写 / 外部 MCP 写**都占位。两条路径的**失败政策
 * 不同**，依据是「我们究竟知道什么」：
 * - 本地写抛错 = 事务未提交 ⇒ **确认未落库** ⇒ `released`（允许重试）；
 * - 外部写没有成功 ⇒ 请求**可能已到达**目标（超时 / 不可达 / 目标非 2xx 在传输层分不开）⇒ 占位
 *   **留在 `claimed`**：不释放（释放即邀请一次可能重复的外部写），也不落定（那是对结果下判决）。
 *   过阈值后由 `listStaleClaims` 冒出来待人核对 —— 与崩溃残留同一口径：**可见，不自动解决**。
 *   ⚠ 这只保证**我们自己**不重复发，**不**宣称「重复执行已解决」：真值在目标系统，端到端幂等要
 *   目标系统接受幂等键（roadmap §2.1.16 ACT-9）。
 */
@Entity('ai_write_claims')
@Index(['conversationId'])
// AW-20: one in-flight claim per operation. Partial on purpose — see `operationKey`'s comment.
// AW-20：同一操作同时只允许一条在途占位。有意用部分索引 —— 理由见 `operationKey` 注释。
@Index('IDX_ai_write_claims_operation_lease', ['operationKey'], {
  unique: true,
  where: `"status" = 'claimed' AND "operation_key" IS NOT NULL`,
})
export class AiWriteClaim {
  @PrimaryGeneratedColumn()
  id!: number;

  /** 与 `ai_tool_side_effects.idempotency_key` 同源同值 —— 唯一约束即仲裁点 */
  @Column({ length: 64, unique: true, name: 'idempotency_key' })
  idempotencyKey!: string;

  /**
   * AW-20: the **operation identity** — `sha256(userId:toolName:canonicalArgs)`, no conversation.
   *
   * `idempotency_key` answers "has *this session* already run this call"; it cannot answer "has *this
   * operation* already been started somewhere else", because the conversation is part of the key. Same
   * external effect launched from a second session therefore produced a second claim, and neither knew
   * about the other. This column is the cross-session identity.
   *
   * The **partial unique index** below is what turns it into an arbitration point: at most one claim
   * may be `claimed` per operation at a time, whichever conversation or worker got there first. It
   * binds only `claimed` rows on purpose — a `settled` operation is finished, and the same parameters
   * may legitimately be a **second, separate operation** (criterion: do not collapse the conversation
   * dimension). Such a repeat is then recorded and flagged, never silently treated as the first.
   *
   * `null` on rows written before this column (and on hand-built test fixtures) ⇒ they take no part in
   * the lease; backfilling is impossible because the original arguments are not reconstructible from
   * the stored columns.
   *
   * AW-20：**操作身份** —— `sha256(userId:toolName:canonicalArgs)`，不含会话。
   *
   * `idempotency_key` 回答的是「**这个会话**是否已经跑过这一调用」；它答不了「**这一次操作**是否已经
   * 在别处开始过」，因为会话就在键里。于是同一外部效果从第二个会话发起会得到第二个占位，彼此都不知情。
   * 本列就是那个跨会话身份。
   *
   * 下面的**部分唯一索引**把它变成仲裁点：同一操作同时最多一条 `claimed` 行，无论哪个会话/worker 先到。
   * 它**有意只约束 `claimed`** —— `settled` 表示这一次操作已结束，而相同参数完全可能是**另一次合法操作**
   * （判据：不得把会话维度删掉）。此类重复会被登记并标记，绝不静默当作第一次。
   *
   * 本列之前的行（以及手工装配的测试样例）为 `null` ⇒ 不参与租约；无法回填 —— 原始参数不能从已落库的
   * 列重建。
   */
  // An explicit `type: 'varchar'` is required: the TS side declares `| null`, and without an explicit
  // type TypeORM infers `Object`, which the sqlite driver rejects (same as `release_reason` here).
  // 显式 `type: 'varchar'` 是必需的：TS 侧写了 `| null`，无显式类型时 TypeORM 会推断成 `Object`
  // 而被 sqlite 驱动拒绝（同本实体的 `release_reason` / `prev_hash` 写法）。
  @Column({ type: 'varchar', length: 64, name: 'operation_key', nullable: true })
  operationKey?: string | null;

  @Column({ name: 'user_id' })
  userId!: string;

  @Column({ name: 'conversation_id', nullable: true })
  conversationId?: string;

  /** KB-5 run 授权 id（run 成员写才有） */
  @Column({ length: 64, name: 'run_id', nullable: true })
  runId?: string;

  @Column({ length: 64, name: 'tool_name' })
  toolName!: string;

  @Column({ length: 64, name: 'args_hash' })
  argsHash!: string;

  /** REV-7：谁在替该用户执行（与审计/副作用行同一来源，边界处读一次） */
  @Column({ length: 64, nullable: true, name: 'agent_id' })
  agentId?: string;

  /** claimed | settled | released */
  @Column({ length: 16 })
  status!: string;

  @Column({ type: Date, name: 'claimed_at' })
  claimedAt!: Date;

  @Column({ type: Date, nullable: true, name: 'settled_at' })
  settledAt?: Date | null;

  /** settled 时指向 `ai_tool_side_effects.id`；无副作用可登记的写（如 dry-run）为 null */
  @Column({ type: 'integer', nullable: true, name: 'effect_id' })
  effectId?: number | null;

  /** released 的原因（如 execute_failed）；只陈述事实，不改判定 */
  // 显式 `type: 'varchar'` 是必需的：**有显式类型**才允许 TS 侧写 `| null`（无类型时 TypeORM 按 TS 类型推断，
  // 遇到 `| null` 会解析成 `Object` 而被 sqlite 驱动拒绝 —— 见本仓既有 prev_hash/hash 两列的同一写法）。
  @Column({ type: 'varchar', length: 32, nullable: true, name: 'release_reason' })
  releaseReason?: string | null;

  /**
   * AW-16 F-64: where this hold sits in the governance workflow — see `WRITE_CLAIM_DECISION_STATE`.
   * Defaults to `open`; the hourly sweep moves overdue rows to `awaiting_decision` without touching
   * `status`, and a human release moves them to `closed_unknown`.
   *
   * AW-16 F-64：这份滞留在治理流程里的位置 —— 见 `WRITE_CLAIM_DECISION_STATE`。默认 `open`；每小时
   * 清扫把到期行移到 `awaiting_decision`（不碰 `status`），人的释放把它移到 `closed_unknown`。
   */
  @Column({
    type: 'varchar',
    length: 32,
    default: WRITE_CLAIM_DECISION_STATE.OPEN,
    name: 'decision_state',
  })
  decisionState!: string;

  /** 占位次数：每次 created 或 released→claimed 自增。用于辨识「反复失败」的写 */
  @Column({ type: 'integer', default: 1 })
  attempts!: number;

  /**
   * ACT-5（消费者①）：**这次调用写下的那条审计行**。
   *
   * 证据根此前只能靠 `conversationId + toolName` 在会话里找触发行；ACT-2 把它收紧成「恰好一条才配对」，
   * 于是同一工具被调用两次时它**什么都不说** —— 而那正是从前给出错误答案的形态。执行身份指得出那一条，
   * 配对因此靠**身份**而不是**相像**。
   *
   * `null` = 还没挂上（审计尚未写 / 未装配审计 / 代理写没有占位行）。**不回填**：本列之前的写没有这条
   * 信息，无法重建 ⇒ 如实留空，证据根对它们继续走保守规则。
   */
  @Column({ type: 'integer', nullable: true, name: 'audit_row_id' })
  auditRowId?: number | null;

  /**
   * REV-7（消费者②）：**这次执行依据的那次授权**（确认 / 审批 token）。
   *
   * 窗口（`ai_confirmation_requests.expires_at`）住在确认行上，而占位行与确认行此前**没有直接引用**
   * ——「给定一条副作用，它在不在窗口内」因此答不出来。`run_id` 只覆盖 run 成员；单条确认的那张 token
   * 此前**没有任何地方记它**。`null` = 没有授权参与（受信任作用域内的自动写），这本身就是答案：
   * 没有审批，也就没有窗口。
   */
  @Column({ type: 'varchar', length: 64, nullable: true, name: 'authorization_ref' })
  authorizationRef?: string | null;

  /**
   * AW-15: the role the decision was made with, read from the user row at claim time.
   *
   * The claim row could say **what** was authorized (`authorization_ref`) and **when** (`claimed_at`),
   * but not **under which grant** — so after a role was revoked, the row could not answer "which role
   * let this through". This column freezes that reading at decision time. `null` = not recorded (a row
   * written before this column existed, or an identity with no role row such as the system account);
   * readers report it as `unknown` and never backfill a guess.
   *
   * AW-15：当次判定所用的角色，在占位时从用户行读一次。
   *
   * 占位行此前能说**授权是什么**（`authorization_ref`）与**何时**（`claimed_at`），却说不出
   * **依据哪一份授予** —— 于是撤权之后，行上答不了「当时按什么角色放行」。本列把那一刻的读数冻结下来。
   * `null` = 没记下（本列之前的行，或系统账号这类没有角色行的身份）；读侧如实报 `unknown`，绝不回填猜测。
   */
  @Column({ type: 'varchar', length: 32, nullable: true, name: 'decided_role' })
  decidedRole?: string | null;

  /**
   * AW-15: the effective governance policy revision at decision time (the content fingerprint from
   * `policyRevisionOf`, the same source the authorization snapshot records).
   *
   * `null` means "not recorded", not "no policy": a row written before this column existed cannot be
   * reconstructed, and a deployment with no policy service cannot resolve it. Readers say `unknown`.
   *
   * AW-15：当次判定所用的治理策略 revision（`policyRevisionOf` 的内容指纹，与授权快照同一来源）。
   *
   * `null` 的含义是「没记下」，**不是**「没有策略」：本列之前的行无法重建，缺策略服务的部署也解析不出来。
   * 读侧报 `unknown`。
   */
  @Column({ type: 'varchar', length: 64, nullable: true, name: 'policy_revision' })
  policyRevision?: string | null;
}
