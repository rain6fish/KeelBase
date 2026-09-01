// SPDX-License-Identifier: Apache-2.0

import { AnalyzeCustomerRiskTool } from './analyze-customer-risk.tool';

describe('AnalyzeCustomerRiskTool', () => {
  const crmService = { analyzeRisk: jest.fn() } as any;
  const tool = new AnalyzeCustomerRiskTool(crmService);

  beforeEach(() => crmService.analyzeRisk.mockReset());

  it('返回风险等级 + 理由（供 LLM 判断跟进优先级）', async () => {
    crmService.analyzeRisk.mockResolvedValue({
      level: 'high',
      score: 7,
      reasons: ['1 笔订单逾期（金额 ¥450000.00）'],
      dataPoints: { orderCount: 3, overdueOrders: 1, openRisks: 1, lateTasks: 0, totalAmount: 650000 },
    });
    const result = await tool.execute({ customerId: 1 }, '7');
    expect(crmService.analyzeRisk).toHaveBeenCalledWith(1, 7);
    expect(result.success).toBe(true);
    expect((result.data as any).level).toBe('high');
  });

  it('customerId 非法 → 参数错误', async () => {
    const result = await tool.execute({ customerId: 'abc' }, '1');
    expect(result.success).toBe(false);
    expect(result.error).toContain('必须是数字');
  });

  it('服务异常 → success:false', async () => {
    crmService.analyzeRisk.mockRejectedValue(new Error('no access'));
    const result = await tool.execute({ customerId: 9 }, '1');
    expect(result.success).toBe(false);
    expect(result.error).toContain('no access');
  });
});
