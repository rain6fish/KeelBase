import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { CrmCustomer } from './crm-customer.entity';

/** 跟进类型 */
export const ACTIVITY_TYPES = ['call', 'meeting', 'email', 'note'] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

/** AI CRM：客户跟进记录（AI 分析客户活跃度的数据来源） */
@Entity('crm_activities')
@Index(['customerId'])
@Index(['userId'])
export class CrmActivity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'customer_id' })
  customerId!: number;

  @ManyToOne(() => CrmCustomer, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customer_id' })
  customer?: CrmCustomer;

  @Column({ length: 16, default: 'note' })
  type!: string;

  @Column({ type: 'text' })
  summary!: string;

  @Column({ type: Date })
  happenedAt!: Date;

  @Column({ nullable: true, name: 'user_id' })
  userId?: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
