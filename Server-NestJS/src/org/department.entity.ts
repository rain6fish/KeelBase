// SPDX-License-Identifier: Apache-2.0

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { Organization } from './organization.entity';

@Entity('departments')
@Unique(['orgId', 'name'])
@Index(['orgId', 'parentId'])
export class Department {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'org_id' })
  orgId!: number;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'org_id' })
  org?: Organization;

  @Column({ length: 100 })
  name!: string;

  @Column({ type: 'int', name: 'parent_id', nullable: true })
  parentId?: number | null;

  @ManyToOne(() => Department, { nullable: true })
  @JoinColumn({ name: 'parent_id' })
  parent?: Department;

  /**
   * 权限-2 数据范围：物化路径——祖先 id 以 '/' 包裹拼接（形如 `/1/3/`，根为 `/`）。
   * 「本部门及以下」下钻用 `ancestors LIKE '%/<deptId>/%'`；由 OrgService 在 create/move 时维护。
   */
  @Column({ type: 'varchar', length: 500, default: '' })
  ancestors!: string;

  @Column({ type: 'int', default: 0, name: 'sort_order' })
  sortOrder!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @DeleteDateColumn({ type: Date, name: 'deleted_at' })
  deletedAt?: Date | null;
}
