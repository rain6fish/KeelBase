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

  @CreateDateColumn()
  createdAt!: Date;
}
