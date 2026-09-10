// SPDX-License-Identifier: Apache-2.0

/**
 * 确定性演示 Provider（P0-0）
 *
 * 不依赖任何外部 LLM / API Key：在「没有任何云 Provider 可注册」时兜底启用，
 * 保证 ghcr 单容器镜像 / 干净环境 `docker run` 零配置即可跑通 AI 黄金流程。
 *
 * 决策 = 规则驱动（基于 messages 内容匹配），覆盖 AI CRM 黄金流程常见场景：
 *   query_customers → analyze_customer_risk → 风险总结
 *   create_followup_task（写，走 AiService 确认门控）
 *   query_customer_orders / query_customer_activities 等读查询
 *
 * AI 文本为模板化确定性回复；工具调用 / 确认 / 审计 / 撤销链路与真实 Provider 完全一致。
 */

import {
  LlmProvider,
  GenerateParams,
  GenerateResult,
  StreamChunk,
  ChatMessage,
  ToolCall,
} from '../interfaces/llm-provider.interface';
import { ToolDefinition } from '../interfaces/tool.interface';
import { DEMO_USER_INTENTS, type DemoIntentPattern } from './demo-intents';

/** 意图正则预编译一次（DEMO_USER_INTENTS 的 pattern 仍为单一真源；避免每次 decideFromUser 循环重编译） */
const DEMO_INTENT_MATCHERS: RegExp[] = DEMO_USER_INTENTS.map((i) => new RegExp(i.pattern, 'i'));

interface ParsedToolResult {
  success?: boolean;
  error?: string;
  data?: {
    total?: number;
    items?: Array<Record<string, unknown>>;
    level?: string;
    score?: number;
    reasons?: string[];
    [k: string]: unknown;
  };
}

export class DemoProvider implements LlmProvider {
  readonly name = 'demo';
  readonly displayName = '演示模式（确定性）';
  readonly availableModels = ['demo-model'];

  private callSeq = 0;

  isOpenAICompatible(): boolean {
    return false;
  }

  async generate(params: GenerateParams): Promise<GenerateResult> {
    const decision = this.decide(params.messages, params.tools);
    return {
      content: decision.content,
      toolCalls: decision.toolCalls,
      usage: { promptTokens: 0, completionTokens: 0 },
    };
  }

  async *stream(params: GenerateParams): AsyncIterable<StreamChunk> {
    const decision = this.decide(params.messages, params.tools);
    if (decision.content) {
      // 模拟流式：文本分块产出
      const step = 24;
      for (let i = 0; i < decision.content.length; i += step) {
        yield { type: 'text', content: decision.content.slice(i, i + step) };
      }
    }
    if (decision.toolCalls && decision.toolCalls.length > 0) {
      for (const tc of decision.toolCalls) {
        yield { type: 'tool_call', toolCall: tc };
      }
    }
    yield { type: 'done' };
  }

  // ---------------------------------------------------------------------------
  // 决策
  // ---------------------------------------------------------------------------

  private decide(
    messages: ChatMessage[],
    tools?: ToolDefinition[],
  ): { content: string; toolCalls?: ToolCall[] } {
    const last = messages[messages.length - 1];
    if (!last) return { content: '你好，我是演示模式助手。' };

    if (last.role === 'tool') return this.decideAfterTool(messages);
    if (last.role === 'user') return this.decideFromUser(last.content, messages, tools);
    return { content: '（演示模式）请告诉我你想做什么。' };
  }

  /** 首轮：用户消息 → 决定调用哪个工具 */
  private decideFromUser(
    msg: string,
    messages: ChatMessage[],
    tools?: ToolDefinition[],
  ): { content: string; toolCalls?: ToolCall[] } {
    const lower = msg.toLowerCase();

    // 通用生成模块写工具路由（internal-roadmap §internal.7 Proof Card R7）：消息含明确创建意图 + `参数=值` 且
    // 某生成 create_<x> 的必填参数被覆盖 → 优先路由（须在旗舰分支前，避免字段名如 customerName 撞 CRM 关键词）。
    const generatedWrite = this.decideGeneratedCreate(msg, tools);
    if (generatedWrite) return generatedWrite;

    // 表驱动首轮意图（CE-1 B4-demo：DEMO_USER_INTENTS 单源 declare，保序 = 原 if 链语义；
    // pattern/文案/参数类别进 specs/protocol/demo-intent-v1.json，demo-intents.spec.ts 防漂移）
    for (let k = 0; k < DEMO_USER_INTENTS.length; k++) {
      if (!DEMO_INTENT_MATCHERS[k].test(lower)) continue;
      const intent = DEMO_USER_INTENTS[k];
      return this.toolCall(intent.tool, this.buildUserIntentArgs(intent, msg, messages), intent.content);
    }

    return {
      content:
        '（演示模式）当前没有配置真实 LLM API Key，我以确定性流程演示 AI 黄金链路（工具调用/确认/审计/撤销全通）。你可以这样问我：\n' +
        '· 帮我分析客户「辰光建材」的风险\n' +
        '· 为「蓝湾地产」创建跟进任务\n' +
        '· 看看哪些客户值得重点关注',
    };
  }

