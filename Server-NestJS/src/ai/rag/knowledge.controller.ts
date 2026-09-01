// SPDX-License-Identifier: Apache-2.0

/**
 * 知识库控制器 — 管理员维护知识条目
 *
 * 所有端点 CASL 校验 manage all（管理员专属）。
 * 普通用户通过 AI 对话消费知识库，不开放写入口。
 */

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { extname } from 'path';
import { memoryStorage } from 'multer';
import { KnowledgeService } from './knowledge.service';
import {
  CreateKnowledgeDto,
  UpdateKnowledgeDto,
  KnowledgeQueryDto,
  UploadKnowledgeDto,
} from './knowledge.dto';
import { CheckPolicies } from '../../common/casl/check-policies.decorator';
import { KNOWLEDGE_DOC_MIMES, MAX_KNOWLEDGE_FILE_SIZE, detectDocType } from './document-parser';

@ApiTags('知识库')
@ApiBearerAuth()
@Controller({ path: 'ai/knowledge', version: '1' })
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  @Post()
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: '创建知识条目（管理员）' })
  create(@Body() dto: CreateKnowledgeDto) {
    return this.knowledgeService.create(dto);
  }

  @Post('upload')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: '上传文档入库（PDF/DOCX，管理员）' })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_KNOWLEDGE_FILE_SIZE, files: 1 },
      fileFilter: (_req, file, cb) => {
        if (KNOWLEDGE_DOC_MIMES.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new BadRequestException('不支持的文件格式，仅支持 PDF / DOCX'), false);
        }
      },
    }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadKnowledgeDto,
  ) {
    if (!file) {
      throw new BadRequestException('请选择要上传的文件');
    }
    const ext = extname(file.originalname).toLowerCase();
    if (!detectDocType(ext)) {
      throw new BadRequestException(`不允许的文件类型: ${ext}`);
    }
    return this.knowledgeService.createDocument({
      buffer: file.buffer,
      originalName: file.originalname,
      mimetype: file.mimetype,
      title: dto.title,
      category: dto.category,
    });
  }

  @Get()
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: '知识条目列表/搜索（管理员）' })
  findAll(@Query() query: KnowledgeQueryDto) {
    return this.knowledgeService.findAll(query);
  }

  @Get('stats')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: 'AI-16 知识库统计：条目/切块/存储量（管理员）' })
  getStats() {
    return this.knowledgeService.getStats();
  }

  @Post('debug')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: 'AI-16 检索命中调试：返回结果与分数（管理员）' })
  debugSearch(@Body() dto: { query: string; limit?: number }) {
    if (!dto.query?.trim()) throw new BadRequestException('query 不能为空');
    return this.knowledgeService.debugSearch(dto.query, Math.min(dto.limit ?? 5, 20));
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: '知识条目详情（管理员）' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.knowledgeService.findOne(id);
  }

  @Get(':id/chunks')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: 'AI-16 文档切块预览（管理员）' })
  getChunks(@Param('id', ParseIntPipe) id: number) {
    return this.knowledgeService.getChunks(id);
  }

  @Patch(':id')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: '更新知识条目（管理员）' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateKnowledgeDto) {
    return this.knowledgeService.update(id, dto);
  }

  @Delete(':id')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除知识条目（管理员）' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.knowledgeService.remove(id);
    return null;
  }
}
