// SPDX-License-Identifier: Apache-2.0

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { PmProject } from './pm-project.entity';

/** 项目任务状态 */
export const PM_TASK_STATUSES = ['pending', 'in_progress', 'completed', 'cancelled'] as const;
export type PmTaskStatus = (typeof PM_TASK_STATUSES)[number];

/** AI Project Management：项目任务（AI 写工具 create_project_task 的目标，可撤销） */
@Entity('pm_tasks')
@Index(['projectId'])
@Index(['userId'])
export class PmTask {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'project_id' })
  projectId!: number;

  @ManyToOne(() => PmProject, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project?: PmProject;

  @Column({ length: 200 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ type: Date, nullable: true })
  dueDate?: Date | null;

  @Column({ length: 16, default: 'pending' })
  status!: string;

  @Column({ type: 'int', nullable: true, name: 'assignee_id' })
  assigneeId?: number | null;

  @Column({ nullable: true, name: 'user_id' })
  userId?: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  /** RG-3 软删除：AI 副作用撤销时软删 */
  @DeleteDateColumn({ type: Date, name: 'deleted_at' })
  deletedAt?: Date | null;
}
