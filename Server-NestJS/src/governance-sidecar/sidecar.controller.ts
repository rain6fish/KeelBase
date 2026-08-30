import { Controller, Post, Body, Headers } from '@nestjs/common';
import { SidecarService } from './sidecar.service';

/**
 * 治理 sidecar：OpenAI 兼容 chat/completions 端点。
 * 业务系统 LLM base URL → http://sidecar:port/v1，AI 调用即经 sidecar 上报治理台 + 转发真实 LLM。
 * 用户标识：x-user-id 头（业务系统可选传，审计归因用；缺省 'sidecar'）。
 */
@Controller('v1')
export class SidecarController {
  constructor(private readonly sidecar: SidecarService) {}

  @Post('chat/completions')
  async chatCompletions(
    @Body() body: Record<string, unknown>,
    @Headers('x-user-id') userId?: string,
  ) {
    return this.sidecar.proxyChat(body, userId);
  }
}
