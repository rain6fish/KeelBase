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

/** 积分流水（append-only）：签到/成就/运营奖励。 */
@Entity('points_entries')
@Index(['userId', 'createdAt'])
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
