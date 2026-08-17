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

/** 订单状态 */
export const ORDER_STATUSES = ['pending', 'paid', 'cancelled', 'overdue'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** AI CRM：客户订单（金额/状态/逾期驱动风险分析） */
@Entity('crm_orders')
@Index(['customerId'])
@Index(['userId'])
export class CrmOrder {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'customer_id' })
  customerId!: number;

  @ManyToOne(() => CrmCustomer, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customer_id' })
  customer?: CrmCustomer;

  @Column({ type: 'float', default: 0 })
  amount!: number;

  @Column({ length: 16, default: 'pending' })
  status!: string;

  @Column({ type: Date, nullable: true })
  orderDate?: Date | null;

  @Column({ type: Date, nullable: true })
  dueDate?: Date | null;

  @Column({ nullable: true, name: 'user_id' })
  userId?: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
