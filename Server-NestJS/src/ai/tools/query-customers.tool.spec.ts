import { QueryCustomersTool } from './query-customers.tool';

describe('QueryCustomersTool', () => {
  const crmService = { listCustomers: jest.fn() } as any;
  const tool = new QueryCustomersTool(crmService);

  beforeEach(() => crmService.listCustomers.mockReset());

  it('按 userId 查询并返回精简客户列表', async () => {
    crmService.listCustomers.mockResolvedValue({
      total: 1,
      items: [{ id: 1, name: '辰光建材', company: '辰光', status: 'active', riskLevel: 'high', email: 'c@h.cn' }],
    });
    const result = await tool.execute({ status: 'active' }, '1');
    expect(crmService.listCustomers).toHaveBeenCalledWith(1, { status: 'active', riskLevel: undefined, keyword: undefined });
    expect(result.success).toBe(true);
    expect((result.data as any).items[0].name).toBe('辰光建材');
  });

  it('服务异常 → success:false', async () => {
    crmService.listCustomers.mockRejectedValue(new Error('db down'));
    const result = await tool.execute({}, '1');
    expect(result.success).toBe(false);
    expect(result.error).toContain('db down');
  });
});
