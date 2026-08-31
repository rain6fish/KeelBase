import { Controller, Post, Body, Headers, Param, Get, UnauthorizedException } from '@nestjs/common';
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

  /** 待确认列表（诊断用）：需共享服务密钥——防内网邻近攻击者枚举 token 后 approve 门控调用 */
  @Post('confirmations')
  async pending(@Headers('x-api-key') apiKey?: string) {
    const expected = process.env.GOVERNANCE_API_KEY || '';
    if (!expected || apiKey !== expected) {
      throw new UnauthorizedException('sidecar 服务身份无效（GOVERNANCE_API_KEY）');
    }
    return { pending: this.sidecar.pendingConfirmations() };
  }

  /** B2：接收治理台策略推送（实时生效；服务身份校验，防未授权篡改策略） */
  @Post('policy')
  async policy(
    @Body() dto: { policy?: Record<string, unknown>; pushedAt?: string },
    @Headers('x-api-key') apiKey?: string,
  ) {
    const expected = process.env.GOVERNANCE_API_KEY || '';
    if (!expected || apiKey !== expected) {
      throw new UnauthorizedException('sidecar 服务身份无效（GOVERNANCE_API_KEY）');
    }
    return this.sidecar.applyPushedPolicy(dto.policy, dto.pushedAt);
  }
}
