/**
 * AI 控制器
 *
 * 提供 REST 和 SSE 流式两种对话接口。
 * 所有端点默认继承全局 JwtAuthGuard（需认证）。
 */

import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Query,
  Res,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import { AiService } from './ai.service';
import { ConversationService } from './conversation/conversation.service';
import { ConfirmationStore } from './confirmation/confirmation.store';
import { MemoriesService } from './memory/memory.service';
import { ChatRequestDto } from './dto/chat-request.dto';
import { ConfirmDecisionDto } from './dto/confirm-decision.dto';
import { ApproveDecisionDto } from './dto/approve-decision.dto';
import { ConversationQueryDto } from './dto/conversation-query.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CurrentAbility } from '../common/casl/current-ability.decorator';
import { CheckPolicies } from '../common/casl/check-policies.decorator';
import { SkipAudit } from '../operation-audit/skip-audit.decorator';
import { FeatureFlag } from '../feature-flags/feature-flag.decorator';
import { AiToolEffectsService } from './tool-effects/ai-tool-effects.service';
import { DecisionTraceService } from './trace/decision-trace.service';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import type { AppAbility } from '../common/casl/casl-ability.factory';

@ApiTags('AI')
@ApiBearerAuth()
@FeatureFlag('ai')
@Controller({ path: 'ai', version: '1' })
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly conversationService: ConversationService,
    private readonly confirmationStore: ConfirmationStore,
    private readonly memoriesService: MemoriesService,
    private readonly toolEffectsService: AiToolEffectsService,
    private readonly decisionTraceService: DecisionTraceService,
  ) {}

  /**
   * 非流式对话
   */
  @Post('chat')
  @SkipAudit()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'AI 对话（非流式）' })
  async chat(
    @Body() dto: ChatRequestDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.aiService.chat(String(user.sub), {
      message: dto.message,
      provider: dto.provider,
      model: dto.model,
      conversationId: dto.conversationId,
      images: dto.images,
    });
  }

  /**
   * 流式对话（SSE — Server-Sent Events）
   *
   * 返回 text/event-stream，逐块推送 AI 回复。
   * 前端使用 EventSource 或 fetch + ReadableStream 消费。
   */
  @Post('chat/stream')
  @SkipAudit()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'AI 对话（SSE 流式）' })
  async chatStream(
    @Body() dto: ChatRequestDto,
    @CurrentUser() user: JwtPayload,
    @Res() response: Response,
  ) {
    // 设置 SSE 头部
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache');
    response.setHeader('Connection', 'keep-alive');
    response.flushHeaders();

    const stream = this.aiService.chatStream(String(user.sub), {
      message: dto.message,
      provider: dto.provider,
      model: dto.model,
      conversationId: dto.conversationId,
      images: dto.images,
    });

    // 客户端断开时停止
    let aborted = false;
    response.on('close', () => {
      aborted = true;
    });

    try {
      for await (const chunk of stream) {
        if (aborted) break;

        response.write(`event: ${chunk.type}\n`);
        response.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
    } catch {
      if (!response.destroyed) {
        response.write(`event: error\ndata: ${JSON.stringify({ type: 'error', error: 'Internal stream error' })}\n\n`);
      }
    } finally {
      if (!response.destroyed && !aborted) {
        response.end();
      }
    }
  }

  /**
   * 确认 AI 写操作（create_event / create_todo）
   *
   * 流式对话中服务端发出 confirmation_request 后，前端展示确认卡，
   * 用户点击后调用此端点 resolve 对应的 pending 操作。
   */
  @Post('confirmations/:token')
  @SkipAudit()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'AI 写入操作确认' })
  async confirm(
    @Param('token') token: string,
    @Body() dto: ConfirmDecisionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const ok = this.confirmationStore.resolve(
      token,
      String(user.sub),
      dto.decision,
      dto.trustTool,
    );
    if (!ok) {
      throw new NotFoundException('确认请求不存在或已过期');
    }
    return { ok: true, trustTool: dto.trustTool ?? false };
  }

  /**
   * R4 双人审批：待审批列表（管理员审批页）
   */
  @Get('confirmations/pending')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: 'R4 待人工审批列表（管理员）' })
  async pendingApprovals() {
    return this.aiService.listPendingApprovals();
  }

  /**
   * R4 双人审批：已审批历史（管理员审批页）
   */
  @Get('confirmations/decided')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: 'R4 已审批历史（管理员）' })
  async decidedApprovals() {
    return this.aiService.listDecidedApprovals();
  }

  /**
   * R4 双人审批：approver 决策（管理员）——approve 后以 operator 维度执行工具
   */
  @Post('confirmations/:token/approve-by')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'R4 审批人决策（管理员）' })
  async decideApproval(
    @Param('token') token: string,
    @Body() dto: ApproveDecisionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const res = await this.aiService.decideApproval(token, String(user.sub), dto.decision);
    if (!res.ok) {
      throw new NotFoundException(res.message ?? '审批请求不存在或已决策');
    }
    return res;
  }

  /**
   * 清除当前用户的长期记忆（隐私）
   */
  @Delete('memory')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '清除用户长期记忆' })
  async clearMemory(@CurrentUser() user: JwtPayload) {
    await this.memoriesService.deleteAllForUser(String(user.sub));
    return null;
  }

  /**
   * 获取当前用户的对话历史列表
   */
  @Get('conversations')
  @ApiOperation({ summary: '获取对话历史列表' })
  async getConversations(
    @CurrentUser() user: JwtPayload,
    @Query() _query: ConversationQueryDto,
  ) {
    return this.conversationService.getUserConversations(String(user.sub));
  }

  /**
   * 获取单个对话的完整消息（用于继续对话）
   */
  @Get('conversations/:id')
  @ApiOperation({ summary: '获取单个对话完整消息' })
  async getConversation(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @CurrentAbility() ability: AppAbility,
  ) {
    return this.conversationService.getConversation(id, String(user.sub), ability);
  }

  /**
   * P0-14 对话执行轨迹（用户可见）：工具调用 / 确认决策 / 副作用 / 结果
   */
  @Get('conversations/:id/trace')
  @ApiOperation({ summary: '对话执行轨迹（工具调用/确认/副作用，本人）' })
  async getConversationTrace(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @CurrentAbility() ability: AppAbility,
  ) {
    return this.decisionTraceService.getConversationTrace(id, String(user.sub), ability);
  }

  /**
   * 删除指定对话
   */
  @Delete('conversations/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除指定对话' })
  async deleteConversation(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @CurrentAbility() ability: AppAbility,
  ) {
    await this.conversationService.deleteConversation(id, String(user.sub), ability);
    return null;
  }

  /**
   * 清空当前用户的所有对话
   */
  @Delete('conversations')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '清空所有对话' })
  async clearConversations(@CurrentUser() user: JwtPayload) {
    await this.conversationService.deleteAllUserConversations(String(user.sub));
    return null;
  }

  /**
   * HS-2 工具清单（管理台可见）：展示工具与权限元数据，便于审计/治理
   */
  @Get('tools')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: 'AI 工具清单与权限（管理员）' })
  getTools() {
    return this.aiService.getToolInventory();
  }

  /**
   * HS-3 AI 副作用记录（管理台可见）：AI 创建的 event/todo 清单，可定位并撤销
   */
  @Get('tool-effects')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: 'AI 写操作副作用记录（管理员，可按 userId 过滤）' })
  getToolEffects(
    @Query('userId', new DefaultValuePipe(undefined)) userId?: number,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    return this.toolEffectsService.list({
      userId: userId !== undefined ? Number(userId) : undefined,
      page,
      limit,
    });
  }

  /**
   * HS-3 撤销 AI 副作用：软删对应 event/todo（可经 RG-3 回收站恢复）
   */
  @Delete('tool-effects/:id')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: '撤销 AI 创建的事件/待办（管理员，软删可恢复）' })
  async revokeToolEffect(@Param('id', ParseIntPipe) id: number) {
    const result = await this.toolEffectsService.revoke(id);
    if (!result) throw new NotFoundException('副作用记录不存在');
    return result;
  }

  /**
   * P0-15 用户侧撤销：本人撤销自己的 AI 副作用（软删可经 RG-3 回收站恢复）。
   * 所有权校验在 service（effect.userId === 当前用户），非本人/不存在 → 404。
   */
  @Delete('my/tool-effects/:id')
  @ApiOperation({ summary: '撤销本人 AI 创建的记录（本人，软删可恢复，P0-15）' })
  async revokeMyToolEffect(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    const result = await this.toolEffectsService.revokeOwned(id, String(user.sub));
    if (!result) throw new NotFoundException('副作用记录不存在');
    return result;
  }
}
