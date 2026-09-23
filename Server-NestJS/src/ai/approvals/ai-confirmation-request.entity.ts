// SPDX-License-Identifier: Apache-2.0

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * R4 双人审批（W5 Risk-based Tool Contract）：高影响动作需第二人（approver）审批。
 * 与 R3 的「本人即时确认」（ConfirmationStore 内存）不同——R4 走持久化审批请求，
 * approver（管理端）稍后 approve/decline，approve 后服务端以 operator 维度执行工具。
 * 仅 R4 工具（当前 review_approval_request）进入本表。
 */
@Entity('ai_confirmation_requests')
@Index(['status', 'createdAt'])
export class AiConfirmationRequest {
  @PrimaryGeneratedColumn()
  id!: number;

  /** 审批请求标识（前端 approve-by 用） */
  @Column({ length: 64, unique: true })
  token!: string;

  @Column({ length: 64, name: 'tool_name' })
  toolName!: string;

  /** 工具参数 JSON 字符串 */
  @Column({ type: 'text' })
  args!: string;

  /** 发起操作的用户（operator）——approve 后以该用户维度执行工具 */
  @Column({ name: 'operator_id' })
  operatorId!: string;

  /** 触发对话（审计 tool_call 关联轨迹用） */
  @Column({ nullable: true, name: 'conversation_id' })
  conversationId?: string;

  /** 风险等级（当前恒 R4） */
  @Column({ length: 4, name: 'risk_level' })
  riskLevel!: string;

  /** pending | approved | declined | timeout（D2-1e：R3 确认超时也落库） */
  @Column({ length: 16, default: 'pending' })
  status!: string;

  /**
   * KB-5 run-level approval（docs/run-level-approval.spec.md）：记录形态判别。
   * 'single'（默认）= 单动作确认（R3 即时 / R4 审批）；'run' = 一次授权整批（run token = 单行，items 快照在 run_items）。
   * nullable: 迁移 1816000000000 以可空列 ADD（无 NOT NULL），实体对齐之（应用始终写值 + DB 默认 'single'）；
   * 修 migration-consistency 漂移（曾实体 NOT NULL ↔ 迁移可空）。
   */
  @Column({ length: 16, default: 'single', nullable: true })
  kind?: string;

  /**
   * KB-5 run：批内动作快照 JSON（RunItem[] = {toolName, args, summary, riskLevel}）。
   * single 行为 null；run 行 tool_name='run'、args='[]' 占位（NOT NULL 约束）、risk_level 复用为 runRisk。
   */
  @Column({ type: 'text', nullable: true, name: 'run_items' })
  runItems?: string | null;

  /** 审批人（approver）——决策后记录 */
  @Column({ nullable: true, name: 'approver_id' })
  approverId?: string;

  // 按方言分支：postgres 用 timestamp，sqlite（dev/test better-sqlite3）用 datetime；单一类型会被另一方拒绝（DataTypeNotSupportedError）
  @Column({ type: process.env.DB_TYPE === 'postgres' ? 'timestamp' : 'datetime', nullable: true, name: 'decided_at' })
  decidedAt?: Date | null;

  /**
   * Execution axis (P2) — deliberately **separate from `status`**: the decision axis already
   * guarantees "at most one decision" via a conditional update; this axis records whether the
   * approved write actually ran, so an approval interrupted mid-execution is visible and retryable.
   * All three are annotation-only columns: they enter no hash-chain payload, so existing chains and
   * rows are untouched.
   *
   * 执行轴（P2）—— 与 `status` **有意分离**：决策轴已用条件更新保证「至多一次裁决」，
   * 这一轴记录「批准的那次写到底跑没跑成」，使执行中断的审批可见、可重试。
   * 三列均为链外注解列：不入任何哈希链 payload，故既有链与既有行不受影响。
   */
  @Column({
    type: process.env.DB_TYPE === 'postgres' ? 'timestamp' : 'datetime',
    nullable: true,
    name: 'execution_claimed_at',
  })
  executionClaimedAt?: Date | null;

  @Column({
    type: process.env.DB_TYPE === 'postgres' ? 'timestamp' : 'datetime',
    nullable: true,
    name: 'executed_at',
  })
  executedAt?: Date | null;

  /** 崩溃/挂起时不写（我们并不知道结果）—— 此时 claimed 有值而本列为空，对外即 failed 且无原因可报 */
  @Column({ type: 'text', nullable: true, name: 'execution_error' })
  executionError?: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
