// SPDX-License-Identifier: Apache-2.0

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

// Default for new rows, typed by the table above: removing that value stops compiling.
// 新建行的默认值，由上面的词表定型 —— 从表里删掉该值就编译不过。
const DEFAULT_STATUS: OrderStatus = 'pending';

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

  @Column({ length: 16, default: DEFAULT_STATUS })
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
