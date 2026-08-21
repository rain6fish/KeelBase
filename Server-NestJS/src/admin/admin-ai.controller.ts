import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CheckPolicies } from '../common/casl/check-policies.decorator';
import { SkipAudit } from '../operation-audit/skip-audit.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { AdminAiService } from './admin-ai.service';
import { AdminAiChatDto } from './dto/admin-ai.dto';

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
    return this.adminAiService.assistantChat(user.sub, dto);
  }
}
