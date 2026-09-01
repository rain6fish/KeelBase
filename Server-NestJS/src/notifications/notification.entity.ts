// SPDX-License-Identifier: Apache-2.0

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('notifications')
@Index(['userId', 'createdAt'])
export class Notification {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'user_id' })
  userId!: number;

  @Column({ length: 200 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  body?: string;

  @Column({ length: 32, default: 'system' })
  type!: string;

  @Column({ type: 'varchar', length: 32, nullable: true, name: 'target_type' })
  targetType?: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true, name: 'target_id' })
  targetId?: string | null;

  @Column({ default: false, name: 'is_read' })
  isRead!: boolean;

  @Column({ length: 255, nullable: true })
  link?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
