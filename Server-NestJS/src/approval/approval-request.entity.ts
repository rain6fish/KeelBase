// SPDX-License-Identifier: Apache-2.0

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';

/** 审批类型 */
export const REQUEST_TYPES = ['reimbursement', 'purchase', 'leave', 'contract'] as const;
export type RequestType = (typeof REQUEST_TYPES)[number];

/** 审批状态 */
export const REQUEST_STATUSES = [
  'pending',
  'needs_review',
  'approved',
  'rejected',
  'auto_approved',
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

/**
 * AI Approval 旗舰应用：审批请求主实体。
 * 流程：提交(pending) → AI 预审(review_approval_request) →
 *   低风险自动通过(auto_approved) 或 转人工复核(needs_review) → 人工决定(approved/rejected) → 审计。
 */
@Entity('app_requests')
@Index(['requesterId'])
@Index(['status'])
export class ApprovalRequest {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ length: 200 })
  title!: string;

  @Column({ length: 32, default: 'general' })
  type!: string;

  @Column({ type: 'float', default: 0 })
  amount!: number;

  @Column({ type: 'text' })
  reason!: string;

  @Column({ length: 16, default: 'pending' })
  status!: string;

  @Column({ length: 16, default: 'low' })
  riskLevel!: string;

  @Column({ type: 'text', nullable: true })
  aiRecommendation?: string | null;

  @Column({ nullable: true, name: 'requester_id' })
  requesterId?: number;

  @Column({ type: 'int', nullable: true, name: 'reviewer_id' })
  reviewerId?: number | null;

  @Column({ type: Date, nullable: true })
  decidedAt?: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  /** RG-3 软删除 */
  @DeleteDateColumn({ type: Date, name: 'deleted_at' })
  deletedAt?: Date | null;
}
