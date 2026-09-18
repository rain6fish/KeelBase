// SPDX-License-Identifier: Apache-2.0

import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/**
 * BA 异常行为基线的**告警事件**（docs/ai-behavior-baseline.spec.md）。
 *
 * 存在的理由就是「可追溯」：运维页那套 `_deriveAlerts` 是每次请求现算、不落库的，
 * 事后答不了「那时是否告警过、依据是什么」。本表把判定**落成事实**——包括可复算的 `evidence_json`。
 *
 * 只观测不阻断：本表的写入**不**参与任何门控决策（规格 §1 非目标）。
 */
@Entity('ai_behavior_alerts')
// 列表按状态 + 时间倒序（管理台默认视图）
@Index(['status', 'createdAt'])
// 去重查询：同规则 × 同主体 × 冷却期（规格 §5）
@Index(['rule', 'subjectKind', 'subjectId', 'createdAt'])
export class AiBehaviorAlert {
  @PrimaryGeneratedColumn()
  id!: number;

  /** 触发规则（与规格 §2 同一 ID）：R-1 / R-2 / R-3 */
  @Column({ length: 8 })
  rule!: string;

  /** warning | critical —— 由超出阈值的倍数决定（< 2× warning，≥ 2× critical） */
  @Column({ length: 16 })
  level!: string;

  /** 被观测主体：conversation（R-1/R-3）| user（R-2） */
  @Column({ length: 16, name: 'subject_kind' })
  subjectKind!: string;

  @Column({ length: 64, name: 'subject_id' })
  subjectId!: string;

  /** R-1/R-3 恒等于 subjectId；R-2 命中时可归属会话则记之 */
  @Column({ nullable: true, name: 'conversation_id' })
  conversationId?: string;

  @Column({ length: 128 })
  title!: string;

  @Column({ type: 'text' })
  detail!: string;

  /** 判定依据 JSON（count/threshold/windowMinutes/sampleRowIds/toolName）——告警必须能被人自己复算 */
  @Column({ type: 'text', name: 'evidence_json' })
  evidenceJson!: string;

  /** open | acknowledged（人工标记；本能力不自动处置） */
  @Column({ length: 16, default: 'open' })
  status!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  // 按方言分支：postgres 用 timestamp，sqlite（dev/test）用 datetime；单一类型会被另一方拒绝
  @Column({ type: process.env.DB_TYPE === 'postgres' ? 'timestamp' : 'datetime', nullable: true, name: 'decided_at' })
  decidedAt?: Date | null;
}
