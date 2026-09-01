// SPDX-License-Identifier: Apache-2.0

import { Controller, Get, Post, Param, Query, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TemplatesService } from './templates.service';
import { CheckPolicies } from '../common/casl/check-policies.decorator';

/** PL-9 模板市场：示例模板列表 + 一键导入（管理员）。 */
@ApiTags('模板市场')
@ApiBearerAuth()
@Controller({ path: 'admin/templates', version: '1' })
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  @Get()
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: 'PL-9 内置示例模板列表（管理员）' })
  list() {
    return this.templatesService.listTemplates();
  }

  @Post(':id/import')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: 'PL-9 一键导入模板数据（事件/待办种子，管理员）' })
  importTemplate(@Param('id') id: string, @Query('userId', { transform: (v: string) => (v ? Number(v) : undefined) }) userId?: number) {
    return this.templatesService.importTemplate(id, userId);
  }
}
