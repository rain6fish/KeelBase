// SPDX-License-Identifier: Apache-2.0

import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn } from 'typeorm';

/**
 * 手机号验证码（瞬态数据）。
 * codeHash 存 SHA-256(验证码)，不落明文；phone 明文（验证码表的瞬态值，非用户资料）。
 */
@Entity('phone_verification_codes')
@Index(['phone'])
export class PhoneVerificationCode {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ length: 20 })
  phone!: string;

  @Column({ length: 64, name: 'code_hash' })
  codeHash!: string;

  @Column({ type: Date, name: 'expires_at' })
  expiresAt!: Date;

  @Column({ default: false })
  used!: boolean;

  @CreateDateColumn()
  createdAt!: Date;
}
