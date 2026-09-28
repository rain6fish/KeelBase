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
 * **边界（本切片）**：只覆盖**本地实体写**。代理写 / 外部 MCP 写属「目标系统是否收到不可知」
 * 那一类，其失败政策待裁（roadmap §2.1.16 侦察结论 ②），本切片**不动**它们。
 */
@Entity('ai_write_claims')
@Index(['conversationId'])
export class AiWriteClaim {
  @PrimaryGeneratedColumn()
  id!: number;

  /** 与 `ai_tool_side_effects.idempotency_key` 同源同值 —— 唯一约束即仲裁点 */
  @Column({ length: 64, unique: true, name: 'idempotency_key' })
  idempotencyKey!: string;

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
}
