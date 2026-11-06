// SPDX-License-Identifier: Apache-2.0

import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * AW-16 F-63: the evidence a release must carry.
 *
 * A note is mandatory — a release that says nothing about why it was made is indistinguishable from
 * someone making the queue go away. `evidenceRef` is optional and names whatever the person actually
 * consulted (a ticket, a target-status lookup, a log line); it is recorded verbatim on the audit row,
 * never interpreted here.
 *
 * AW-16 F-63：释放必须附带的证据。
 *
 * 说明必填 —— 一条不说为什么的释放，与「把队列点没了」无法区分。`evidenceRef` 可选，写的是这个人
 * 实际查过什么（工单、目标状态查询、日志行）；它原样记进审计行，这里不做解释。
 */
export class ReleaseClaimDto {
  @ApiProperty({
    description: '为何释放（必填，原样记入审计行）',
    minLength: 8,
    maxLength: 500,
  })
  @IsString()
  @MinLength(8)
  @MaxLength(500)
  note!: string;

  @ApiPropertyOptional({
    description: '可选外部引用：工单号 / 对账记录 id / 日志地址（原样记入审计行）',
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  evidenceRef?: string;
}
