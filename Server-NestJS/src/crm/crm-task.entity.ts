import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { CrmCustomer } from './crm-customer.entity';

/** 任务状态 */
export const CRM_TASK_STATUSES = ['pending', 'in_progress', 'completed', 'cancelled'] as const;
export type CrmTaskStatus = (typeof CRM_TASK_STATUSES)[number];

/** AI CRM：跟进任务（AI 写工具 create_followup_task 的目标，可撤销） */
@Entity('crm_tasks')
@Index(['customerId'])
@Index(['userId'])
export class CrmTask {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'customer_id', nullable: true })
  customerId?: number | null;

  @ManyToOne(() => CrmCustomer, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'customer_id' })
  customer?: CrmCustomer;

  @Column({ length: 200 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ type: Date, nullable: true })
  dueDate?: Date | null;

  @Column({ length: 16, default: 'pending' })
  status!: string;

  @Column({ nullable: true, name: 'user_id' })
  userId?: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  /** RG-3 软删除：AI 副作用撤销时软删，管理台回收站可恢复 */
  @DeleteDateColumn({ type: Date, name: 'deleted_at' })
  deletedAt?: Date | null;
}
