// SPDX-License-Identifier: Apache-2.0

import { AnalyzeSalesPipelineTool } from './analyze-sales-pipeline.tool';

const opps = [
  { name: 'A 续约', amount: 100000, stage: 'negotiation', probability: 70, expectedCloseDate: new Date(Date.now() + 5 * 86400000) },
  { name: 'B 新客', amount: 50000, stage: 'qualification', probability: 30, expectedCloseDate: new Date(Date.now() + 60 * 86400000) },
  { name: 'C 大单', amount: 200000, stage: 'won', probability: 100, expectedCloseDate: null },
  { name: 'D 流失', amount: 30000, stage: 'lost', probability: 0, expectedCloseDate: null },
];

describe('AnalyzeSalesPipelineTool（AI Sales Agent 管道分析）', () => {
  it('聚合管道 + 加权金额 + 阶段分布 + 快到期', async () => {
    const crm = { listAllOpportunities: jest.fn().mockResolvedValue(opps) };
    const tool = new AnalyzeSalesPipelineTool(crm as any);

    const res = await tool.execute({}, '1');

    expect(res.success).toBe(true);
    const s = (res.data as any).structured;
    expect(s.totalOpportunities).toBe(4);
    expect(s.won).toBe(1);
    expect(s.lost).toBe(1);
    // 管道金额 = 未结（A+B）= 150000；加权 = 100000*0.7 + 50000*0.3 = 85000
    expect(s.pipelineAmount).toBe(150000);
    expect(s.weightedAmount).toBe(85000);
    expect(s.wonAmount).toBe(200000);
    expect(s.byStage.negotiation.count).toBe(1);
    expect(s.soonClosing).toHaveLength(1); // A 快到期（5 天），B 60 天
    expect(crm.listAllOpportunities).toHaveBeenCalledWith(1);
  });

  it('LLM 生成洞察（降级结构化）', async () => {
    const crm = { listAllOpportunities: jest.fn().mockResolvedValue(opps) };
    const provider = { generate: jest.fn().mockResolvedValue({ content: '管道健康：150k 在谈，8.5w 加权，建议优先跟 A 续约。' }) };
    const factory = { getProvider: jest.fn().mockReturnValue(provider) };
    const tool = new AnalyzeSalesPipelineTool(crm as any, factory, 'deepseek');

    const res = await tool.execute({}, '1');
    expect((res.data as any).insight).toContain('管道');
  });

  it('无数据 → 全零管道（不崩）', async () => {
    const crm = { listAllOpportunities: jest.fn().mockResolvedValue([]) };
    const tool = new AnalyzeSalesPipelineTool(crm as any);
    const res = await tool.execute({}, '1');
    expect(res.success).toBe(true);
    expect((res.data as any).structured.pipelineAmount).toBe(0);
    expect((res.data as any).structured.byStage).toEqual({});
  });
});
