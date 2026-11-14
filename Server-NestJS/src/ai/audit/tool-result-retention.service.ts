// SPDX-License-Identifier: Apache-2.0

import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { redactSensitive } from '../../common/utils/mask';
import { ToolResultBodyStore } from '../../governance-shared/services/tool-result-body.store';
import { ToolResult } from '../interfaces/tool.interface';
import { sanitizeExternalContent } from '../security/injection-guard';
import { RenderedToolResult, ToolPresentationService } from '../tools/tool-presentation.service';

/** What a tool call hands the retention surface. / 一次工具调用交给留存面的东西。 */
export interface RetainToolResultInput {
  /** The `ai_audit_logs` row this call wrote. No row ⇒ no retention (audit granularity `off`). */
  auditRowId: number;
  conversationId?: string;
  userId: string;
  toolName: string;
  result: ToolResult;
  /**
   * Already computed by the chat path for the message it pushes. Omitted on the R4 / MCP paths,
   * where no model saw the result (`model_text` stays null).
   *
   * 对话路径已经为它 push 的消息算好的那份。R4 / MCP 路径没有模型看到结果，故省略（`model_text`
   * 保持 null）。
   */
  rendered?: RenderedToolResult;
}

/**
 * 0-B retention write side: keep the body of a tool call so a truncated result stays checkable.
 *
 * Three rules shape it:
 * - **Off-chain.** Nothing here enters `buildPayload`; the audit chain is untouched.
 * - **Masked before stored.** Field-level masking (`redactSensitive`, the same predicate the audit
 *   before-snapshot uses) plus the string-level sanitizer the model input already gets. The admin
 *   console must never show plaintext PII, and this is the only store that could.
 * - **Never in the caller's way.** A failure here degrades to "no body retained" with a warning; it
 *   never fails the tool call, the answer, or the audit row. Retention is evidence, not a gate.
 *
 * The model-facing text is kept **verbatim** (`model_text`) because the truncation order is
 * project-then-sanitize, while the stored full body is sanitize-then-(not)-project: the two cannot be
 * derived from each other in general (a long hex string cut in half stops matching the mask regex).
 *
 * 0-B 留存的写入侧：保存一次工具调用的结果正文，使被截断的结果事后仍可核对。
 *
 * 三条规则：
 * - **链外**：这里没有任何东西进 `buildPayload`，审计链不受影响。
 * - **先脱敏再存**：字段级（`redactSensitive`，与审计 before 快照同一判据）+ 模型输入本就会过的
 *   字符串级脱敏。管理台不得出现明文 PII，而这是唯一可能有的存储。
 * - **绝不挡路**：这里失败只降级为「没有留存正文」并告警；绝不让工具调用、回答或审计行失败。
 *   留存是证据，不是闸。
 *
 * 模型实收文本**原样**保留（`model_text`）：截断的顺序是「先投影、再脱敏」，而留存的完整正文是
 * 「先脱敏、再（未）投影」—— 两者一般不互为反推（长 hex 串被切断后不再命中掩码正则）。
 */
@Injectable()
export class ToolResultRetentionService {
  private readonly logger = new Logger(ToolResultRetentionService.name);

  constructor(
    @Optional() private readonly config?: ConfigService,
    @Optional() private readonly store?: ToolResultBodyStore,
    @Optional() private readonly presentation?: ToolPresentationService,
  ) {}

  /** `0` days turns retention off; a missing config behaves like the default (30 days). */
  isEnabled(): boolean {
    return this._retentionDays() > 0 && Boolean(this.store);
  }

  async capture(input: RetainToolResultInput): Promise<void> {
    try {
      if (!this.isEnabled() || !this.store) return;

      const rendered = input.rendered ?? this.presentation?.renderToolResult(input.result);
      if (!rendered) return;

      // `truncated` is the default: keep only the calls whose full body was lost to the model.
      // `all` keeps every executed call instead.
      if (this._scope() === 'truncated' && !rendered.wasTruncated) return;

      const maxBytes = this._maxBytes();
      const overCap = rendered.fullBytes > maxBytes;

      // Do not mask a body we are not going to store: a very large result should not pay a parse +
      // stringify + regex pass just to be dropped.
      //
      // 不存的大正文不必脱敏：一个很大的结果不该为了被丢弃而付出解析 + 序列化 + 正则的代价。
      let bodyText: string | null = null;
      let storedBytes: number | null = null;
      if (!overCap) {
        const masked = sanitizeExternalContent(redactSensitive(rendered.fullJson));
        const bytes = Buffer.byteLength(masked, 'utf8');
        if (bytes <= maxBytes) {
          bodyText = masked;
          storedBytes = bytes;
        }
      }

      const modelText = input.rendered?.text ?? null;
      const now = new Date();
      await this.store.saveIfAbsent({
        auditRowId: input.auditRowId,
        conversationId: input.conversationId ?? null,
        userId: input.userId,
        toolName: input.toolName,
        outcome: input.result.success ? 'executed' : 'failed',
        bodyState: bodyText === null ? 'capped' : 'stored',
        bodyText,
        bodyBytes: rendered.fullBytes,
        storedBytes,
        bodySha256: bodyText === null ? null : sha256(bodyText),
        originalSha256: sha256(rendered.fullJson),
        modelText,
        modelChars: modelText === null ? null : modelText.length,
        modelSha256: modelText === null ? null : sha256(modelText),
        wasTruncated: rendered.wasTruncated,
        expiresAt: new Date(now.getTime() + this._retentionDays() * 24 * 3600 * 1000),
      });
    } catch (err) {
      // Retention is evidence, not a gate: a failed write must not turn a successful tool call into
      // a failed one. The warning is the only place this becomes visible.
      // 留存是证据、不是闸：写入失败不得把一次成功的工具调用变成失败。告警是它唯一的可见处。
      this.logger.warn(
        `[ToolResultRetention] capture failed for audit row ${input.auditRowId} (${input.toolName}): ${(err as Error).message}`,
      );
    }
  }

  private _retentionDays(): number {
    const raw = this.config?.get<string | number>('TOOL_RESULT_BODY_RETENTION_DAYS', 30);
    const days = Number(raw);
    return Number.isFinite(days) && days >= 0 ? days : 30;
  }

  private _maxBytes(): number {
    const raw = this.config?.get<string | number>('TOOL_RESULT_BODY_MAX_BYTES', 262144);
    const bytes = Number(raw);
    return Number.isFinite(bytes) && bytes > 0 ? bytes : 262144;
  }

  private _scope(): 'truncated' | 'all' {
    return this.config?.get<string>('TOOL_RESULT_BODY_SCOPE', 'truncated') === 'all'
      ? 'all'
      : 'truncated';
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
