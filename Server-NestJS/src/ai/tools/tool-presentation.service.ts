// SPDX-License-Identifier: Apache-2.0

/**
 * 工具呈现（从 `AiService` 拆出的第四个领域，健康清单 §3 阶段 3「主战场」）。
 *
 * 回答的是：**这次工具调用，说给人听是什么样**——确认卡摘要、tool_start/tool_end 卡片文案、
 * 影响预览、撤销档，以及喂给 LLM 的结果截断。**不含任何执行或策略判定**：它只把已有事实
 * （工具名 / 参数 / 结果）翻译成人读文案或受限文本。
 *
 * 与邻域的分工：门控判「能不能跑」、执行域「跑」、R4 审批域管生命周期；本域只管「怎么说」。
 * 唯一的对外知识依赖是 `isProxyTool`（影响预览要知道目标是不是 B 路径代理写）与工具注册表（撤销档解析）——
 * 都是**读**，没有反向依赖。
 *
 * **行为与拆分前逐字一致**——搬迁不改逻辑（阶段 3 纪律：行为不变，测试作护栏）。
 */
import { Injectable } from '@nestjs/common';
import { ToolRegistry } from './tool-registry';
import { ToolExecutionService } from './tool-execution.service';
import { AiConfirmationRequest } from '../../governance-shared/entities/ai-confirmation-request.entity';
import { RunItem } from '../confirmation/confirmation.store';
import {
  ConfirmationImpact,
  PresentationText,
  RevokeClass,
  ToolResult,
  resolveRevokeClass,
} from '../interfaces/tool.interface';
import { deriveWriteImpact } from '../tool-effects/write-impact';
import { sanitizeExternalContent } from '../security/injection-guard';
import { TOOL_METADATA, toolLabelKey } from '../../governance-shared/services/tool-metadata';

/**
 * What one tool result comes to on the two views that matter: the text the model receives, and the
 * full serialized result that text was projected from. `fullJson` is the unmasked, unprojected
 * payload (minus `usage`); callers that retain it must mask before storing.
 *
 * 一次工具结果在两个要紧视角上的样子：模型收到的文本，以及它投影自的完整序列化结果。`fullJson` 是
 * 未脱敏、未投影的载荷（去掉 `usage`）；留存方必须先脱敏再存储。
 */
export interface RenderedToolResult {
  /** The masked text handed to the model. / 交给模型的已脱敏文本。 */
  text: string;
  /** Full serialized payload (unmasked, no `usage`). / 完整序列化载荷（未脱敏、无 `usage`）。 */
  fullJson: string;
  /** UTF-8 bytes of `fullJson`. / `fullJson` 的 UTF-8 字节数。 */
  fullBytes: number;
  /** Whether the projection dropped anything. / 投影是否丢弃了内容。 */
  wasTruncated: boolean;
}
import {
  buildConfirmationRenderProof,
  buildRunRenderProof,
  ConfirmationRenderProof,
} from '../confirmation/confirmation-render';

/** CONF-3：一条存储行「当时的渲染」能否由今天的渲染重算复现。 */
export interface ConfirmationRenderVerification {
  /**
   * `true` = 重算与行上记录一致；`false` = 不一致（渲染已变，差异可见）；
   * `null` = 无从判断（该行未记录渲染凭据，或 run 行的批内快照不可解析）。
   */
  matched: boolean | null;
  stored: { renderHash: string | null; renderVersion: string | null };
  recomputed: ConfirmationRenderProof | null;
}

@Injectable()
export class ToolPresentationService {
  constructor(
    private readonly toolRegistry: ToolRegistry,
    private readonly toolExecution: ToolExecutionService,
  ) {}

  /**
   * §22.17 ④ 影响预览：待确认写动作 → 影响描述符（无可解析副作用对象时返回 null，
   * 调用方据此**省略** impact 字段而非发 0）。spec docs/impact-preview.spec.md。
   */
  writeImpact(toolNames: string[]): ConfirmationImpact | null {
    return deriveWriteImpact(
      toolNames.map((toolName) => ({
        toolName,
        isProxyWrite: this.toolExecution.isProxyTool(toolName),
        // 与执行路径同一判据（`isExternalTool`）→ 确认卡上标的与事后登记的逐条对得上。
        isExternalWrite: this.toolExecution.isExternalTool(toolName),
      })),
    );
  }

