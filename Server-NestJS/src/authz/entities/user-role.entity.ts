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
import { User } from '../../common/entities/user.entity';

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

  /** 用户硬删时级联清分配（与迁移 FK_ur_user 一致；缺此关系会导致实体↔迁移漂移） */
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @CreateDateColumn()
  createdAt!: Date;
}
