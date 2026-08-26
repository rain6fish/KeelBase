import { SummarizeCustomerTool } from './summarize-customer.tool';

const base360 = {
  customer: { name: '辰光建材', status: 'active', riskLevel: 'high' },
  orders: [
    { amount: 2800000, status: 'overdue' },
    { amount: 500000, status: 'paid' },
  ],
  activities: [{ id: 1 }],
  tasks: [{ status: 'pending' }, { status: 'completed' }],
  risks: [{ level: 'high' }, { level: 'low', resolvedAt: new Date() }],
  opportunities: [
    { name: 'Q3 续约扩展', amount: 200000, stage: 'negotiation', probability: 70 },
  ],
};

describe('SummarizeCustomerTool（Customer 360 AI Summary）', () => {
  it('聚合全景 + LLM 生成自然摘要', async () => {
    const crm = { getCustomer360Data: jest.fn().mockResolvedValue(base360) };
    const provider = { generate: jest.fn().mockResolvedValue({ content: '辰光建材：280 万逾期订单，高风险，1 个在谈机会，建议催款并跟进续约。' }) };
    const factory = { getProvider: jest.fn().mockReturnValue(provider) };
    const tool = new SummarizeCustomerTool(crm as any, factory, 'deepseek');

    const res = await tool.execute({ customerId: 1 }, '1');

    expect(res.success).toBe(true);
    expect((res.data as any).summary).toContain('辰光建材');
    // 结构化全景含机会/逾期统计
    expect((res.data as any).structured.overdueOrders).toBe(1);
    expect((res.data as any).structured.opportunities).toHaveLength(1);
    expect(crm.getCustomer360Data).toHaveBeenCalledWith(1, 1);
  });

  it('LLM 不可用 → 降级返回结构化全景（不崩）', async () => {
    const crm = { getCustomer360Data: jest.fn().mockResolvedValue(base360) };
    // 无 providerFactory → summary null
    const tool = new SummarizeCustomerTool(crm as any);
    const res = await tool.execute({ customerId: 1 }, '1');
    expect(res.success).toBe(true);
    expect((res.data as any).summary).toBeNull();
    expect((res.data as any).structured.customer).toBe('辰光建材');
  });

  it('越权/不存在 → 拒绝', async () => {
    const crm = { getCustomer360Data: jest.fn().mockRejectedValue(new Error('客户不存在或无权访问')) };
    const tool = new SummarizeCustomerTool(crm as any);
    const res = await tool.execute({ customerId: 999 }, '2');
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/无权/);
  });
});
