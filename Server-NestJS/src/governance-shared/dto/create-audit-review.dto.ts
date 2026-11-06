// SPDX-License-Identifier: Apache-2.0

import { IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

/**
 * AW-12 — the rows a review receipt claims to cover, by chain position.
 *
 * Ids, not timestamps: `createdAt` is not part of the hash payload, so a review range written in time
 * could be rewritten without breaking a signature. The chain position is what the chain itself binds.
 *
 * AW-12 —— 一张复核回执声称覆盖的行，按链位给。
 *
 * 用 id 不用时间戳：`createdAt` 不在 hash 载荷里，按时间写的复核区间可以被改写而不断签。被链绑住的是链位。
 */
export class CreateAuditReviewDto {
  @ApiProperty({ description: '起始审计行 id（含）', example: 1201 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  fromId!: number;

  @ApiProperty({ description: '截止审计行 id（含），不得超过签署时的链尾 id', example: 1284 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  throughId!: number;
}
