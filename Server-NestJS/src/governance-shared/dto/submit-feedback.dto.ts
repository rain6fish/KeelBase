// SPDX-License-Identifier: Apache-2.0

import { IsString, IsIn, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SubmitFeedbackDto {
  @ApiProperty({ description: '对话 ID（chat/stream 返回的 conversationId）' })
  @IsString()
  conversationId!: string;

  @ApiProperty({ enum: ['thumbs_up', 'thumbs_down'] })
  @IsIn(['thumbs_up', 'thumbs_down'])
  feedback!: 'thumbs_up' | 'thumbs_down';

  @ApiPropertyOptional({ description: '反馈原因（可选）' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
