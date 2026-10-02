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
import { AiConfirmationRequest } from '../approvals/ai-confirmation-request.entity';
import { RunItem } from '../confirmation/confirmation.store';
import {
  ConfirmationImpact,
  PresentationText,
  RevokeClass,
  ToolResult,
  resolveRevokeClass,
} from '../interfaces/tool.interface';
import { deriveWriteImpact } from '../tool-effects/write-impact';
import { TOOL_METADATA, toolLabelKey } from '../audit/tool-metadata';

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

  /**
   * HS-5 截断工具结果：超限时保留结构（数组截断到前 N 条 + 标记），
   * 让 LLM 拿到足够信息回答，又不会撑爆上下文。
   */
  truncateToolResult(result: ToolResult): string {
    // usage 是给审计记账的，不进 LLM 上下文——否则既污染提示词、又凭空多花 token
    const payload: ToolResult = { ...result };
    delete payload.usage;

    let json = JSON.stringify(payload);
    if (json.length <= ToolPresentationService.TOOL_RESULT_MAX_CHARS) return json;

    // 数组结果：截断到前 N 条
    const data = payload.data as any;
    if (Array.isArray(data)) {
      const truncated = data.slice(0, ToolPresentationService.TOOL_RESULT_MAX_ARRAY);
      const slim = {
        ...payload,
        data: truncated,
        _truncated: `结果已截断，共 ${data.length} 条，仅展示前 ${ToolPresentationService.TOOL_RESULT_MAX_ARRAY} 条`,
      };
      json = JSON.stringify(slim);
    } else if (data && typeof data === 'object') {
      // 对象结果：精简到成功标志 + 截断标记，避免回填巨量详情
      const slim = {
        success: payload.success,
        error: payload.error,
        data: { _truncated: '结果过大已精简，详情请查审计日志', _originalKeys: Object.keys(data) },
      };
      json = JSON.stringify(slim);
    }

    // 保底：字符串硬截断 + 提示
    if (json.length > ToolPresentationService.TOOL_RESULT_MAX_CHARS) {
      json = `${json.slice(0, ToolPresentationService.TOOL_RESULT_MAX_CHARS)}... [截断]`;
    }
    return json;
  }
}
