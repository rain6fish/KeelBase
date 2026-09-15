// SPDX-License-Identifier: Apache-2.0

import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * 角色（权限-2 Step 2）。
 *
 * `code` 是 `UserRole` 枚举的**镜像**（'admin'/'user'）——枚举仍是代码侧判定的事实来源
 * （last-admin 守卫、AI adminOnly 等十余处），本表提供**可配置**的元数据（数据范围等）。
 * 将来新增角色 = 加一行，不是加枚举分支。
 */
@Entity('roles')
export class Role {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ length: 32, unique: true })
  code!: string;

  @Column({ length: 64 })
  name!: string;

  /**
   * 角色的**默认数据范围级别**：`all` | `org` | `own_dept_and_below` | `own_dept` | `own` | `custom_dept`。
   * 具体某个主体的范围可在 `role_permissions.data_scope` 上覆盖。
   */
  @Column({ type: 'varchar', length: 24, name: 'data_scope', default: 'own' })
  dataScope!: string;

  /** `data_scope = custom_dept` 时的自定义部门集 */
  @Column({ type: 'simple-json', nullable: true, name: 'custom_dept_ids' })
  customDeptIds?: number[] | null;

  /** 系统内置角色（迁移种子；不随业务数据删除） */
  @Column({ default: false, name: 'is_system' })
  isSystem!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
