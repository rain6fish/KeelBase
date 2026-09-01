// SPDX-License-Identifier: Apache-2.0

import { Entity, PrimaryGeneratedColumn, Column, Index, Unique } from 'typeorm';

/**
 * A2：AI 每日用量计数（独立于 ai_audit_logs 审计粒度）。
 * HS-9 审计粒度 'off'/'write' 只影响审计日志，不影响 RG-2.1 每日限额计数。
 * 每用户每天一行，成功对话/工具调用完成后自增。
 */
@Entity('ai_daily_usage')
@Unique(['userId', 'usageDate'])
@Index(['userId', 'usageDate'])
export class AiDailyUsage {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'user_id' })
  userId!: string;

  /** YYYY-MM-DD（本地服务时区日界；与限额「今日」口径一致） */
  @Column({ length: 10, name: 'usage_date' })
  usageDate!: string;

  @Column({ default: 0 })
  count!: number;
}