  /**
   * §22.17 ④ 影响预览 v1.1 撤销口径：工具 → KB-6 撤销档（`resolveRevokeClass` 单源，显式声明优先）。
   * 与事后撤销页 / 工具治理页同源——批准前看到的档位与事后能做的撤销必须一致，故不另建映射。
   * spec docs/impact-preview.spec.md §3。
   *
   * **解析不到就返回 undefined（调用方省略该字段）**，与 `writeImpact` 解析不到对象类型时同一诚实口径。
   * 未注册名（外部 `mcp_*` / LLM 幻觉名）在本域是**被容忍放行**的（门控明确不拦未注册名），
   * 而真实注册表对它**抛错**——同段门控与 `isProxyTool` 因此都包了 try/catch，本处同办。
   * 可达性（2026-09-17 实测）：**当前到不了**——逐条路径在确认前先调 `_requiresApproval`，它对未注册名的
   * `riskLevel` 调用无守卫、先抛，该工具以「执行失败」收尾（实测 chunk 序列 `tool_end → text → done`）。
   * 故本容错当前是护栏：失败后果不对称（未捕获异常会打断整条 SSE 确认流，容错只是少显示一行），
   * 一旦 `_requiresApproval` 改为容错，此处即成必经之路。不解析 ≠ 不可撤销，故不补默认值。详见 spec §3。
   */
  revokeClass(toolName: string): RevokeClass | undefined {
    try {
      return resolveRevokeClass(this.toolRegistry.getTool(toolName));
    } catch {
      return undefined;
    }
  }

  /**
   * GA 待我确认中心（docs/ai-action-center.spec.md §9）：把一条确认存储行还原成**人读**信息
   * （摘要 / 影响预览 / 撤销档 / 展示模式）。这四样知识都长在本域（writeSummary / writeImpact /
   * revokeClass），故由本域对外提供单一真源，而不让调用方各拼一份；
   * 列表与离线裁决的编排本身在 MyConfirmationService，不在这里。
   */
  describeConfirmation(row: AiConfirmationRequest): {
    summary: PresentationText | null;
    impact: ConfirmationImpact | null;
    revokeClass: RevokeClass | null;
    mode: 'immediate' | 'approval' | 'run';
    run: { runId: string; riskLevel: string; items: RunItem[] } | null;
  } {
    let args: Record<string, unknown> = {};
    try {
      args = row.args ? (JSON.parse(row.args) as Record<string, unknown>) : {};
    } catch {
      args = {};
    }
    const runItems = row.kind === 'run' ? this.parseRunItems(row.runItems) : null;
    const mode: 'immediate' | 'approval' | 'run' =
      row.kind === 'run' ? 'run' : row.riskLevel === 'R4' ? 'approval' : 'immediate';
    const toolNames = mode === 'run' ? (runItems ?? []).map((i) => i.toolName) : [row.toolName];
    return {
      summary:
        mode === 'run'
          ? this._runBatchSummary((runItems ?? []).length)
          : this.writeSummary(row.toolName, args),
      impact: toolNames.length ? this.writeImpact(toolNames) : null,
      revokeClass: this.revokeClass(row.toolName) ?? null,
      mode,
      run: runItems ? { runId: row.token, riskLevel: row.riskLevel, items: runItems } : null,
    };
  }

  /** 一次授权整批的摘要（run 卡）。 */
  private _runBatchSummary(count: number): PresentationText {
    return {
      key: 'ai.present.runBatch',
      fallback: `Authorize ${count} action(s) in one batch`,
      params: { count: String(count) },
    };
  }

