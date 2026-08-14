import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

/**
 * HS-3 AI 写操作副作用记录：每次 AI 写工具（create_event/create_todo）成功执行后落一条。
 * - idempotencyKey 唯一 → 同会话同参数重复调用返回已有结果（幂等），防 LLM 重试/并发重复创建
 * - resultType + resultId → 管理台可定位并软删对应记录（AI 副作用可撤销，衔接 RG-3 回收站）
 */
@Entity('ai_tool_side_effects')
export class AiToolSideEffect {
  @PrimaryGeneratedColumn()
  id!: number;

  /** 幂等键：sha256(userId:conversationId:toolName:argsHash)，唯一 */
  @Column({ length: 64, unique: true, name: 'idempotency_key' })
  idempotencyKey!: string;

  @Column({ name: 'user_id' })
  userId!: string;

  @Column({ name: 'conversation_id', nullable: true })
  conversationId?: string;

  @Column({ length: 64, name: 'tool_name' })
  toolName!: string;

  /** 参数 hash（用于展示与追溯） */
  @Column({ length: 64, name: 'args_hash' })
  argsHash!: string;

  /** 副作用类型：event | todo */
  @Column({ length: 16, name: 'result_type' })
  resultType!: 'event' | 'todo';

  /** 副作用目标记录 id（events/todos 主键） */
  @Column({ name: 'result_id' })
  resultId!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
