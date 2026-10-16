// SPDX-License-Identifier: Apache-2.0

import { Injectable, Optional } from '@nestjs/common';
import { SettingsService } from '../../settings/settings.service';
import {
  checkContentSafety,
  DEFAULT_CONTENT_SAFETY,
  ContentSafetyConfig,
  ContentSafetyResult,
} from './content-safety';
import { AuditService } from '../audit/audit.service';

/** N-6 Settings key：AI 内容安全配置（JSON { enabled, sensitive[], jailbreak[] }） */
export const CONTENT_SAFETY_SETTING_KEY = 'ai_content_safety';

export type ContentSafetySettings = ContentSafetyConfig & { enabled: boolean };

/**
 * N-6 AI-23 深度化：统一内容安全入口（AiService 对话 / RagAgent 检索 / MemoriesService 记忆写入）。
 * - 配置读 Settings ai_content_safety（管理员可配敏感词/越狱词表，实时生效），非法 JSON 兜底默认表
 * - enabled=false 放行（可整体停用）
 * - 命中 + 提供 ctx（userId）→ 写审计（action=content_blocked，isError），detail 只记命中特征源不落用户输入全文
 */
@Injectable()
export class ContentSafetyService {
  constructor(
    private readonly settingsService: SettingsService,
    @Optional() private readonly auditService?: AuditService,
  ) {}

  async getConfig(): Promise<ContentSafetySettings> {
    const raw = await this.settingsService.getWithDefault(CONTENT_SAFETY_SETTING_KEY, '');
    if (typeof raw !== 'string' || !raw) {
      return { enabled: true, ...DEFAULT_CONTENT_SAFETY };
    }
    try {
      const parsed = JSON.parse(raw) as Partial<ContentSafetySettings>;
      return {
        enabled: parsed.enabled !== false,
        sensitive: Array.isArray(parsed.sensitive) ? parsed.sensitive : DEFAULT_CONTENT_SAFETY.sensitive,
        jailbreak: Array.isArray(parsed.jailbreak) ? parsed.jailbreak : DEFAULT_CONTENT_SAFETY.jailbreak,
      };
    } catch {
      return { enabled: true, ...DEFAULT_CONTENT_SAFETY };
    }
  }

  /** 内容安全检查 + 命中审计。enabled=false 恒放行。 */
  async check(input: string, ctx?: { userId?: string; conversationId?: string }): Promise<ContentSafetyResult> {
    const config = await this.getConfig();
    if (!config.enabled) return { blocked: false };
    const result = checkContentSafety(input, config);
    if (result.blocked && ctx?.userId && this.auditService) {
      await this.auditService.log({
        userId: ctx.userId,
        conversationId: ctx.conversationId,
        action: 'content_blocked',
        isError: true,
        detail: `content_safety:${result.reason ?? 'unknown'}:${(result.detail ?? '').slice(0, 80)}`,
        errorMessage: result.reason,
        // C-4: `content_blocked` is not a tool action, so `outcome`/`tool` are deliberately absent —
        // the contract keeps the outcome vocabulary to `tool_call`/`tool_confirmation`/`effect_revoke`
        // and answers null for every other action (`any-other-action: [null]`). The refusal is already
        // readable from `isError` plus `detail`.
        // C-4：`content_blocked` 不是工具动作，故 `outcome`/`tool` 有意缺席 —— 契约把结果码词表限定在
        // `tool_call`/`tool_confirmation`/`effect_revoke`，其余动作一律答 null
        // （`any-other-action: [null]`）。这次拒绝已可由 `isError` 加上 `detail` 读出。
      });
    }
    return result;
  }
}
