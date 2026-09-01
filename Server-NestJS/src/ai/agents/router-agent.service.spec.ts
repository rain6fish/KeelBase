// SPDX-License-Identifier: Apache-2.0

import { RouterAgent } from './router-agent.service';

const mockProvider = {
  name: 'deepseek',
  displayName: 'DeepSeek',
  availableModels: ['deepseek-v4-flash'],
  generate: jest.fn(),
};

describe('RouterAgent', () => {
  const agent = new RouterAgent();

  beforeEach(() => {
    jest.clearAllMocks();
    mockProvider.generate.mockResolvedValue({ content: 'chat' });
  });

  it('should classify delegate for 综合分析/分别 phrasing', async () => {
    expect(await agent.classify('帮我分别分析日程和统计', mockProvider as any)).toBe('delegate');
    expect(await agent.classify('综合分析本周安排', mockProvider as any)).toBe('delegate');
    expect(await agent.classify('盘点一下我的事件和待办', mockProvider as any)).toBe('delegate');
    expect(mockProvider.generate).not.toHaveBeenCalled();
  });

  it('should still classify analyze for simple analyze', async () => {
    expect(await agent.classify('分析我的事件趋势', mockProvider as any)).toBe('analyze');
  });

  it('should preserve plan for requests combining 安排+分析 (existing behavior)', async () => {
    // plan 关键词在 analyze 之前，含「安排」的请求维持 plan（与 AI-10 之前一致）
    expect(await agent.classify('分析我的工作安排趋势', mockProvider as any)).toBe('plan');
  });

  it('should still classify plan for simple 安排 requests', async () => {
    expect(await agent.classify('帮我安排下周的会议', mockProvider as any)).toBe('plan');
  });

  it('should preserve navigate priority', async () => {
    expect(await agent.classify('打开设置', mockProvider as any)).toBe('navigate');
  });

  it('should accept delegate from LLM fallback', async () => {
    mockProvider.generate.mockResolvedValue({ content: 'delegate' });
    // 不含任何关键词 → 走 LLM 分类
    const result = await agent.classify('综合一下看看接下来怎么推进', mockProvider as any);
    expect(result).toBe('delegate');
    expect(mockProvider.generate).toHaveBeenCalled();
  });
});
