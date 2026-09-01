// SPDX-License-Identifier: Apache-2.0

import { Entity, PrimaryColumn, Column, UpdateDateColumn } from 'typeorm';

/**
 * D2-1d 治理策略自有表（独立治理库前提）：单行策略（id=1），value 为 JSON 字符串。
 * 从 Settings 表迁出——治理台独立持有策略，不依赖业务 settings 表。
 */
@Entity('ai_governance_policy')
export class AiGovernancePolicy {
  @PrimaryColumn()
  id!: number; // 固定 1（单行策略）

  /** 策略 JSON：{ tools: { name: {enabled,requiresConfirmation,allowedRoles} }, audit: { granularity } } */
  @Column({ type: 'text' })
  value!: string;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
