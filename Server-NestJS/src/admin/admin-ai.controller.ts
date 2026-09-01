// SPDX-License-Identifier: Apache-2.0

import { Controller, Post, Body, HttpCode, HttpStatus, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CheckPolicies } from '../common/casl/check-policies.decorator';
import { SkipAudit } from '../operation-audit/skip-audit.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import type { Response } from 'express';
import { AdminAiService } from './admin-ai.service';
import { AdminAiChatDto } from './dto/admin-ai.dto';
import { actorContext } from '../ai/actor-context';

/**
 * System AI Assistant（AI-22 演进）：管理员对话时注入平台系统上下文
 * （能力清单/版本/工具清单/治理/实时统计），支持 Explain/Guide/Navigate，
 * 响应含 navigateTo/toolCalls。业务逻辑在 AdminAiService，本控制器仅委托。
 */
@ApiTags('管理端 AI')
@ApiBearerAuth()
@Controller({ path: 'admin/ai', version: '1' })
export class AdminAiController {
  constructor(private readonly adminAiService: AdminAiService) {}

  @Post('chat')
  @SkipAudit()
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'System AI Assistant：平台能力/版本/工具/治理上下文，Explain/Guide/Navigate' })
  async chat(@Body() dto: AdminAiChatDto, @CurrentUser() user: JwtPayload) {
    // 用真实管理员身份：会话/记忆/限额/审计按管理员隔离（不再共享系统账号 '0'）
    // Agent Identity：包 actorContext 让 sessionId（JWT jti）落入 ai_audit_logs（对齐 ai.controller chat/stream，否则系统 AI 会话审计 session_id 恒 null）
    return actorContext.run({ sessionId: user.sessionId, username: user.username }, () =>
      this.adminAiService.assistantChat(user.sub, dto));
  }

  /**
   * 管理端流式（roadmap 待办「管理端流式 + 确认通道」）：SSE 流式，
   * 写工具（需确认）经 confirmation_request 事件 → 前端确认 → approve → 执行（此前管理端非流式，写工具不可用）。
   */
  @Post('chat/stream')
  @SkipAudit()
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'System AI Assistant（SSE 流式 + 写确认通道）' })
  async chatStream(
    @Body() dto: AdminAiChatDto,
    @CurrentUser() user: JwtPayload,
    @Res() response: Response,
  ) {
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache');
    response.setHeader('Connection', 'keep-alive');
    response.flushHeaders();

    let aborted = false;
    response.on('close', () => {
      aborted = true;
    });

    // Agent Identity：管理员会话标识贯穿审计（对齐 ai.controller chat/stream）
    await actorContext.run({ sessionId: user.sessionId, username: user.username }, async () => {
      try {
        for await (const chunk of this.adminAiService.assistantChatStream(user.sub, dto)) {
          if (aborted) break;
          response.write(`event: ${chunk.type}\n`);
          response.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }
      } catch {
        if (!response.destroyed) {
          response.write(`event: error\ndata: ${JSON.stringify({ type: 'error', error: '管理端流式对话失败' })}\n\n`);
        }
      } finally {
        response.end();
      }
    });
  }
}
