import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';

/** 客户状态 */
export const CUSTOMER_STATUSES = ['lead', 'active', 'churn_risk', 'inactive'] as const;
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];

/** 风险等级 */
export const RISK_LEVELS = ['low', 'medium', 'high', 'critical'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

/**
 * AI CRM 旗舰应用：客户主实体。
 * owner 归属（userId）+ 软删除（RG-3），AI 工具按 userId 限定数据范围。
 */
@Entity('crm_customers')
@Index(['userId'])
@Index(['status'])
export class CrmCustomer {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ length: 100 })
  name!: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  email?: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  phone?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  company?: string | null;

  @Column({ length: 32, default: 'lead' })
  status!: string;

  @Column({ length: 16, default: 'low' })
  riskLevel!: string;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  @Column({ nullable: true, name: 'user_id' })
  userId?: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  /** RG-3 软删除：删除后仍保留行，管理台回收站可恢复 */
  @DeleteDateColumn({ type: Date, name: 'deleted_at' })
  deletedAt?: Date | null;
}
