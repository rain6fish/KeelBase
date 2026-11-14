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

/**
 * AI Approval 旗舰应用：审批请求（AI 预审 + 人工复核）+ 审批政策。
 *
 * 0-C 口径：本模块是**单人额度校验** —— 申请人提交、AI 按政策分级、本人确认（`decide` 只按
 * `requesterId` 查行）；它**不是**组织多级审批。真正的双人审批在 R4（`src/ai/approvals/`）
 * 与 FLOW 工作流（`src/flows/`）。
 *
 * 0-C 改名：对外主路径改为 `/api/v1/my-requests/*`；`/api/v1/approval/*` 保留为**兼容别名**
 * （同一控制器挂在两个前缀上），旧客户端不必同时升级。实体/表名（`app_requests`）、DTO、AI 工具名
 * 与审计词表**不改** —— 那些是跨端与审计契约的一部分。
 *
 * 0-C: this module is a **single-person limit check** — the requester submits, the AI tiers by
 * policy, and the same person confirms (`decide` looks the row up by `requesterId`). It is **not**
 * organizational multi-level approval; that lives in R4 (`src/ai/approvals/`) and FLOW (`src/flows/`).
 * The canonical path is now `/api/v1/my-requests/*`; `/api/v1/approval/*` stays as a compatibility
 * alias on the same controller. Entity/table names, DTOs, AI tool names and the audit vocabulary are
 * unchanged because they are part of the cross-client and audit contract.
 */
@ApiTags('My Requests')
@ApiBearerAuth()
@FeatureFlag('approval')
@Controller({ path: ['my-requests', 'approval'], version: '1' })
export class ApprovalController {
  constructor(private readonly approvalService: ApprovalService) {}

  // ── Request ───────────────────────────────────────────────

  @Post('requests')
  @ApiOperation({ summary: '提交申请（pending；单人额度校验）' })
  createRequest(@Body() dto: CreateRequestDto, @CurrentUser() user: JwtPayload) {
    return this.approvalService.createRequest(dto, user.sub);
  }

  @Get('requests')
  @ApiOperation({ summary: '我的申请（状态筛选）' })
  listRequests(
    @CurrentUser() user: JwtPayload,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status') status?: string,
  ) {
    return this.approvalService.listRequests(user.sub, { status, page, limit });
  }

  @Get('requests/:id')
  @ApiOperation({ summary: '申请详情' })
  getRequest(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() _user: JwtPayload,
    @CurrentAbility() ability: AppAbility,
  ) {
    return this.approvalService.getRequest(id, ability);
  }

  @Delete('requests/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除申请（软删）' })
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
  @ApiOperation({ summary: '人工复核（本人确认；单人额度校验，非组织审批）：通过/驳回 needs_review 请求' })
  decide(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DecideDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.approvalService.decideRequest(id, dto.decision, user.sub);
  }

  // ── Policy ────────────────────────────────────────────────

  @Get('policies')
  @ApiOperation({ summary: '我的额度政策列表' })
  listPolicies(@CurrentUser() user: JwtPayload) {
    return this.approvalService.listPolicies(user.sub);
  }

  @Post('policies')
  @ApiOperation({ summary: '创建额度政策' })
  createPolicy(@Body() dto: CreatePolicyDto, @CurrentUser() user: JwtPayload) {
    return this.approvalService.createPolicy(dto, user.sub);
  }

  @Patch('policies/:id')
  @ApiOperation({ summary: '更新额度政策' })
  updatePolicy(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: Partial<CreatePolicyDto>,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.approvalService.updatePolicy(id, dto, user.sub);
  }

  @Delete('policies/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除额度政策' })
  async removePolicy(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    await this.approvalService.removePolicy(id, user.sub);
    return null;
  }
}
