import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, MaxLength, IsOptional } from 'class-validator';
import { AiService } from '../ai/ai.service';
import { AuditService } from '../ai/audit/audit.service';
import { AdminService } from './admin.service';
import { CheckPolicies } from '../common/casl/check-policies.decorator';
import { SkipAudit } from '../operation-audit/skip-audit.decorator';

class AdminAiChatDto {
  @IsString()
  @MaxLength(2000)
  message!: string;

  @IsOptional()
  @IsString()
  conversationId?: string;
}

/**
 * AI-22 管理端 AI 助手：管理员对话时注入平台实时上下文（统计/成本/监控），
 * 让 AI 能回答「最近多少活跃用户」「AI 用量」「错误情况」等运营问题。
 * 复用 AiService.chat + AdminService 聚合数据，非流式。
 */
@ApiTags('管理端 AI')
@ApiBearerAuth()
@Controller({ path: 'admin/ai', version: '1' })
export class AdminAiController {
  constructor(
    private readonly aiService: AiService,
    private readonly adminService: AdminService,
    private readonly auditService: AuditService,
  ) {}

  @Post('chat')
  @SkipAudit()
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'AI-22 管理端 AI 助手（管理员，带平台上下文）' })
  async chat(@Body() dto: AdminAiChatDto) {
    // 收集平台实时上下文（失败静默，不阻断对话）
    const [analytics, cost, monitor] = await Promise.all([
      this.adminService.getAnalytics(30).catch(() => null),
      this.auditService.getCostBreakdown().catch(() => null),
      this.adminService.getMonitorSummary().catch(() => null),
    ]);

    const contextLines: string[] = [];
    if (analytics) {
      contextLines.push(
        `平台统计(近30天): 总用户${analytics.activeUsers.totalUsers}, ` +
          `周活${analytics.activeUsers.wau}, 月活${analytics.activeUsers.mau}, ` +
          `留存率${analytics.retention.ratePct}%, AI错误${analytics.errors.aiErrors}次`,
      );
    }
    if (cost?.summary) {
      contextLines.push(
        `AI用量: 共${cost.summary.totalCalls}次调用, 消耗${cost.summary.totalTokens}tokens`,
      );
    }
    if (monitor?.counts) {
      contextLines.push(
        `内容统计: 事件${monitor.counts.events ?? '?'}, ` +
          `通知${monitor.counts.notifications ?? '?'}`,
      );
    }

    const context = contextLines.length
      ? `\n\n【平台实时数据，供回答参考】\n${contextLines.join('\n')}\n`
      : '';

    const result = await this.aiService.chat('0', {
      message: `${context}\n管理员提问：${dto.message}`,
      conversationId: dto.conversationId,
    });
    return { reply: result.reply, conversationId: result.conversationId };
  }
}
