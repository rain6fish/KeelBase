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

  @Column({ type: 'int', default: 0, name: 'sort_order' })
  sortOrder!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @DeleteDateColumn({ type: Date, name: 'deleted_at' })
  deletedAt?: Date | null;
}
