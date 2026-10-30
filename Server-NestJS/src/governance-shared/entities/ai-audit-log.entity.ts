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

  /** AU-2（§22.19 归因层）：客户端来源 IP（真实 IP 由 trust proxy 解析）。链外列——**不入 hash payload**（护栏③） */
  @Column({ length: 45, nullable: true, name: 'ip' })
  ip?: string;

  /**
   * AU-3（§22.19 归因层）：访客标识（匿名，与账号无关）——演示端访客共享 alex 时用它区分 N 个访客。
   * 由 main.ts 全局中间件签发/读取 cookie。链外列——**不入 hash payload**（护栏③）。
   * 必须显式 `type`：`string | null` 联合类型经 TS 反射为 `Object`，TypeORM 会抛 DataTypeNotSupportedError。
   */
  @Column({ type: 'varchar', length: 64, nullable: true, name: 'guest_id' })
  guestId?: string | null;

  /**
   * AU-2 余项（§22.19 归因层）：客户端设备标识（请求头 `X-Device-Id`，由客户端生成并持久化）。
   * 与 `ip` 互补 —— **NAT / 移动运营商之后多个客户端共用一个地址**，设备标识用来分辨同一地址之后的
   * 不同客户端。**由客户端提供 ⇒ 归因线索而非身份凭证**（与 `guestId` 同一性质）。
   * 链外列——**不入 hash payload**（护栏③）。
   */
  @Column({ type: 'varchar', length: 64, nullable: true, name: 'device_id' })
  deviceId?: string | null;

  /**
   * C-3: what this proposal came to, as a frozen vocabulary rather than as prose. `tool_call` rows
   * answer executed / pending / blocked / refused / declined / failed; `tool_confirmation` rows answer
   * approved / declined / pending / timeout; `effect_revoke` rows answer revoked. `blocked` (the risk
   * policy, which never reaches a decision) and `refused` (the governance or authorization gate) are
   * two different gates and are never collapsed into one. Off-chain column — **not part of the hash
   * payload**.
   *
   * C-3：这一次提议的**结局** —— 用冻结词表说，而不是用散文说。`tool_call` 行答 executed / pending /
   * blocked / refused / declined / failed；`tool_confirmation` 行答 approved / declined / pending /
   * timeout；`effect_revoke` 行答 revoked。`blocked`（风险策略，压根没到裁决）与 `refused`（治理 /
   * 授权那道闸）是**两道不同的闸**，永不合并。链外列 —— **不入 hash payload**。
   */
  @Column({ type: 'varchar', length: 32, nullable: true, name: 'outcome' })
  outcome?: string | null;

  /**
   * C-3: the tool this row is about, by the producer's own registered name. Null when the row is not
   * about one tool — a non-tool row, or a run-level decision that covers several. Off-chain column —
   * **not part of the hash payload**.
   *
   * C-3：本行所属的**工具名**，取产出方自己的注册名。**不是关于某一个工具的行**为 null —— 非工具行，
   * 或一次覆盖多个工具的 run 级裁决。链外列 —— **不入 hash payload**。
   */
  @Column({ type: 'varchar', length: 64, nullable: true, name: 'tool' })
  tool?: string | null;

  /**
   * AW-11: the write claim this row triggered, so a reader can walk **forward** from the most
   * authoritative row type — audit → claim → effect / confirmation — instead of only backwards.
   * Written in the same transaction as the claim's `audit_row_id` (see `WriteClaimStore.attachAuditRow`),
   * and only on a successful execution. `null` is an honest state: rows written before this column
   * existed, and rows that never had a claim (denied / pending / read-only), stay unlinked — no
   * guessing by tool name plus time. Off-chain annotation column — **not part of the hash payload**.
   *
   * AW-11：本行触发的那条占位行，使读者能从最权威的行类型**正向**走 —— 审计 → 占位 → 副作用 / 确认 ——
   * 而不只是反着走。与占位行的 `audit_row_id` 在**同一事务**写入（见 `WriteClaimStore.attachAuditRow`），
   * 且只在执行成功时写。`null` 是**如实**状态：本列之前写下的行，以及从来没有占位行的行
   * （拒绝 / 待批 / 只读），都保持不链 —— 不按工具名加时间猜。链外注解列 —— **不入 hash payload**。
   */
  @Column({ type: 'integer', nullable: true, name: 'write_claim_id' })
  writeClaimId?: number | null;

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

  /** §internal.16 A-1 业务行为取证：业务事件名（CustomerRiskAssessed/FollowupTaskCreated 等跨系统归一）；不入哈希链 payload（同 agent_id，防破坏历史链） */
  @Column({ length: 64, nullable: true, name: 'business_event' })
  businessEvent?: string;

  /** §internal.16 A-1 Decision Evidence（JSON：{decision, evidence[], policy, confidence}）；不入哈希链 payload（推理型展示数据，同 feedback 前例） */
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

  /** G-2（§internal.17 ① G-2）：链 payload 版本——2 = 链外归责/业务注解列以真实值入 payload；null = 历史 v1（恒空），不破坏既有链 */
  @Column({ type: 'int', nullable: true, name: 'payload_version' })
  payloadVersion?: number | null;

  @CreateDateColumn()
  createdAt!: Date;
}