  /**
   * 通用生成模块写工具路由（决定链路，无 LLM 确定性演示）：
   * 仅当 ①消息含创建意图 ②存在非旗舰 create_<x> 工具 ③消息里以 `参数=值` 覆盖其全部必填参数时路由——
   * 避免劫持旗舰 demo（create_followup_task 等在 denylist）。支持 keelbase-init 生成模块的
   * create 工具（生成物进入治理管线的演示入口）。工具结构为 OpenAI JSON-schema（function.parameters）。
   */
  private decideGeneratedCreate(
    msg: string,
    tools?: ToolDefinition[],
  ): { content: string; toolCalls?: ToolCall[] } | null {
    if (!tools?.length) return null;
    if (!/(创建|新增|建立|录入|创建一张|create|add)/i.test(msg)) return null;
    // 旗舰 demo 已硬编码处理，不走通用路由（防回退分支劫持既有黄金流程）
    const flagship = new Set(['create_followup_task', 'delete_customer']);

    const tokens = new Map<string, string>();
    const re = /([A-Za-z][A-Za-z0-9]*)\s*=\s*([^，,。、;；\s]+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(msg)) !== null) tokens.set(m[1].toLowerCase(), m[2].trim());
    if (tokens.size === 0) return null;

    let best: { name: string; props: Record<string, { type?: string }>; required: string[]; covered: string[] } | null = null;
    let bestScore = -1;
    for (const t of tools) {
      const fn = t.function;
      const name = fn?.name ?? (t as { name?: string }).name;
      if (!name || !/^create_/.test(name) || flagship.has(name)) continue;
      const props = (fn?.parameters?.properties ?? {}) as Record<string, { type?: string }>;
      const required = (Array.isArray(fn?.parameters?.required) ? fn.parameters.required : []) as string[];
      const covered = Object.keys(props).filter((k) => tokens.has(k.toLowerCase()));
      if (covered.length === 0) continue;
      const allRequired = required.length === 0 || required.every((r) => tokens.has(r.toLowerCase()));
      if (!allRequired) continue;
      const score = covered.length;
      if (score > bestScore) {
        bestScore = score;
        best = { name, props, required, covered };
      }
    }
    if (!best) return null;

