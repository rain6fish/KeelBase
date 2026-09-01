// SPDX-License-Identifier: Apache-2.0

import { Injectable } from '@nestjs/common';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { AiService } from '../ai/ai.service';
import { AuditService } from '../ai/audit/audit.service';
import { GovernancePolicyService } from '../ai/governance/governance-policy.service';
import { ADMIN_SYSTEM_PROMPT } from '../ai/constants/admin-system-prompt';
import { APP_VERSION } from '../app-version/app-version.config';
import { CapabilitiesService } from '../app-version/capabilities.service';
import { AdminService } from './admin.service';
import { AdminAiChatDto } from './dto/admin-ai.dto';

export interface AdminAiChatResponse {
  reply: string;
  conversationId: string;
  navigateTo?: string;
  toolCalls?: string[];
}

/**
 * System AI Assistant（AI-22 演进，L1 Explain + L2 Guide + L3 Navigate）。
 *
 * 组装动态系统上下文（能力清单/版本/工具清单/治理/实时统计）注入每条消息，
 * 以系统账号 '0' 调用 AiService.chat，透出 navigateTo/toolCalls 供管理台前端跳转。
 * 各上下文子项失败静默降级（沿用 AI-22 行为，不阻断对话）。
 */
@Injectable()
export class AdminAiService {
  constructor(
    private readonly aiService: AiService,
    private readonly adminService: AdminService,
    private readonly auditService: AuditService,
    private readonly capabilitiesService: CapabilitiesService,
    private readonly governancePolicy: GovernancePolicyService,
  ) {}

  async assistantChat(
    userId: number,
    dto: AdminAiChatDto,
  ): Promise<AdminAiChatResponse> {
    const context = await this.buildSystemContext();
    const result = await this.aiService.chat(String(userId), {
      // 平台实时上下文拼入 systemPrompt（buildMessages 每轮实时注入）；message 保持干净提问，对话历史/预览标题不受污染
      message: dto.message,
      conversationId: dto.conversationId,
      systemPrompt: `${ADMIN_SYSTEM_PROMPT}${context}`,
      adminMode: true,
    });
    return {
      reply: result.reply,
      conversationId: result.conversationId,
      navigateTo: result.navigateTo,
      toolCalls: result.toolCalls,
    };
  }

  /**
   * 管理端流式（roadmap 待办「管理端流式 + 确认通道」）：复用 AiService.chatStream，
   * 写工具（需确认）经 SSE confirmation_request 事件 → 前端确认 → approve → 执行。
   * 平台实时上下文同非流式注入（systemPrompt + adminMode）。
   */
  async *assistantChatStream(userId: number, dto: AdminAiChatDto) {
    const context = await this.buildSystemContext();
    yield* this.aiService.chatStream(String(userId), {
      message: dto.message,
      conversationId: dto.conversationId,
      systemPrompt: `${ADMIN_SYSTEM_PROMPT}${context}`,
      adminMode: true,
    });
  }

  /** 组装【平台实时数据】上下文块（各子项失败静默，单行紧凑约束 token） */
  private async buildSystemContext(): Promise<string> {
    const lines: string[] = [];

    // 1. 能力清单（与前端导航同源）
    try {
      const caps = this.capabilitiesService.getCapabilities();
      const modules = caps.businessModules
        .map((m) => `${m.label}-${m.description}`)
        .join(', ');
      lines.push(
        `能力清单: preset=${caps.preset}, 已启用模块: ${modules || '无'}`,
      );
    } catch {
      /* ignore */
    }

    // 2. 应用版本（静态常量）
    try {
      lines.push(
        `应用版本: ${APP_VERSION.latestVersion}（最低 ${APP_VERSION.minRequiredVersion}）`,
      );
    } catch {
      /* ignore */
    }

    // 3. 来源身份（§13.1 ③）：读 .keelbase/manifest.json → 答「这是什么系统」（与 /app/provenance 同源）
    try {
      const identity = this._sourceIdentity();
      if (identity) lines.push(identity);
    } catch {
      /* ignore */
    }

    // 4. AI 工具清单（getToolInventory 反映实时治理 enabled/确认/角色白名单）
    try {
      const inv = await this.aiService.getToolInventory();
      if (inv.length > 0) {
        const tools = inv
          .map((t) => {
            const flags = [
              t.enabled ? '' : '禁用',
              t.requiresConfirmation ? '需确认' : '',
              t.allowedRoles.length > 0 ? `仅[${t.allowedRoles.join(',')}]` : '',
            ].filter(Boolean);
            return `${t.name}-${t.description}${flags.length ? `(${flags.join(',')})` : ''}`;
          })
          .join(', ');
        lines.push(`AI 工具: ${tools}`);
      }
    } catch {
      /* ignore */
    }

    // 4. 治理策略（禁用工具 + 审计粒度）
    try {
      const policy = await this.governancePolicy.getPolicy();
      const disabled = Object.entries(policy.tools)
        .filter(([, p]) => p.enabled === false)
        .map(([name]) => name);
      lines.push(
        `治理策略: 审计粒度=${policy.audit.granularity}${disabled.length ? `, 禁用工具=[${disabled.join(', ')}]` : ''}`,
      );
    } catch {
      /* ignore */
    }

    // 5-7. 实时统计（沿用 AI-22 三项）
    const [analytics, cost, monitor] = await Promise.all([
      this.adminService.getAnalytics(30).catch(() => null),
      this.auditService.getCostBreakdown().catch(() => null),
      this.adminService.getMonitorSummary().catch(() => null),
    ]);
    if (analytics) {
      lines.push(
        `平台统计(近30天): 总用户${analytics.activeUsers.totalUsers}, ` +
          `周活${analytics.activeUsers.wau}, 月活${analytics.activeUsers.mau}, ` +
          `留存率${analytics.retention.ratePct}%, AI错误${analytics.errors.aiErrors}次`,
      );
    }
    if (cost?.summary) {
      lines.push(
        `AI用量: 共${cost.summary.totalCalls}次调用, 消耗${cost.summary.totalTokens}tokens`,
      );
    }
    if (monitor?.counts) {
      lines.push(
        `内容统计: 事件${monitor.counts.events ?? '?'}, ` +
          `通知${monitor.counts.notifications ?? '?'}`,
      );
    }

    return lines.length
      ? `\n\n【平台实时数据，供回答参考】\n${lines.join('\n')}\n`
      : '';
  }

  /** 来源身份（Build 侧 .keelbase/manifest.json）；缺失/不可读 → null（静默降级）。路径与 app-provenance 一致。 */
  private _sourceIdentity(): string | null {
    const candidates = [
      resolve(process.cwd(), '../.keelbase/manifest.json'),
      resolve(process.cwd(), '.keelbase/manifest.json'),
    ];
    for (const p of candidates) {
      if (existsSync(p)) {
        try {
          const m = JSON.parse(readFileSync(p, 'utf8'));
          const modules = Array.isArray(m.modules) && m.modules.length ? m.modules.join(', ') : '—';
          return `来源身份: ${m.identity ?? 'unknown'}（generator ${m.generator ?? '?'} v${m.generatorVersion ?? '?'}, protocol ${m.protocol ?? '?'}, schema ${m.schema ?? '?'}）; 来源模块: ${modules}`;
        } catch {
          return null;
        }
      }
    }
    return null;
  }
}
