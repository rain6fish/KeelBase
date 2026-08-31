import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
} from 'typeorm';

/**
 * 通用操作审计：记录用户增删改查等写操作（who/when/what）。
 * 由全局 OperationAuditInterceptor 自动写入。
 */
@Entity('operation_audit_logs')
@Index(['userId', 'createdAt'])
export class OperationAuditLog {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int', name: 'user_id', nullable: true })
  userId?: number | null;

  @Column({ length: 32 })
  action!: string;

  @Column({ length: 8 })
  method!: string;

  @Column({ length: 255 })
  path!: string;

  @Column({ type: 'varchar', length: 64, nullable: true, name: 'feature_key' })
  featureKey?: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true, name: 'feature_fallback' })
  featureFallback?: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true, name: 'target_id' })
  targetId?: string | null;

  @Column({ type: 'text', nullable: true, name: 'request_body' })
  requestBody?: string | null;

  /** A-1 字段级变更留痕（before/after diff）：JSON 数组 [{ field, before, after }]——「改了什么字段、从什么到什么」 */
  @Column({ type: 'text', nullable: true })
  changes?: string | null;

  /** A-1 业务事件归一化（如 CustomerUpdated / FollowupTaskCreated）——跨系统统一业务语言 */
  @Column({ type: 'varchar', length: 64, nullable: true, name: 'business_event' })
  businessEvent?: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ip?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'user_agent' })
  userAgent?: string | null;

  @Column({ type: 'int', nullable: true, name: 'status_code' })
  statusCode?: number | null;

  /** HS-11 审计哈希链：前一条记录的 hash（首条为 null） */
  @Column({ type: 'varchar', length: 64, nullable: true, name: 'prev_hash' })
  prevHash?: string | null;

  /** HS-11 审计哈希链：本条内容 HMAC（防篡改可验证） */
  @Column({ type: 'varchar', length: 64, nullable: true, name: 'hash' })
  hash?: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}
