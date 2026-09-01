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

/** 销售机会阶段（销售漏斗） */
export const OPPORTUNITY_STAGES = ['qualification', 'proposal', 'negotiation', 'won', 'lost'] as const;
export type OpportunityStage = (typeof OPPORTUNITY_STAGES)[number];

/** AI CRM Customer 360：销售机会（金额/阶段/预期成交驱动 AI 销售分析） */
@Entity('crm_opportunities')
@Index(['customerId'])
@Index(['userId'])
export class CrmOpportunity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'customer_id' })
  customerId!: number;

  @ManyToOne(() => CrmCustomer, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customer_id' })
  customer?: CrmCustomer;

  @Column({ length: 120 })
  name!: string;

  @Column({ type: 'float', default: 0 })
  amount!: number;

  @Column({ length: 16, default: 'qualification' })
  stage!: string;

  /** 成交概率 0-100（stage 辅助） */
  @Column({ type: 'int', default: 0 })
  probability!: number;

  @Column({ type: Date, nullable: true, name: 'expected_close_date' })
  expectedCloseDate?: Date | null;

  @Column({ nullable: true, name: 'user_id' })
  userId?: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
