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

  /** pending | approved | declined */
  @Column({ length: 16, default: 'pending' })
  status!: string;

  /** 审批人（approver）——决策后记录 */
  @Column({ nullable: true, name: 'approver_id' })
  approverId?: string;

  // 按方言分支：postgres 用 timestamp，sqlite（dev/test better-sqlite3）用 datetime；单一类型会被另一方拒绝（DataTypeNotSupportedError）
  @Column({ type: process.env.DB_TYPE === 'postgres' ? 'timestamp' : 'datetime', nullable: true, name: 'decided_at' })
  decidedAt?: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
