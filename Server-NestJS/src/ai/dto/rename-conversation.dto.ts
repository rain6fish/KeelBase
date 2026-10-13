// SPDX-License-Identifier: Apache-2.0

import { IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * 工作账本：重命名会话的入参。
 *
 * `title` 允许空串 —— 那是**清除**标题的显式表达（前端随后回退到按首条消息派生的预览），
 * 故只约束「必须是字符串」与上传长度，不用 `@MinLength(1)`。
 */
export class RenameConversationDto {
  @ApiProperty({
    description: '新标题（工作账本）；空串 = 清除标题，回退到按首条消息派生的预览',
    example: 'Q3 客户风险盘点',
  })
  @IsString()
  @MaxLength(120)
  title!: string;
}
