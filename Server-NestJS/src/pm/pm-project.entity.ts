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

/** 项目状态 */
export const PROJECT_STATUSES = ['planned', 'active', 'on_hold', 'completed'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/**
 * AI Project Management 旗舰应用：项目主实体。
 * owner 归属（userId）+ 软删除（RG-3），AI 工具按 userId 限定数据范围。
 */
@Entity('pm_projects')
@Index(['userId'])
@Index(['status'])
export class PmProject {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ length: 200 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ length: 16, default: 'planned' })
  status!: string;

  @Column({ length: 16, default: 'low' })
  riskLevel!: string;

  @Column({ type: Date, nullable: true })
  startDate?: Date | null;

  @Column({ type: Date, nullable: true })
  endDate?: Date | null;

  @Column({ nullable: true, name: 'user_id' })
  userId?: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  /** RG-3 软删除 */
  @DeleteDateColumn({ type: Date, name: 'deleted_at' })
  deletedAt?: Date | null;
}
