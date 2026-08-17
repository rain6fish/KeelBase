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
import { PmProject } from './pm-project.entity';

/** 里程碑状态 */
export const MILESTONE_STATUSES = ['pending', 'in_progress', 'completed'] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];

/** AI Project Management：项目里程碑（延期驱动风险分析） */
@Entity('pm_milestones')
@Index(['projectId'])
export class PmMilestone {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'project_id' })
  projectId!: number;

  @ManyToOne(() => PmProject, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project?: PmProject;

  @Column({ length: 200 })
  title!: string;

  @Column({ type: Date, nullable: true })
  dueDate?: Date | null;

  @Column({ length: 16, default: 'pending' })
  status!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