    const args: Record<string, unknown> = {};
    for (const [key, val] of tokens) {
      const propName = best.covered.find((c) => c.toLowerCase() === key);
      if (!propName) continue;
      const type = best.props[propName]?.type ?? 'string';
      if (type === 'integer' || type === 'number') {
        const n = Number(val);
        if (!Number.isNaN(n)) args[propName] = n;
      } else if (type === 'boolean') {
        args[propName] = val.toLowerCase() === 'true';
      } else {
        args[propName] = val;
      }
    }
    return this.toolCall(best.name, args, `好的，我来创建${best.name.replace(/^create_/, '')}（写操作需要你确认）…`);
  }

  /** 工具执行后：根据上一步工具结果决定总结或下一步工具 */
  private decideAfterTool(
    messages: ChatMessage[],
  ): { content: string; toolCalls?: ToolCall[] } {
    const info = this.lastToolCallInfo(messages);
    if (!info) {
      return { content: '（演示模式）这一步已完成。' };
    }

    const parsed = this.parseToolResult(info.result);

    switch (info.name) {
      case 'query_customers': {
        const customers = parsed?.data?.items ?? [];
        if (customers.length === 0) {
          return { content: '没有找到匹配的客户。你可以换一个关键词再试试。' };
        }
        const first = customers[0];
        const name = String(first.name ?? `客户 #${first.id}`);
        return this.toolCall(
          'analyze_customer_risk',
          { customerId: Number(first.id) },
          `已找到 ${customers.length} 位客户，正在分析「${name}」的风险…`,
        );
      }

      case 'analyze_customer_risk': {
        const d = parsed?.data;
        if (!d) return { content: '风险分析完成。' };
        const reasons = Array.isArray(d.reasons) ? d.reasons : [];
        return {
          content:
            `风险分析完成（演示确定性流程）：\n` +
            `风险等级：${d.level ?? 'unknown'}（评分 ${d.score ?? '-'}）\n` +
            (reasons.length > 0 ? `主要依据：\n${reasons.map((r) => `  - ${r}`).join('\n')}\n` : '') +
            `\n建议：优先跟进该客户，可让我"为该客户创建跟进任务"。`,
        };
      }

      case 'create_followup_task': {
        if (parsed?.success) {
          return {
            content:
              '跟进任务已创建（写操作已通过确认门控并记录审计，演示确定性流程）。你可以到管理台的审计 / 治理中心查看这条操作的完整决策轨迹，也可以让我撤销它。',
          };
        }
        return {
          content:
            '创建跟进任务是写操作（R3），已进入确认门控等待你的确认；确认通过后才会真正创建并记录审计。',
        };
      }

      case 'query_customer_orders':
      case 'query_customer_activities':
      case 'query_customer_contacts':
      case 'query_customer_opportunities':
      case 'summarize_customer_360':
      case 'analyze_sales_pipeline':
      case 'query_projects':
      case 'query_project_tasks':
      case 'query_approval_requests':
      case 'query_events': {
        const d = parsed?.data as Record<string, unknown> | undefined;
        const total = d && typeof d === 'object' && 'total' in d ? d.total : undefined;
        const count = total != null ? `共 ${total} 条` : '';
        return { content: `已查询${count}。${this.truncate(JSON.stringify(d ?? info.result), 300)}` };
      }

      default:
        return {
          content: `已执行 ${info.name}：${this.truncate(info.result, 300)}`,
        };
    }
  }

  // ---------------------------------------------------------------------------
  // 工具调用 / 解析辅助
  // ---------------------------------------------------------------------------

  /** CE-1 B4-demo：按意图 argsKind 构造参数（语义 = 原 if 链各分支参数构造）。 */
  private buildUserIntentArgs(
    intent: DemoIntentPattern,
    msg: string,
    messages: ChatMessage[],
  ): Record<string, unknown> {
    switch (intent.argsKind) {
      case 'delete':
        return { customerId: this.findCustomerId(messages), reason: msg };
      case 'keyword': {
        const keyword = this.extractKeyword(msg);
        return keyword ? { keyword } : {};
      }
      case 'customer':
        return { customerId: this.findCustomerId(messages) };
      case 'followup':
        return { customerId: this.findCustomerId(messages), title: this.extractTitle(msg) };
      default:
        return {};
    }
  }

  private toolCall(
    name: string,
    args: Record<string, unknown>,
    content = '',
  ): { content: string; toolCalls: ToolCall[] } {
    this.callSeq += 1;
    return {
      content,
      toolCalls: [{ id: `call_demo_${this.callSeq}`, name, arguments: JSON.stringify(args) }],
    };
  }

  /** 找到最近一次 assistant 工具调用及其后的 tool 结果 */
  private lastToolCallInfo(
    messages: ChatMessage[],
  ): { name: string; args: Record<string, unknown>; result: string } | null {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role !== 'assistant' || !m.tool_calls || m.tool_calls.length === 0) continue;
      const tc = m.tool_calls[0];
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(tc.arguments);
      } catch {
        /* ignore */
      }
      const next = messages[i + 1];
      return {
        name: tc.name,
        args,
        result: next && next.role === 'tool' ? next.content : '',
      };
    }
    return null;
  }

  /** 宽松解析工具结果 JSON（AI 服务截断/正常格式都容错） */
  private parseToolResult(content: string): ParsedToolResult | null {
    try {
      return JSON.parse(content) as ParsedToolResult;
    } catch {
      return null;
    }
  }

  /** 从历史 query_customers 结果中找第一个客户 id（用于后续 customerId 参数） */
  private findCustomerId(messages: ChatMessage[]): number {
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      if (m.role !== 'assistant' || !m.tool_calls) continue;
      if (m.tool_calls[0]?.name !== 'query_customers') continue;
      const next = messages[i + 1];
      if (!next || next.role !== 'tool') continue;
      const parsed = this.parseToolResult(next.content);
      const item = parsed?.data?.items?.[0];
      const id = Number(item?.id);
      if (Number.isFinite(id) && id > 0) return id;
    }
    return 1; // 演示默认
  }

  /** 从用户消息抽客户名关键词（引号/书名号优先；「客户X」仅在 X 为具体名称时抽取） */
  private extractKeyword(msg: string): string | undefined {
    const quoted = msg.match(/「([^」]+)」|"([^"]+)"|'([^']+)'/);
    if (quoted) return quoted[1] || quoted[2] || quoted[3];
    // 否定前瞻排除虚词开头：「客户的风险」不应抽到「的风险」作为关键词
    const after = msg.match(/客户\s*((?!的|之|这|那|们)[一-龥A-Za-z0-9]{2,12})/);
    if (after) return after[1];
    return undefined;
  }

  private extractTitle(msg: string): string {
    const m = msg.match(/创建([^\s，。,.;;]{2,20})/);
    if (!m) return '跟进高风险客户';
    const t = m[1];
    return t.startsWith('跟进') ? t : `跟进${t}`;
  }

  private truncate(s: string, max: number): string {
    return s.length > max ? `${s.slice(0, max)}…` : s;
  }
}
