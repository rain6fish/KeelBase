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
import { PmProject } from './pm-project.entity';

/** AI Project Management：项目风险记录 */
@Entity('pm_risks')
@Index(['projectId'])
export class PmRisk {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'project_id' })
  projectId!: number;

  @ManyToOne(() => PmProject, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project?: PmProject;

  @Column({ length: 16, default: 'medium' })
  level!: string;

  @Column({ type: 'text' })
  reason!: string;

  @Column({ type: Date })
  detectedAt!: Date;

  @Column({ type: Date, nullable: true })
  resolvedAt?: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
