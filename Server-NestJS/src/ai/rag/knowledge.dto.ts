// SPDX-License-Identifier: Apache-2.0

import { IsNotEmpty, IsOptional, IsString, MaxLength, IsInt, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateKnowledgeDto {
  @ApiProperty({ description: '知识条目标题', example: '休假政策' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @ApiProperty({ description: '知识条目内容', example: '员工每年可享受 5 天年假……' })
  @IsString()
  @IsNotEmpty()
  content!: string;

  @ApiPropertyOptional({ description: '分类', example: '人力资源' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  category?: string;
}

export class UpdateKnowledgeDto {
  @ApiPropertyOptional({ description: '知识条目标题' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ description: '知识条目内容' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  content?: string;

  @ApiPropertyOptional({ description: '分类' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  category?: string;
}

export class UploadKnowledgeDto {
  @ApiPropertyOptional({ description: '自定义标题（缺省用文件名）' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ description: '分类' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  category?: string;
}

export class KnowledgeQueryDto {
  @ApiPropertyOptional({ description: '搜索关键词（匹配标题/内容/分类）' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: '页码', default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ description: '每页条数', default: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  limit?: number;
}
