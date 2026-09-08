// SPDX-License-Identifier: Apache-2.0

/**
 * Demo Provider（确定性演示）单元测试
 *
 * 覆盖黄金流程决策：用户问 → query_customers → analyze_customer_risk → 总结；
 * 创建跟进任务（写，触发确认门控）；流式输出格式。
 */

import { DemoProvider } from './demo-provider';
import { ChatMessage } from '../interfaces/llm-provider.interface';
import { ToolDefinition } from '../interfaces/tool.interface';

/** 构造「assistant 发起工具调用 + 紧跟其 tool 结果」两轮消息（末条为 tool 角色） */
function toolRound(name: string, result: unknown, args = '{}'): ChatMessage[] {
  return [
    { role: 'assistant', content: '', tool_calls: [{ id: 'call_t', name, arguments: args }] },
    {
      role: 'tool',
      tool_call_id: 'call_t',
      content: typeof result === 'string' ? result : JSON.stringify(result),
    },
  ];
}

describe('DemoProvider', () => {
  let provider: DemoProvider;

  beforeEach(() => {
    provider = new DemoProvider();
  });

  describe('元数据', () => {
    it('name/displayName 正确', () => {
      expect(provider.name).toBe('demo');
      expect(provider.displayName).toContain('演示');
      expect(provider.isOpenAICompatible()).toBe(false);
    });
  });

  describe('generate 决策', () => {
    it('用户问客户风险 → 首轮调 query_customers', async () => {
      const messages: ChatMessage[] = [{ role: 'user', content: '帮我分析客户的风险' }];
      const result = await provider.generate({ messages });
      expect(result.toolCalls?.[0]?.name).toBe('query_customers');
    });

    it('用户带客户名 → query_customers 带 keyword', async () => {
      const messages: ChatMessage[] = [{ role: 'user', content: '帮我分析客户「辰光建材」的风险' }];
      const result = await provider.generate({ messages });
      expect(result.toolCalls?.[0]?.name).toBe('query_customers');
      expect(JSON.parse(result.toolCalls![0].arguments).keyword).toBe('辰光建材');
    });

    it('query_customers 返回客户 → 下一步调 analyze_customer_risk 带第一个客户 id', async () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: '帮我分析客户的风险' },
        {
          role: 'assistant',
          content: '好的，我先查询客户列表…',
          tool_calls: [{ id: 'call_1', name: 'query_customers', arguments: '{}' }],
        },
        {
          role: 'tool',
          tool_call_id: 'call_1',
          content: JSON.stringify({
            success: true,
            data: { total: 2, items: [{ id: 42, name: '辰光建材' }, { id: 7, name: '蓝湾地产' }] },
          }),
        },
      ];
      const result = await provider.generate({ messages });
      expect(result.toolCalls?.[0]?.name).toBe('analyze_customer_risk');
      expect(JSON.parse(result.toolCalls![0].arguments).customerId).toBe(42);
      expect(result.content).toContain('辰光建材');
    });

    it('analyze_customer_risk 返回风险 → 纯文本总结（无工具调用）', async () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: '帮我分析客户的风险' },
        { role: 'assistant', content: '…', tool_calls: [{ id: 'c1', name: 'query_customers', arguments: '{}' }] },
        { role: 'tool', tool_call_id: 'c1', content: JSON.stringify({ success: true, data: { total: 1, items: [{ id: 42, name: '辰光建材' }] } }) },
        { role: 'assistant', content: '正在分析…', tool_calls: [{ id: 'c2', name: 'analyze_customer_risk', arguments: '{"customerId":42}' }] },
        { role: 'tool', tool_call_id: 'c2', content: JSON.stringify({ success: true, data: { level: 'critical', score: 12, reasons: ['2 笔订单逾期', '高价值订单'], dataPoints: {} } }) },
      ];
      const result = await provider.generate({ messages });
      expect(result.toolCalls ?? []).toHaveLength(0);
      expect(result.content).toContain('critical');
      expect(result.content).toContain('逾期');
    });

    it('用户要求创建跟进 → 调 create_followup_task（写）', async () => {
      const messages: ChatMessage[] = [{ role: 'user', content: '为「蓝湾地产」创建跟进任务' }];
      const result = await provider.generate({ messages });
      expect(result.toolCalls?.[0]?.name).toBe('create_followup_task');
      const args = JSON.parse(result.toolCalls![0].arguments);
      expect(args.customerId).toBeDefined();
      expect(args.title).toContain('跟进');
    });

    it('create_followup_task 结果 → 确认完成文案', async () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: '为「蓝湾地产」创建跟进任务' },
        { role: 'assistant', content: '…', tool_calls: [{ id: 'c1', name: 'create_followup_task', arguments: '{"customerId":7,"title":"跟进蓝湾地产"}' }] },
        { role: 'tool', tool_call_id: 'c1', content: JSON.stringify({ success: true, data: { id: 338 } }) },
      ];
      const result = await provider.generate({ messages });
      expect(result.toolCalls ?? []).toHaveLength(0);
      expect(result.content).toContain('跟进任务已创建');
    });

    it('用户要求删除客户 → 调 delete_customer（R5 阻断演示）', async () => {
      const messages: ChatMessage[] = [{ role: 'user', content: '查一下删除客户「瀚宇制造」' }];
      const result = await provider.generate({ messages });
      expect(result.toolCalls?.[0]?.name).toBe('delete_customer');
    });

    it('删除请求优先于分析/客户分支（含"客户"仍命中删除）', async () => {
      const messages: ChatMessage[] = [{ role: 'user', content: '删除客户' }];
      const result = await provider.generate({ messages });
      expect(result.toolCalls?.[0]?.name).toBe('delete_customer');
      const args = JSON.parse(result.toolCalls![0].arguments);
      expect(args.customerId).toBeDefined();
    });

    it('无关问题 → 引导文案', async () => {
      const messages: ChatMessage[] = [{ role: 'user', content: '你好' }];
      const result = await provider.generate({ messages });
      expect(result.toolCalls ?? []).toHaveLength(0);
      expect(result.content).toContain('演示模式');
    });
  });

  describe('stream 输出', () => {
    it('产出 text + tool_call + done', async () => {
      const messages: ChatMessage[] = [{ role: 'user', content: '分析客户风险' }];
      const chunks = [];
      for await (const chunk of provider.stream({ messages })) {
        chunks.push(chunk);
      }
      expect(chunks.some((c) => c.type === 'text')).toBe(true);
      expect(chunks.some((c) => c.type === 'tool_call' && c.toolCall?.name === 'query_customers')).toBe(true);
      expect(chunks[chunks.length - 1].type).toBe('done');
    });

    it('纯文本回复也以 done 收尾', async () => {
      const messages: ChatMessage[] = [{ role: 'user', content: '你好' }];
      const chunks = [];
      for await (const chunk of provider.stream({ messages })) {
        chunks.push(chunk);
      }
      expect(chunks.some((c) => c.type === 'text')).toBe(true);
      expect(chunks[chunks.length - 1].type).toBe('done');
    });
  });

  // ── 补充覆盖：各意图分支（订单/活动/项目/审批/待办）与首轮兜底 ──────────────
  describe('补充覆盖：decideFromUser 全意图', () => {
    it('空消息 → 演示默认问候', async () => {
      const result = await provider.generate({ messages: [] });
      expect(result.toolCalls ?? []).toHaveLength(0);
      expect(result.content).toContain('演示模式助手');
    });

    it('末条消息是 system/assistant（非 tool/user）→ 提示语', async () => {
      const sys = await provider.generate({ messages: [{ role: 'system', content: 'be terse' }] });
      expect(sys.content).toContain('请告诉我你想做什么');
      const asst = await provider.generate({ messages: [{ role: 'assistant', content: '…' }] });
      expect(asst.content).toContain('请告诉我你想做什么');
    });

    it('用户提订单 → query_customer_orders', async () => {
      const r = await provider.generate({ messages: [{ role: 'user', content: '看看最近的订单' }] });
      expect(r.toolCalls?.[0]?.name).toBe('query_customer_orders');
    });

    it('用户提活动/跟进记录 → query_customer_activities', async () => {
      const r = await provider.generate({ messages: [{ role: 'user', content: '最近有哪些活动' }] });
      expect(r.toolCalls?.[0]?.name).toBe('query_customer_activities');
    });

    it('用户提项目 → query_projects', async () => {
      const r = await provider.generate({ messages: [{ role: 'user', content: '我有哪些项目' }] });
      expect(r.toolCalls?.[0]?.name).toBe('query_projects');
    });

    it('用户提审批 → query_approval_requests', async () => {
      const r = await provider.generate({ messages: [{ role: 'user', content: '有没有待我审批的请求' }] });
      expect(r.toolCalls?.[0]?.name).toBe('query_approval_requests');
    });

    it('用户提待办/事件 → query_events', async () => {
      const r = await provider.generate({ messages: [{ role: 'user', content: '查看今天的事件' }] });
      expect(r.toolCalls?.[0]?.name).toBe('query_events');
    });

    it('generate 返回 usage 0 计数', async () => {
      const r = await provider.generate({ messages: [{ role: 'user', content: '你好' }] });
      expect(r.usage).toEqual({ promptTokens: 0, completionTokens: 0 });
    });

    it('toolCall id 每次自增（call_demo_N）', async () => {
      const a = await provider.generate({ messages: [{ role: 'user', content: '分析客户风险' }] });
      const b = await provider.generate({ messages: [{ role: 'user', content: '看看最近的订单' }] });
      const idA = a.toolCalls![0].id;
      const idB = b.toolCalls![0].id;
      expect(idA).toMatch(/^call_demo_\d+$/);
      expect(idB).not.toBe(idA);
    });

    it('双引号/单引号客户名 → 提取为 keyword', async () => {
      const dq = await provider.generate({ messages: [{ role: 'user', content: '分析 "蓝湾地产" 的风险' }] });
      expect(JSON.parse(dq.toolCalls![0].arguments).keyword).toBe('蓝湾地产');
      const sq = await provider.generate({ messages: [{ role: 'user', content: "分析 '晨星' 的风险" }] });
      expect(JSON.parse(sq.toolCalls![0].arguments).keyword).toBe('晨星');
    });

    it('客户名无引号紧跟 → 走否定前瞻抽取规则', async () => {
      const r = await provider.generate({ messages: [{ role: 'user', content: '分析客户acme的风险' }] });
      const kw = JSON.parse(r.toolCalls![0].arguments).keyword;
      expect(kw).toBeDefined();
      expect(String(kw)).toContain('acme');
    });

    it('extractTitle：无「创建X」片段 → 用默认标题', async () => {
      const r = await provider.generate({ messages: [{ role: 'user', content: 'please create a followup task' }] });
      const args = JSON.parse(r.toolCalls![0].arguments);
      expect(args.title).toBe('跟进高风险客户');
    });

    it('extractTitle：标题未含「跟进」时自动补前缀', async () => {
      const r = await provider.generate({ messages: [{ role: 'user', content: '创建任务提醒' }] });
      const args = JSON.parse(r.toolCalls![0].arguments);
      expect(args.title).toBe('跟进任务提醒');
    });

    it('历史含 query_customers 命中 → 后续写操作复用该客户 id', async () => {
      const msgs: ChatMessage[] = [
        { role: 'user', content: '分析客户' },
        { role: 'assistant', content: '', tool_calls: [{ id: 'c1', name: 'query_customers', arguments: '{}' }] },
        { role: 'tool', tool_call_id: 'c1', content: JSON.stringify({ success: true, data: { items: [{ id: 77, name: '东湖' }] } }) },
        { role: 'user', content: '好的 给这家建个跟进任务' },
      ];
      const r = await provider.generate({ messages: msgs });
      expect(r.toolCalls?.[0]?.name).toBe('create_followup_task');
      expect(JSON.parse(r.toolCalls![0].arguments).customerId).toBe(77);
    });
  });

  // ── 补充覆盖：工具结果后处理（decideAfterTool）各 case ─────────────────────
  describe('补充覆盖：decideAfterTool 分支', () => {
    it('仅 tool 消息、无前置 assistant 工具调用 → 已完成兜底', async () => {
      const r = await provider.generate({ messages: [{ role: 'tool', tool_call_id: 'x', content: '{}' }] });
      expect(r.content).toContain('这一步已完成');
    });

    it('query_customers 空结果 → 提示无匹配客户', async () => {
      const r = await provider.generate({
        messages: toolRound('query_customers', { success: true, data: { items: [] } }),
      });
      expect(r.content).toContain('没有找到匹配的客户');
    });

    it('query_customers 结果非 JSON → 宽松解析兜底为无匹配', async () => {
      const r = await provider.generate({ messages: toolRound('query_customers', 'not-json') });
      expect(r.content).toContain('没有找到匹配的客户');
    });

    it('query_customers 命中但客户无 name → 以「客户 #id」兜底命名并分析', async () => {
      const r = await provider.generate({
        messages: toolRound('query_customers', { success: true, data: { items: [{ id: 99 }] } }),
      });
      expect(r.toolCalls?.[0]?.name).toBe('analyze_customer_risk');
      expect(JSON.parse(r.toolCalls![0].arguments).customerId).toBe(99);
      expect(r.content).toContain('客户 #99');
    });

    it('analyze_customer_risk 无 data → 完成兜底文案', async () => {
      const r = await provider.generate({ messages: toolRound('analyze_customer_risk', { success: true }) });
      expect(r.content).toContain('风险分析完成');
    });

    it('analyze_customer_risk 仅 level、无 score/reasons → 默认占位', async () => {
      const r = await provider.generate({
        messages: toolRound('analyze_customer_risk', { success: true, data: { level: 'low' } }),
      });
      expect(r.content).toContain('风险等级：low');
      expect(r.content).toContain('评分 -');
      expect(r.content).not.toContain('主要依据');
    });

    it('工具参数 arguments 非法 JSON → args 兜底为空不抛', async () => {
      const msgs: ChatMessage[] = [
        {
          role: 'assistant',
          content: '',
          tool_calls: [{ id: 'c', name: 'analyze_customer_risk', arguments: '{bad' }],
        },
        {
          role: 'tool',
          tool_call_id: 'c',
          content: JSON.stringify({ success: true, data: { level: 'high', score: 3, reasons: ['x'] } }),
        },
      ];
      const r = await provider.generate({ messages: msgs });
      expect(r.content).toContain('风险等级：high');
    });

    it('create_followup_task 未通过（success 假）→ 确认门控文案', async () => {
      const r = await provider.generate({ messages: toolRound('create_followup_task', { success: false }) });
      expect(r.content).toContain('确认门控');
    });

    it.each([
      'query_customer_orders',
      'query_customer_activities',
      'query_customer_contacts',
      'query_customer_opportunities',
      'summarize_customer_360',
      'analyze_sales_pipeline',
      'query_projects',
      'query_project_tasks',
      'query_approval_requests',
      'query_events',
    ])('%s 结果 → 汇总「共 N 条」', async (tool) => {
      const r = await provider.generate({
        messages: toolRound(tool, { success: true, data: { total: 3, rows: [{ id: 1 }] } }),
      });
      expect(r.content).toContain('共 3 条');
    });

    it('未知工具名 + 超长原始结果 → 默认文案 + truncate 省略', async () => {
      const long = 'x'.repeat(400);
      const r = await provider.generate({ messages: toolRound('some_unknown_tool', long) });
      expect(r.content).toContain('已执行 some_unknown_tool');
      expect(r.content).toContain('…');
      expect(r.content.length).toBeLessThan(400);
    });
  });

  // ── 补充覆盖：流式长文本分块 ───────────────────────────────────────────────
  describe('补充覆盖：stream 长文本', () => {
    it('长文本 → 拆成多段 text 且拼接完整，以 done 收尾', async () => {
      const messages: ChatMessage[] = [{ role: 'user', content: '你好' }];
      const text: string[] = [];
      const types: string[] = [];
      for await (const chunk of provider.stream({ messages })) {
        types.push(chunk.type);
        if (chunk.type === 'text' && chunk.content) text.push(chunk.content);
      }
      expect(text.length).toBeGreaterThan(1);
      expect(text.join('')).toContain('演示模式');
      expect(types[types.length - 1]).toBe('done');
    });
  });

  // ── 通用生成模块 create 路由（Proof Card R7，2026-09-08）──────────────────
  describe('通用生成模块 create 路由（--spec 生成工具）', () => {
    const createInvoiceDef = {
      type: 'function',
      function: {
        name: 'create_invoice',
        description: '创建发票',
        parameters: {
          type: 'object',
          properties: {
            invoiceNo: { type: 'string' },
            customerName: { type: 'string' },
            amount: { type: 'integer' },
          },
          required: ['invoiceNo'],
        },
      },
    } as ToolDefinition;

    it('创建意图 + 必填参数=值 → 路由 create_invoice 并解析参数', async () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: '请创建一张发票：invoiceNo=INV-X1，customerName=张三，amount=1200，status=draft。' },
      ];
      const r = await provider.generate({ messages, tools: [createInvoiceDef] });
      expect(r.toolCalls?.[0]?.name).toBe('create_invoice');
      const args = JSON.parse(r.toolCalls![0].arguments);
      expect(args.invoiceNo).toBe('INV-X1');
      expect(args.amount).toBe(1200);
    });

    it('创建意图但缺必填参数 → 不路由，回落默认文案', async () => {
      const messages: ChatMessage[] = [{ role: 'user', content: '请创建一张发票' }];
      const r = await provider.generate({ messages, tools: [createInvoiceDef] });
      expect(r.toolCalls ?? []).toHaveLength(0);
      expect(r.content).toContain('演示模式');
    });

    it('旗舰跟进话术不被通用路由劫持（denylist + 无 k=v）', async () => {
      const followupDef = {
        type: 'function',
        function: {
          name: 'create_followup_task',
          description: '创建跟进任务',
          parameters: {
            type: 'object',
            properties: { customerId: { type: 'integer' }, title: { type: 'string' } },
            required: ['customerId', 'title'],
          },
        },
      } as ToolDefinition;
      const messages: ChatMessage[] = [{ role: 'user', content: '为「蓝湾地产」创建跟进任务：跟进签约' }];
      const r = await provider.generate({ messages, tools: [followupDef, createInvoiceDef] });
      expect(r.toolCalls?.[0]?.name).toBe('create_followup_task');
    });
  });
});
