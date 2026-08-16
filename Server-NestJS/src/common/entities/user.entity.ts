import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true, length: 32 })
  username!: string;

  @Column({ unique: true, length: 255 })
  email!: string;

  @Column({ length: 255, select: false })
  password!: string;

  @Column({ length: 64, nullable: true })
  firstName?: string;

  @Column({ length: 64, nullable: true })
  lastName?: string;

  @Column({ length: 64 })
  nickname!: string;

  @Column({ type: 'varchar', nullable: true, length: 512 })
  phone?: string;

  @Column({ type: 'varchar', nullable: true, length: 64, name: 'phone_hash' })
  phoneHash?: string | null;

  @Column({ type: 'boolean', default: false, name: 'phone_verified' })
  phoneVerified!: boolean;

  @Column({ type: 'date', nullable: true })
  dateOfBirth?: string;

  @Column({ length: 512, nullable: true })
  bio?: string;

  @Column({ length: 256, nullable: true })
  avatarUrl?: string;

  @Column({ type: 'varchar', length: 16, default: 'user' })
  role!: UserRole;

  @Column({ length: 32, nullable: true })
  provider?: string;

  @Column({ type: 'varchar', nullable: true, length: 512, name: 'provider_id' })
  providerId?: string;

  @Column({ type: 'varchar', nullable: true, length: 64, name: 'provider_hash' })
  providerHash?: string;

  @Column({ type: 'varchar', nullable: true, length: 512, name: 'refresh_token_hash' })
  refreshTokenHash?: string | null;

  @Column({ type: 'varchar', nullable: true, length: 64, name: 'reset_token_hash' })
  resetTokenHash?: string | null;

  @Column({ type: Date, nullable: true, name: 'reset_token_expires_at' })
  resetTokenExpiresAt?: Date | null;

  @Column({ type: 'boolean', default: false, name: 'email_verified' })
  emailVerified!: boolean;

  @Column({ type: 'varchar', nullable: true, length: 64, name: 'email_verification_code' })
  emailVerificationCode?: string | null;

  @Column({ type: Date, nullable: true, name: 'email_verification_expires_at' })
  emailVerificationExpiresAt?: Date | null;

  @Column({ default: 0, name: 'login_attempts' })
  loginAttempts!: number;

  /** WEB-FRONT-4 MFA：TOTP secret（AES-256-GCM 密文，select:false 防泄露） */
  @Column({ type: 'varchar', nullable: true, length: 512, name: 'mfa_secret', select: false })
  mfaSecret?: string | null;

  /** WEB-FRONT-4 MFA：是否已启用（启用后登录需 TOTP 验证） */
  @Column({ type: 'boolean', default: false, name: 'mfa_enabled' })
  mfaEnabled!: boolean;

  @Column({ type: Date, nullable: true, name: 'locked_until' })
  lockedUntil?: Date | null;

  /** G-2 邀请码（注册时生成，唯一） */
  @Column({ length: 12, nullable: true, name: 'invite_code' })
  @Index('IDX_users_invite_code', { unique: true })
  inviteCode?: string;

  /** G-2 被谁邀请（邀请者 userId） */
  @Column({ nullable: true, name: 'invited_by' })
  invitedBy?: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
