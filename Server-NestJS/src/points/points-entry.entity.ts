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

/** 积分流水（append-only）：签到/成就/运营奖励。 */
@Entity('points_entries')
@Index(['userId', 'createdAt'])
@Unique(['userId', 'checkinDate'])
export class PointsEntry {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'user_id' })
  userId!: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  /** 正数为增加，负数为扣减 */
  @Column({ type: 'int' })
  points!: number;

  /** A1：签到日期（YYYY-MM-DD，UTC）。仅签到流水填，唯一约束 (user_id, checkin_date) 防重复签到竞态。 */
  @Column({ type: 'varchar', length: 10, nullable: true, name: 'checkin_date' })
  checkinDate?: string | null;

  /** 流水原因：checkin / achievement / bonus / admin_adjust */
  @Column({ length: 32 })
  reason!: string;

  @Column({ length: 128, nullable: true })
  description?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
