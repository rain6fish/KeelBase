import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * HS-4 headless API Key 管理：每 key 独立身份/配额，替代单一全局 HEADLESS_API_KEY。
 * - keyHash：SHA-256(apiKey)，不存明文
 * - ownerUserId：该 key 以哪个用户身份执行（AI 记忆/权限/审计归属）
 * - quotaPerDay：每日调用上限（0=不限）；dailyUsed 当日起计
 * - toolWhitelist：允许的工具子集（二期 HS-4.1 启用）
 */
@Entity('headless_api_keys')
export class HeadlessApiKey {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ length: 64, unique: true, name: 'key_hash' })
  keyHash!: string;

  @Column({ length: 100 })
  name!: string;

  @Column({ name: 'owner_user_id' })
  ownerUserId!: number;

  /** 允许的工具白名单（JSON 数组）；null/空 = 全部工具 */
  @Column({ type: 'text', nullable: true, name: 'tool_whitelist' })
  toolWhitelist?: string | null;

  @Column({ default: 0, name: 'quota_per_day' })
  quotaPerDay!: number;

  @Column({ default: 0, name: 'daily_used' })
  dailyUsed!: number;

  @Column({ default: 0, name: 'quota_date' })
  quotaDate!: number;

  @Column({ default: true })
  enabled!: boolean;

  @Column({ type: Date, nullable: true, name: 'last_used_at' })
  lastUsedAt?: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
