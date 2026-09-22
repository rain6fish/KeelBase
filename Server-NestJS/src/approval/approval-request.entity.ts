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
 * 审批风险等级（阶段 4 M4：本域风险词汇的单一来源）。
 *
 * **三值，且不是 CRM 客户风险词汇的子集**：CRM 的 `RISK_LEVELS`（low/medium/high/**critical**）描述
 * 「这个客户有多危险」，本词汇描述「这笔申请超阈值多少」——`critical` 的有无是**语义差异而非遗漏**。
 * 故两者**不共用常量**：共用会把两个概念焊死，日后任一边调整都要惊动另一边。
 * 单一来源只在**本域内**：预审打分的两处赋值由此受检（写错等级名会在编译期暴露）。
 */
export const APPROVAL_RISK_LEVELS = ['low', 'medium', 'high'] as const;
export type ApprovalRiskLevel = (typeof APPROVAL_RISK_LEVELS)[number];

/**
 * AI Approval 旗舰应用：审批请求主实体。
 * 流程：提交(pending) → AI 预审(review_approval_request) →
 *   低风险自动通过(auto_approved) 或 转人工复核(needs_review) → 人工决定(approved/rejected) → 审计。
 */
@Entity('app_requests')
@Index(['requesterId'])
@Index(['status'])
@Index('IDX_scope_app_requests_org_dept', ['orgId', 'deptId'])
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

  /** 权限-2 数据范围：所属组织/部门（null = 仅 owner 可见；写入时盖章） */
  @Column({ type: 'int', nullable: true, name: 'org_id' })
  orgId?: number | null;

  @Column({ type: 'int', nullable: true, name: 'dept_id' })
  deptId?: number | null;

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
