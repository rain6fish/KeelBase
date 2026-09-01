// SPDX-License-Identifier: Apache-2.0

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * AI Approval 旗舰应用：审批政策。
 * AI 预审按 type 匹配政策：amount <= maxAmount → 低风险自动通过；否则转人工复核。
 */
@Entity('app_policies')
@Index(['type'])
export class ApprovalPolicy {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ length: 200 })
  title!: string;

  @Column({ length: 32, default: 'general' })
  type!: string;

  @Column({ type: 'float', default: 1000 })
  maxAmount!: number;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ default: true })
  active!: boolean;

  @Column({ nullable: true, name: 'user_id' })
  userId?: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
