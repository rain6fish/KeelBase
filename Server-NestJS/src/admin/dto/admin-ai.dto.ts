// SPDX-License-Identifier: Apache-2.0

import { IsString, MaxLength, IsOptional } from 'class-validator';

export class AdminAiChatDto {
  @IsString()
  @MaxLength(2000)
  message!: string;

  @IsOptional()
  @IsString()
  conversationId?: string;
}
