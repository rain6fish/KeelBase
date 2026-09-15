// SPDX-License-Identifier: Apache-2.0

import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Role } from './role.entity';

/**
 * 用户 → 角色分配（权限-2 Step 2）。
 *
 * 类名刻意不叫 `UserRole`——那是 `user.entity.ts` 里的**枚举**（代码侧判定事实来源），
 * 本实体是它的**表侧分配**。迁移按 `users.role` 回填，保证与枚举一致。
 */
@Entity('user_roles')
@Unique(['userId', 'roleId'])
@Index(['userId'])
export class UserRoleAssignment {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'user_id' })
  userId!: number;

  @Column({ name: 'role_id' })
  roleId!: number;

  @ManyToOne(() => Role, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'role_id' })
  role?: Role;

  @CreateDateColumn()
  createdAt!: Date;
}
