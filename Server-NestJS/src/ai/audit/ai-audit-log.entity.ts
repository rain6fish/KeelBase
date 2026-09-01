// SPDX-License-Identifier: Apache-2.0

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('ai_audit_logs')
@Index(['userId', 'createdAt'])
@Index(['conversationId'])
export class AiAuditLog {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'user_id' })
  userId!: string;

  @Column({ name: 'conversation_id', nullable: true })
  conversationId?: string;

  /** D2-1c username 快照：独立治理库后审计查询不依赖业务 users 表（写审计时快照，查询读本列） */
  @Column({ length: 64, nullable: true, name: 'username' })
  username?: string;

  @Column({ length: 32 })
  action!: string; // chat | tool_call | navigate | error | login

  @Column({ type: 'text', nullable: true })
  detail?: string;

  @Column({ type: 'text', nullable: true, name: 'model' })
  model?: string;

  @Column({ length: 64, nullable: true, name: 'provider' })
  provider?: string;

  /** W4-⑤ Agent Identity 最小切片：调用方 agent 标识（headless key id / 子 agent）；不参与哈希链 payload（避免破坏历史链） */
  @Column({ nullable: true, name: 'agent_id' })
  agentId?: string;

  /** W4-⑤ 会话标识（access token 暂无 jti，接入前可空） */
  @Column({ nullable: true, name: 'session_id' })
  sessionId?: string;

  /** D4 Agent Delegation Chain（多 Agent 归责最小必需，增量非 Envelope）：父动作 id / 上层 agent / 委托上下文 / 业务意图 / 来源通道。均不参与哈希链 payload（同 agent_id/session_id，防破坏历史链） */
  @Column({ length: 64, nullable: true, name: 'parent_action_id' })
  parentActionId?: string;

  @Column({ length: 64, nullable: true, name: 'caller_agent_id' })
  callerAgentId?: string;

  @Column({ length: 512, nullable: true, name: 'delegation_context' })
  delegationContext?: string;

  @Column({ length: 255, nullable: true, name: 'business_intent' })
  businessIntent?: string;

  @Column({ length: 32, nullable: true, name: 'source' })
  source?: string;

  @Column({ nullable: true, name: 'prompt_tokens' })
  promptTokens?: number;

  @Column({ nullable: true, name: 'completion_tokens' })
  completionTokens?: number;

  @Column({ nullable: true, name: 'duration_ms' })
  durationMs?: number;

  @Column({ default: false, name: 'is_error' })
  isError!: boolean;

  @Column({ type: 'text', nullable: true, name: 'error_message' })
  errorMessage?: string;

  /** W5-⑦ Explainable Authz 落库：工具被拒时 AuthorizationDeniedError.reasons 的 JSON（checks[]），供轨迹/审计展示「为何阻止」 */
  @Column({ type: 'text', nullable: true, name: 'authorization' })
  authorization?: string;

  /** §22.16 A-1 业务行为取证：业务事件名（CustomerRiskAssessed/FollowupTaskCreated 等跨系统归一）；不入哈希链 payload（同 agent_id，防破坏历史链） */
  @Column({ length: 64, nullable: true, name: 'business_event' })
  businessEvent?: string;

  /** §22.16 A-1 Decision Evidence（JSON：{decision, evidence[], policy, confidence}）；不入哈希链 payload（推理型展示数据，同 feedback 前例） */
  @Column({ type: 'text', nullable: true, name: 'evidence' })
  evidence?: string;

  /** AI-18 对话反馈：thumbs_up | thumbs_down（用户赞/踩后记录） */
  @Column({ length: 16, nullable: true })
  feedback?: string;

  /** AI-18 反馈原因标注（可选） */
  @Column({ type: 'text', nullable: true, name: 'feedback_note' })
  feedbackNote?: string;

  /** HS-11 审计哈希链：前一条记录的 hash（首条为 null） */
  @Column({ type: 'varchar', length: 64, nullable: true, name: 'prev_hash' })
  prevHash?: string | null;

  /** HS-11 审计哈希链：本条内容 HMAC（防篡改可验证） */
  @Column({ type: 'varchar', length: 64, nullable: true, name: 'hash' })
  hash?: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}
