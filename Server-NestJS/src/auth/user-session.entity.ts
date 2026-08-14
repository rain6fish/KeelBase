import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * 登录会话（设备）记录。
 *
 * 每个 refresh token 对应一行；refresh 轮换时更新该行的 hash 与活跃时间，
 * logout 删当前设备会话，远程登出删指定会话。
 */
@Entity('user_sessions')
export class UserSession {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column({ name: 'user_id' })
  userId!: number;

  @Column({ length: 64, name: 'refresh_hash' })
  refreshHash!: string;

  @Column({ type: 'varchar', length: 64, nullable: true, name: 'device_id' })
  deviceId?: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true, name: 'device_name' })
  deviceName?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'user_agent' })
  userAgent?: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ip?: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @Column({ type: Date, nullable: true, name: 'last_active_at' })
  lastActiveAt?: Date | null;

  @Column({ type: Date, nullable: true, name: 'expires_at' })
  expiresAt?: Date | null;
}
