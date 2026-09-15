// SPDX-License-Identifier: Apache-2.0

import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Role } from './role.entity';
import { Permission } from './permission.entity';

/**
 * 角色 → 能力点授予（权限-2 Step 2）。
 *
 * `owner_field` 决定 CASL 的行级条件（如 `userId` / `requesterId` / `id`）；`null` = 无行级条件（仅 `all` 用）。
 * `stringify_owner` 标记条件值需转字符串（AiConversation / UserMemory 的 userId 是 UUID 字符串）。
 * `data_scope` 为**按主体覆盖**的角色默认范围；`null` = 用 `roles.data_scope`。
 */
@Entity('role_permissions')
@Unique(['roleId', 'permissionId'])
@Index(['roleId'])
export class RolePermission {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'role_id' })
  roleId!: number;

  @ManyToOne(() => Role, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'role_id' })
  role?: Role;

  @Column({ name: 'permission_id' })
  permissionId!: number;

  @ManyToOne(() => Permission, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'permission_id' })
  permission?: Permission;

  @Column({ type: 'varchar', length: 32, name: 'owner_field', nullable: true })
  ownerField?: string | null;

  @Column({ default: false, name: 'stringify_owner' })
  stringifyOwner!: boolean;

  @Column({ type: 'varchar', length: 24, name: 'data_scope', nullable: true })
  dataScope?: string | null;
}
