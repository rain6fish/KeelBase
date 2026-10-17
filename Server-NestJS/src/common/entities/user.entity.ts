// SPDX-License-Identifier: Apache-2.0

import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
  /**
   * Audit reader (AW-2). Read-only, and only on the audit / governance read surfaces. It exists so a
   * business auditor can do audit work **without being handed `admin`** — granting admin would also
   * make them the operator they are meant to review, which is the separation of duties this role is
   * for. It carries no write, no approval and no admin capability; see `BUILTIN_ROLE_RULES` for the
   * exact read subjects it gets.
   *
   * 审计读者（`AW-2`）。**只读**，且只在**审计 / 治理读面**上。它存在的理由，是让业务审计人员**不必被
   * 授予 `admin`** 就能做审计工作 —— 给了 `admin` 就等于让他同时是他本该复核的那个操作者，而
   * **审计独立性**正是这个角色存在的意义。它不带任何写、任何审批、任何管理能力；它能读的主体逐条见
   * `BUILTIN_ROLE_RULES`。
   */
  AUDITOR = 'auditor',
}

// The column default names the enum member rather than repeating its value.
// 列默认值引用枚举成员，而不是把它的取值再抄一遍。

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

  @Column({ type: 'varchar', length: 16, default: UserRole.USER })
  role!: UserRole;

  @Column({ length: 32, nullable: true })
  provider?: string;

  @Column({ type: 'varchar', nullable: true, length: 512, name: 'provider_id' })
  providerId?: string;

  @Column({ type: 'varchar', nullable: true, length: 64, name: 'provider_hash' })
  providerHash?: string;

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

  /** WEB-FRONT-4 强制改密：admin 重置密码/默认密码后标记，登录需先改密 */
  @Column({ type: 'boolean', default: false, name: 'must_change_password' })
  mustChangePassword!: boolean;

  @Column({ type: Date, nullable: true, name: 'locked_until' })
  lockedUntil?: Date | null;

  /** G-2 邀请码（注册时生成，唯一） */
  @Column({ length: 12, nullable: true, name: 'invite_code' })
  @Index('IDX_users_invite_code', { unique: true })
  inviteCode?: string;

  /** G-2 被谁邀请（邀请者 userId） */
  @Column({ nullable: true, name: 'invited_by' })
  invitedBy?: number;

  @Index('IDX_users_created_at')
  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
