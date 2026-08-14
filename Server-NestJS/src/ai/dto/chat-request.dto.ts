import { IsString, IsOptional, MinLength, MaxLength, IsArray, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ChatRequestDto {
  @ApiProperty({ description: '用户消息', example: '本月有哪些事件？' })
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  message!: string;

  @ApiPropertyOptional({
    description: 'LLM 供应商',
    example: 'deepseek',
    default: 'deepseek',
  })
  @IsString()
  @IsOptional()
  provider?: string;

  @ApiPropertyOptional({
    description: '模型名称',
    example: 'deepseek-v4-flash',
  })
  @IsString()
  @IsOptional()
  model?: string;

  @ApiPropertyOptional({
    description: '对话 ID，续传已有对话时传入',
    example: 'uuid-string',
  })
  @IsString()
  @IsOptional()
  conversationId?: string;

  @ApiPropertyOptional({
    description: 'AI-12 多模态：已上传图片的 URL 列表（复用 /upload 返回的 url）',
    example: ['/uploads/xxx.png'],
  })
  @IsArray()
  @IsOptional()
  @Matches(/^\/uploads\/(?!.*\.\.)[\w%.\-]+$/i, {
    each: true,
    message: 'images 仅允许本平台 /uploads/ 上传文件（SSRF 防护）',
  })
  images?: string[];
}
