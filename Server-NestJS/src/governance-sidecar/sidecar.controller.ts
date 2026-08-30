import { Controller, Post, Body, Headers, Param, Get } from '@nestjs/common';
import { IsIn, IsString } from 'class-validator';
import { SidecarService } from './sidecar.service';

/** 确认决策（S-2：sidecar 代理层的工具调用确认） */
export class ConfirmDecisionDto {
  @IsString()
  @IsIn(['approve', 'reject'])
  decision!: 'approve' | 'reject';
}

/**
 * 治理 sidecar：OpenAI 兼容 chat/completions 端点。
 * 业务系统 LLM base URL → http://sidecar:port/v1，AI 调用即经 sidecar 上报治理台 + 转发真实 LLM。
 * 用户标识：x-user-id 头（业务系统可选传，审计归因用；缺省 'sidecar'）。
 * S-2：工具调用需确认时返回 confirmation 标记，业务系统 POST /v1/confirmations/:token 批准取回原响应。
 */
@Controller('v1')
export class SidecarController {
  constructor(private readonly sidecar: SidecarService) {}

  /** 健康检查（docker healthcheck / 编排用） */
  @Get('health')
  async health() {
    return { ok: true, service: 'sidecar' };
  }

  @Post('chat/completions')
  async chatCompletions(
    @Body() body: Record<string, unknown>,
    @Headers('x-user-id') userId?: string,
  ) {
    return this.sidecar.proxyChat(body, userId);
  }

  /** S-2 确认：approve 返回含原 tool_calls 的响应；reject 返回拒绝响应 */
  @Post('confirmations/:token')
  async confirm(
    @Param('token') token: string,
    @Body() dto: ConfirmDecisionDto,
    @Headers('x-user-id') userId?: string,
  ) {
    return this.sidecar.confirm(token, dto.decision, userId);
  }

  /** 待确认列表（诊断用） */
  @Post('confirmations')
  async pending() {
    return { pending: this.sidecar.pendingConfirmations() };
  }
}
