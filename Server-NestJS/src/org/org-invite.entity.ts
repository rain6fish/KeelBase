// SPDX-License-Identifier: Apache-2.0

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../common/entities/user.entity';
import { Organization } from './organization.entity';
import { Department } from './department.entity';
import { OrgMemberRole } from './org-member-role.enum';

@Entity('org_invites')
@Index(['orgId'])
export class OrgInvite {
  @PrimaryGeneratedColumn()
  id!: number;

  /** 8~12 位邀请码（复用 G-2 generateInviteCode 字符集） */
  @Column({ length: 12, unique: true })
  code!: string;

  @Column({ name: 'org_id' })
  orgId!: number;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'org_id' })
  org?: Organization;

  @Column({ name: 'inviter_id' })
  inviterId!: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'inviter_id' })
  inviter?: User;

  @Column({ type: 'varchar', length: 20, default: 'member' })
  role!: OrgMemberRole;

  @Column({ name: 'dept_id', nullable: true })
  deptId?: number | null;

  @ManyToOne(() => Department, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'dept_id' })
  dept?: Department;

  @Column({ type: Date, nullable: true, name: 'expires_at' })
  expiresAt?: Date | null;

  @Column({ type: 'int', nullable: true, name: 'used_by' })
  usedBy?: number | null;

  @Column({ type: Date, nullable: true, name: 'used_at' })
  usedAt?: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
