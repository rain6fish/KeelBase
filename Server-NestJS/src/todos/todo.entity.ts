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

@Entity('todos')
@Index(['userId', 'completed'])
export class Todo {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ length: 200 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ default: false })
  completed!: boolean;

  @Column({ type: Date, nullable: true, name: 'due_date' })
  dueDate?: Date | null;

  @Column({ nullable: true, name: 'user_id' })
  userId?: number;

  /** ORG-3 二期组织级数据隔离：所属组织 id（null=仅本人可见） */
  @Column({ type: 'int', nullable: true, name: 'org_id' })
  orgId?: number | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  /** RG-3 软删除：删除后仍保留行，管理台回收站可恢复 */
  @DeleteDateColumn({ type: Date, name: 'deleted_at' })
  deletedAt?: Date | null;
}
