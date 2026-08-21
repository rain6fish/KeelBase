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
