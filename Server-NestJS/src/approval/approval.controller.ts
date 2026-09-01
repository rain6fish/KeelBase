// SPDX-License-Identifier: Apache-2.0

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ApprovalService } from './approval.service';
import { CreateRequestDto, CreatePolicyDto, DecideDto } from './dto/approval.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CurrentAbility } from '../common/casl/current-ability.decorator';
import { FeatureFlag } from '../feature-flags/feature-flag.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import type { AppAbility } from '../common/casl/casl-ability.factory';

/** AI Approval 旗舰应用：审批请求（AI 预审 + 人工复核）+ 审批政策 */
@ApiTags('AI Approval')
@ApiBearerAuth()
@FeatureFlag('approval')
@Controller({ path: 'approval', version: '1' })
export class ApprovalController {
  constructor(private readonly approvalService: ApprovalService) {}

  // ── Request ───────────────────────────────────────────────

  @Post('requests')
  @ApiOperation({ summary: '提交审批请求（pending）' })
  createRequest(@Body() dto: CreateRequestDto, @CurrentUser() user: JwtPayload) {
    return this.approvalService.createRequest(dto, user.sub);
  }

  @Get('requests')
  @ApiOperation({ summary: '我的审批请求（状态筛选）' })
  listRequests(
    @CurrentUser() user: JwtPayload,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status') status?: string,
  ) {
    return this.approvalService.listRequests(user.sub, { status, page, limit });
  }

  @Get('requests/:id')
  @ApiOperation({ summary: '审批请求详情' })
  getRequest(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() _user: JwtPayload,
    @CurrentAbility() ability: AppAbility,
  ) {
    return this.approvalService.getRequest(id, ability);
  }

  @Delete('requests/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除审批请求（软删）' })
  async removeRequest(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() _user: JwtPayload,
    @CurrentAbility() ability: AppAbility,
  ) {
    await this.approvalService.removeRequest(id, ability);
    return null;
  }

  @Post('requests/:id/review')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'AI 预审：按政策分级（低风险自动通过 / 高风险转人工复核）' })
  review(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.approvalService.reviewRequest(id, user.sub);
  }

  @Post('requests/:id/decide')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '人工复核：通过/驳回 needs_review 请求' })
  decide(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DecideDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.approvalService.decideRequest(id, dto.decision, user.sub);
  }

  // ── Policy ────────────────────────────────────────────────

  @Get('policies')
  @ApiOperation({ summary: '我的审批政策列表' })
  listPolicies(@CurrentUser() user: JwtPayload) {
    return this.approvalService.listPolicies(user.sub);
  }

  @Post('policies')
  @ApiOperation({ summary: '创建审批政策' })
  createPolicy(@Body() dto: CreatePolicyDto, @CurrentUser() user: JwtPayload) {
    return this.approvalService.createPolicy(dto, user.sub);
  }

  @Patch('policies/:id')
  @ApiOperation({ summary: '更新审批政策' })
  updatePolicy(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: Partial<CreatePolicyDto>,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.approvalService.updatePolicy(id, dto, user.sub);
  }

  @Delete('policies/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除审批政策' })
  async removePolicy(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    await this.approvalService.removePolicy(id, user.sub);
    return null;
  }
}
