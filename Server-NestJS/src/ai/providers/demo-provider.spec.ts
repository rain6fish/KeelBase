/**
 * Demo Provider（确定性演示）单元测试
 *
 * 覆盖黄金流程决策：用户问 → query_customers → analyze_customer_risk → 总结；
 * 创建跟进任务（写，触发确认门控）；流式输出格式。
 */

import { DemoProvider } from './demo-provider';
import { ChatMessage } from '../interfaces/llm-provider.interface';

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
});