  /** run 行携带的批内动作快照（JSON）；解析失败按空处理（不因此藏掉整行）。 */
  private parseRunItems(raw?: string | null): RunItem[] {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as RunItem[];
      if (!Array.isArray(parsed)) return [];
      // Rows written before the presentation text became `{key, fallback}` hold a plain string. Those
      // rows are TTL-bounded but not gone, so wrap the string rather than hand a renderer a shape it
      // cannot read. / 文案改成 `{key, fallback}` 之前写下的行里存的是普通字符串 —— 它们有 TTL 但
      // 还没消失，包一层，别把渲染端读不懂的形状递出去。
      return parsed.map((item) => {
        const legacy = item as unknown as { summary: unknown };
        return typeof legacy.summary === 'string'
          ? { ...item, summary: { key: 'ai.present.write.generic', fallback: legacy.summary } }
          : item;
      });
    } catch {
      return [];
    }
  }

  /**
   * KB-5：写工具的"人读 diff 摘要"（run 卡"有 diff 而非盲批"前提，docs/run-level-approval.spec.md §3）。
   * 返回 null 表示该工具暂无具体摘要（诚实降级：单条确认卡仍显示通用文案，run 聚合不并入该条）。
   */
  writeSummary(
    toolName: string,
    args: Record<string, unknown>,
  ): PresentationText | null {
    const title = (args.title as string) ?? '';
    const name = (args.name as string) ?? '';
    switch (toolName) {
      case 'create_event':
        return {
          key: 'ai.present.write.createEvent',
          fallback: `Create event: ${title} (${args.startTime ?? '?'} – ${args.endTime ?? '?'})`,
          params: {
            title,
            startTime: String(args.startTime ?? '?'),
            endTime: String(args.endTime ?? '?'),
          },
        };
      case 'create_todo':
        return args.dueDate
          ? {
              key: 'ai.present.write.createTodoDue',
              fallback: `Create todo: ${title} (due ${args.dueDate})`,
              params: { title, dueDate: String(args.dueDate) },
            }
          : { key: 'ai.present.write.createTodo', fallback: `Create todo: ${title}`, params: { title } };
      case 'create_customers':
        return { key: 'ai.present.write.createCustomers', fallback: `Create customer: ${name}`, params: { name } };
      case 'create_followup_task':
        return { key: 'ai.present.write.createFollowupTask', fallback: `Create follow-up task: ${title}`, params: { title } };
      case 'create_contract':
        return { key: 'ai.present.write.createContract', fallback: `Create contract: ${name}`, params: { name } };
      case 'create_project':
        return { key: 'ai.present.write.createProject', fallback: `Create project: ${title}`, params: { title } };
      case 'create_project_task':
        return { key: 'ai.present.write.createProjectTask', fallback: `Create project task: ${title}`, params: { title } };
      case 'update_customer_status':
        return {
          key: 'ai.present.write.updateCustomerStatus',
          fallback: `Update customer status: ${(args.status as string) ?? ''}`,
          params: { status: (args.status as string) ?? '' },
        };
      case 'submit_approval_request':
        return { key: 'ai.present.write.submitApprovalRequest', fallback: 'Submit approval request' };
      case 'create_knowledge':
        return { key: 'ai.present.write.createKnowledge', fallback: 'Create knowledge entry' };
      default:
        return null;
    }
  }

  /**
   * 生成写操作的人工可读摘要（用于单条确认卡与 GA 确认行）。
   */
  writeSummaryOrGeneric(toolName: string, args: Record<string, unknown>): PresentationText {
    return (
      this.writeSummary(toolName, args) ?? {
        key: 'ai.present.write.generic',
        fallback: 'Ran a write operation',
      }
    );
  }

  /**
   * CONF-3: recompute the render proof for a single action under **today's** renderer.
   *
   * Combined with the args already on the row, this is what a later reader runs: equality with the
   * stored hash means "today's rendering is still the one the user saw"; inequality is the visible
   * evidence that a mapping/translation changed in between.
   *
   * CONF-3：用**今天的**渲染重算单条动作的渲染凭据。与行上已有的参数配合，后来人要跑的就是这一步：
   * 与行上哈希相等 = 「今天的渲染仍是用户当时看到的那份」；不等 = 其间映射/翻译变过的可见证据。
   */
  renderProofFor(toolName: string, args: Record<string, unknown>): ConfirmationRenderProof {
    return buildConfirmationRenderProof(toolName, args, this.writeSummaryOrGeneric(toolName, args));
  }

  /**
   * CONF-3: does today's rendering reproduce the proof recorded on a stored confirmation row?
   *
   * Recomputes from the row's own tool name + args (and, for a run, re-renders each item from its
   * args) — deliberately **not** from the stored summaries, which would make the comparison
   * tautological. `matched: null` is the honest answer when the row predates the columns.
   *
   * CONF-3：今天的渲染能否复现行上记录的凭据？从行自己的工具名 + 参数重算（run 则逐条从各自参数
   * 重新渲染）——**刻意**不用行里已存的摘要，否则比对就成了同义反复。行早于本列时，
   * `matched: null` 是诚实的答案。
   */
  verifyStoredRender(
    row: Pick<AiConfirmationRequest, 'toolName' | 'args' | 'kind' | 'runItems' | 'renderHash' | 'renderVersion'>,
  ): ConfirmationRenderVerification {
    const stored = { renderHash: row.renderHash ?? null, renderVersion: row.renderVersion ?? null };
    if (!stored.renderHash || !stored.renderVersion) {
      return { matched: null, stored, recomputed: null };
    }

    let recomputed: ConfirmationRenderProof;
    if (row.kind === 'run') {
      const items = this.parseRunItems(row.runItems);
      if (items.length === 0) return { matched: null, stored, recomputed: null };
      recomputed = buildRunRenderProof(
        items.map((item) => ({
          toolName: item.toolName,
          args: item.args,
          summary: this.writeSummaryOrGeneric(item.toolName, item.args),
        })),
      );
    } else {
      let args: Record<string, unknown> = {};
      try {
        args = row.args ? (JSON.parse(row.args) as Record<string, unknown>) : {};
      } catch {
        args = {};
      }
      recomputed = this.renderProofFor(row.toolName, args);
    }

    return { matched: recomputed.renderHash === stored.renderHash, stored, recomputed };
  }

  /**
   * 只读工具的一行文案：**复用工具标签**（`ai.tool.<camel>`，与 `ai-feature-map` 同一个派生）。
   *
   * 这取代了原先本处那份 20 条中文 switch —— 它是同一批工具的**第三份手抄**，而其中 5 条的名字
   * （`query_contacts` / `query_opportunities` / `query_knowledge` / `query_suppliers` / `query_invoices`）
   * 本仓与 Java 参考线都查不到。未登记的工具返回 null，由各端用自己的标签（无则回退工具名）兜底。
   */
  readSummary(toolName: string): PresentationText | null {
    const meta = TOOL_METADATA[toolName];
    return meta ? { key: toolLabelKey(toolName), fallback: meta.label } : null;
  }

  /**
   * 生成工具执行结果摘要（用于 tool_end 卡片）。失败时交出工具自己的错误文本作为兜底
   * （不另加本地化前缀 —— 那会改变今天逐字显示的文案）。
   */
  resultSummary(toolName: string, result: ToolResult): PresentationText {
    if (!result.success) {
      return { key: 'ai.present.result.failed', fallback: result.error ?? 'The tool failed' };
    }
    const d = result.data as any;
    switch (toolName) {
      case 'query_events':
      case 'query_events_by_keyword': {
        const count = Array.isArray(d) ? d.length : 0;
        return { key: 'ai.present.result.rows', fallback: `${count} result(s)`, params: { count: String(count) } };
      }
      case 'count_events_by_status':
        return typeof d?.total === 'number'
          ? { key: 'ai.present.result.count', fallback: `${d.total} event(s)`, params: { count: String(d.total) } }
          : { key: 'ai.present.result.done', fallback: 'Done' };
      case 'get_user_stats':
        return { key: 'ai.present.result.getUserStats', fallback: 'User stats ready' };
      case 'navigate_page':
        return {
          key: 'ai.present.result.navigate',
          fallback: `Navigated to ${d?.description ?? ''}`,
          params: { description: String(d?.description ?? '') },
        };
      case 'create_event':
        return { key: 'ai.present.result.createEvent', fallback: 'Event created' };
      case 'create_todo':
        return { key: 'ai.present.result.createTodo', fallback: 'Todo created' };
      default:
        return { key: 'ai.present.result.done', fallback: 'Done' };
    }
  }

  /** HS-5 工具结果字符上限（防大查询结果撑爆上下文窗口） */
  private static readonly TOOL_RESULT_MAX_CHARS = 4000;
  private static readonly TOOL_RESULT_MAX_ARRAY = 20;
  private static readonly TOOL_RESULT_MAX_OBJECT_KEYS = 20;
  /** 逐级收紧的单字段字符上限：先宽后窄，取第一个能放进预算的投影。 */
  private static readonly TOOL_RESULT_FIELD_CAP_STEPS = [500, 200, 80, 32, 0] as const;
  /** 嵌套深度上限：超过即替换为标记，避免病态结构把投影本身撑大。 */
  private static readonly TOOL_RESULT_MAX_DEPTH = 4;

  /**
   * HS-5 截断工具结果：超限时返回**仍是合法 JSON** 的投影，而不是在 JSON 中间切断。
   * 数组按条目截断、对象按字段逐个截断（值过长只截值，不销毁整个 data），
   * 逐级收紧直到放进预算；最后一步才退回「省略 data」的标记。
   * 返回值注入 LLM 前先过 `sanitizeExternalContent` —— 工具结果里可能有别的用户写入的 DB 内容。
   *
   * 这里截的是**喂给模型的那一份**。完整正文是否可核对由 0-B 留存面决定（默认只留被截断的调用）；
   * 没开启留存时，模型之外没有任何地方保存结果正文 —— 旧文案「详情请查审计日志」是假的
   * （`tool-call-audit` 只落 outcome/isError，不落结果内容），已去掉。
   *
   * HS-5 returns a compacted **but still valid** JSON projection when the payload is too large; it
   * never cuts the serialized string mid-JSON. Arrays are trimmed per item and objects per field, with
   * the field cap tightened until the projection fits; only then does it fall back to omitting `data`.
   * The value handed to the LLM is passed through `sanitizeExternalContent`, because tool results can
   * carry DB content written by other users.
   */
  truncateToolResult(result: ToolResult): string {
    return this.renderToolResult(result).text;
  }

  /**
   * Same calculation as `truncateToolResult`, but also returns the full serialized result and whether
   * the projection dropped anything. The retention surface needs all three, and computing them in one
   * place keeps "was it truncated" from becoming a second opinion that can disagree with the text the
   * model actually received.
   *
   * 与 `truncateToolResult` 同一份计算，但一并返回完整序列化结果与「是否发生过截断」。留存面需要这
   * 三样；在一处算清，才不会让「是否截断」变成第二个可能与模型实际所见相左的判断。
   */
  renderToolResult(result: ToolResult): RenderedToolResult {
    // usage 是给审计记账的，不进 LLM 上下文——否则既污染提示词、又凭空多花 token
    const payload: ToolResult = { ...result };
    delete payload.usage;

    const full = JSON.stringify(payload);
    if (full.length <= ToolPresentationService.TOOL_RESULT_MAX_CHARS) {
      return {
        text: sanitizeExternalContent(full),
        fullJson: full,
        fullBytes: Buffer.byteLength(full, 'utf8'),
        wasTruncated: false,
      };
    }

    const data = payload.data;
    for (const cap of ToolPresentationService.TOOL_RESULT_FIELD_CAP_STEPS) {
      const projected = {
        ...payload,
        data: this._boundToolValue(data, cap, 0),
        _truncated: this._truncationNote(data),
      };
      const json = JSON.stringify(projected);
      if (json.length <= ToolPresentationService.TOOL_RESULT_MAX_CHARS) {
        return {
          text: sanitizeExternalContent(json),
          fullJson: full,
          fullBytes: Buffer.byteLength(full, 'utf8'),
          wasTruncated: true,
        };
      }
    }

    // 最后一步：结构本身已放不进预算 → 只留成功标志/错误与一条诚实的截断标记。
    // 仍是合法 JSON（不做字符串硬切）。
    return {
      text: sanitizeExternalContent(
        JSON.stringify({
          success: payload.success,
          error: payload.error,
          data: { _truncated: '结果过大，已省略' },
          _truncated: this._truncationNote(data),
        }),
      ),
      fullJson: full,
      fullBytes: Buffer.byteLength(full, 'utf8'),
      wasTruncated: true,
    };
  }

  /**
   * 有界投影：字符串按 cap 截断（cap=0 时只留标记），数组取前 N 条，对象取前 N 个字段，
   * 嵌套超过深度上限即替换为标记。返回值可直接 `JSON.stringify`。
   */
  private _boundToolValue(value: unknown, cap: number, depth: number): unknown {
    if (typeof value === 'string') {
      return value.length > cap ? `${value.slice(0, cap)}…[截断]` : value;
    }
    if (depth >= ToolPresentationService.TOOL_RESULT_MAX_DEPTH) {
      return Array.isArray(value) || (value !== null && typeof value === 'object') ? '[嵌套过深]' : value;
    }
    if (Array.isArray(value)) {
      return value
        .slice(0, ToolPresentationService.TOOL_RESULT_MAX_ARRAY)
        .map((item) => this._boundToolValue(item, cap, depth + 1));
    }
    if (value !== null && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(
        0,
        ToolPresentationService.TOOL_RESULT_MAX_OBJECT_KEYS,
      )) {
        out[key] = this._boundToolValue(item, cap, depth + 1);
      }
      return out;
    }
    return value;
  }

  /** 截断说明（人可读）：说清总数与展示数；不承诺「原文可查」。 */
  private _truncationNote(data: unknown): string {
    if (Array.isArray(data)) {
      const shown = Math.min(data.length, ToolPresentationService.TOOL_RESULT_MAX_ARRAY);
      return `结果已截断，共 ${data.length} 条，仅展示前 ${shown} 条`;
    }
    if (data !== null && typeof data === 'object') {
      const total = Object.keys(data as object).length;
      const shown = Math.min(total, ToolPresentationService.TOOL_RESULT_MAX_OBJECT_KEYS);
      return `结果已截断，共 ${total} 个字段，仅展示前 ${shown} 个`;
    }
    return '结果已截断';
  }
}
