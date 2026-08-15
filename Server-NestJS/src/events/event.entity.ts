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
} from 'typeorm';
import { User } from '../common/entities/user.entity';
import { EventColorRole } from './event-color-role.enum';

@Entity('events')
@Index(['userId', 'startTime'])
export class Event {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ length: 200 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: Date })
  startTime!: Date;

  @Column({ type: Date })
  endTime!: Date;

  @Column({ length: 200, nullable: true })
  location?: string;

  @Column({ type: 'int', default: 0 })
  colorRole!: EventColorRole;

  @Column({ default: false })
  isCancelled!: boolean;

  @Column({ default: false })
  isRecurring!: boolean;

  /** 提前 N 分钟提醒；null 不提醒 */
  @Column({ type: 'int', nullable: true, name: 'reminder_minutes' })
  reminderMinutes?: number | null;

  @Column({ nullable: true })
  userId?: number;

  /** ORG-3 组织级数据隔离：所属组织 id（null=仅本人可见） */
  @Column({ type: 'int', nullable: true, name: 'org_id' })
  orgId?: number | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user?: User;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  /** RG-3 软删除：删除后仍保留行，管理台回收站可恢复 */
  @DeleteDateColumn({ type: Date, name: 'deleted_at' })
  deletedAt?: Date | null;
}
