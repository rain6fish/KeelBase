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

/** AI CRM：客户风险记录（风险识别/复盘数据源） */
@Entity('crm_risks')
@Index(['customerId'])
@Index(['userId'])
export class CrmRisk {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'customer_id' })
  customerId!: number;

  @ManyToOne(() => CrmCustomer, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customer_id' })
  customer?: CrmCustomer;

  @Column({ length: 16, default: 'medium' })
  level!: string;

  @Column({ type: 'text' })
  reason!: string;

  @Column({ type: Date })
  detectedAt!: Date;

  @Column({ type: Date, nullable: true })
  resolvedAt?: Date | null;

  @Column({ nullable: true, name: 'user_id' })
  userId?: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
