import { Controller, Get, Post, Delete, Body, Param, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsOptional, MaxLength } from 'class-validator';
import { AiEvalService } from './ai-eval.service';
import { CheckPolicies } from '../../common/casl/check-policies.decorator';
import { SkipAudit } from '../../operation-audit/skip-audit.decorator';

class CreateEvalCaseDto {
  @IsString()
  @MaxLength(64)
  category!: string;

  @IsString()
  @MaxLength(2000)
  prompt!: string;

  @IsOptional()
  @IsString()
  expected?: string;
}

/** AI-20 评测体系：评测集 CRUD + 跑批 + 报告（管理员）。 */
@ApiTags('AI 评测')
@ApiBearerAuth()
@Controller({ path: 'ai/eval', version: '1' })
export class AiEvalController {
  constructor(private readonly evalService: AiEvalService) {}

  @Get('cases')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: 'AI-20 评测集用例列表（管理员）' })
  listCases() {
    return this.evalService.listCases();
  }

  @Post('cases')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: 'AI-20 新增评测用例（管理员）' })
  createCase(@Body() dto: CreateEvalCaseDto) {
    return this.evalService.createCase(dto);
  }

  @Delete('cases/:id')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: 'AI-20 删除评测用例（管理员）' })
  deleteCase(@Param('id', ParseIntPipe) id: number) {
    return this.evalService.deleteCase(id);
  }

  @Post('seed')
  @SkipAudit()
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: 'HS-1 补齐内置安全评测用例（越权/PII/注入/写拒绝，幂等）' })
  seedSecurityCases() {
    return this.evalService.seedSecurityCases();
  }

  @Post('run')
  @SkipAudit()
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: 'AI-20 跑评测批（管理员，逐用例调 LLM）' })
  runEval() {
    return this.evalService.runEval();
  }

  @Get('report')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: 'AI-20 最近一次评测报告（管理员）' })
  getReport() {
    return this.evalService.getLastReport();
  }
}
