import { Controller, Get, Post, Body, Param, Query, ParseIntPipe, DefaultValuePipe, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { FormBuilderService } from './form-builder.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SkipAudit } from '../operation-audit/skip-audit.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

/** PL-10 用户端表单端点：按 slug 读取 + 提交（登录用户）。 */
@ApiTags('表单')
@ApiBearerAuth()
@Controller({ path: 'forms', version: '1' })
export class FormBuilderController {
  constructor(private readonly formBuilder: FormBuilderService) {}

  @Get(':slug')
  @ApiOperation({ summary: 'PL-10 读取表单定义（按 slug）' })
  getForm(@Param('slug') slug: string) {
    return this.formBuilder.getSchemaBySlug(slug);
  }

  @Post(':slug/submit')
  @SkipAudit()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'PL-10 提交表单数据（按 schema 校验）' })
  submit(@Param('slug') slug: string, @CurrentUser() user: JwtPayload, @Body() data: Record<string, unknown>) {
    return this.formBuilder.submit(slug, user.sub, data);
  }

  @Get(':slug/submissions')
  @ApiOperation({ summary: 'PL-10 本人对该表单的提交记录' })
  mySubmissions(@Param('slug') slug: string, @CurrentUser() user: JwtPayload) {
    return this.formBuilder.mySubmissions(slug, user.sub);
  }
}
