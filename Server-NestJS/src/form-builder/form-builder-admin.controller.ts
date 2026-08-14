import { Controller, Get, Post, Patch, Delete, Body, Param, Query, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsOptional, IsObject, IsBoolean, MaxLength, MinLength } from 'class-validator';
import { FormBuilderService } from './form-builder.service';
import { CheckPolicies } from '../common/casl/check-policies.decorator';

class CreateFormSchemaDto {
  @IsString() @MinLength(1) @MaxLength(100) title!: string;
  @IsString() @MinLength(1) @MaxLength(64) slug!: string;
  @IsObject() schema!: Record<string, unknown>;
  @IsOptional() @IsString() description?: string;
}

class UpdateFormSchemaDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsObject() schema?: Record<string, unknown>;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
}

/** PL-10 表单管理端点（管理员，CASL 保护）。 */
@ApiTags('表单管理')
@ApiBearerAuth()
@Controller({ path: 'admin/forms', version: '1' })
export class FormBuilderAdminController {
  constructor(private readonly formBuilder: FormBuilderService) {}

  @Get()
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: 'PL-10 表单定义列表（管理员）' })
  list(@Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number, @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number) {
    return this.formBuilder.listSchemas({ page, limit });
  }

  @Post()
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: 'PL-10 创建表单定义（管理员）' })
  create(@Body() dto: CreateFormSchemaDto) {
    return this.formBuilder.createSchema({ title: dto.title, slug: dto.slug, schema: dto.schema as never, description: dto.description });
  }

  @Patch(':id')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: 'PL-10 更新表单定义（管理员）' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateFormSchemaDto) {
    return this.formBuilder.updateSchema(id, { title: dto.title, schema: dto.schema as never, description: dto.description, enabled: dto.enabled });
  }

  @Delete(':id')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: 'PL-10 删除表单定义及提交（管理员）' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.formBuilder.removeSchema(id);
  }

  @Get(':id/submissions')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: 'PL-10 表单提交列表（管理员）' })
  submissions(@Param('id', ParseIntPipe) id: number, @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number, @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number) {
    return this.formBuilder.listSubmissions(id, page, limit);
  }
}
