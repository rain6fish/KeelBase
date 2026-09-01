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

/** AI Project Management：项目成员（owner/member） */
@Entity('pm_members')
@Index(['projectId'])
@Index(['userId'])
export class PmMember {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'project_id' })
  projectId!: number;

  @ManyToOne(() => PmProject, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project?: PmProject;

  @Column({ name: 'user_id' })
  userId!: number;

  @Column({ length: 16, default: 'member' })
  role!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
