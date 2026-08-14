import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { User } from '../common/entities/user.entity';
import { Organization } from './organization.entity';
import { Department } from './department.entity';
import { OrgMemberRole } from './org-member-role.enum';

@Entity('org_members')
@Unique(['orgId', 'userId'])
@Index(['orgId', 'deptId'])
@Index(['orgId', 'role'])
export class OrgMember {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'org_id' })
  orgId!: number;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'org_id' })
  org?: Organization;

  @Column({ name: 'user_id' })
  userId!: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  /** 所属部门；删部门后置空（SET NULL） */
  @Column({ type: 'int', name: 'dept_id', nullable: true })
  deptId?: number | null;

  @ManyToOne(() => Department, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'dept_id' })
  dept?: Department;

  @Column({ type: 'varchar', length: 20, default: 'member' })
  role!: OrgMemberRole;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
