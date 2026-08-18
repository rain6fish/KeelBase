import { QueryCustomerOrdersTool } from './query-customer-orders.tool';

describe('QueryCustomerOrdersTool（CRM 只读工具）', () => {
  const crmService = { listOrders: jest.fn() } as any;
  const tool = new QueryCustomerOrdersTool(crmService);

  beforeEach(() => crmService.listOrders.mockReset());

  it('返回订单映射（按 userId 限定数据范围）', async () => {
    crmService.listOrders.mockResolvedValue([
      { id: 1, amount: 1000, status: 'overdue', orderDate: '2026-07-01', dueDate: '2026-07-15' },
    ]);
    const result = await tool.execute({ customerId: 2 }, '7');
    expect(crmService.listOrders).toHaveBeenCalledWith(2, 7);
    expect(result.success).toBe(true);
    expect(result.data).toEqual([{ id: 1, amount: 1000, status: 'overdue', orderDate: '2026-07-01', dueDate: '2026-07-15' }]);
  });

  it('customerId 非法 → 参数错误', async () => {
    const result = await tool.execute({ customerId: 'abc' }, '1');
    expect(result.success).toBe(false);
    expect(result.error).toContain('必须是数字');
  });

  it('服务异常 → success:false', async () => {
    crmService.listOrders.mockRejectedValue(new Error('客户不存在或无权访问'));
    const result = await tool.execute({ customerId: 9 }, '1');
    expect(result.success).toBe(false);
    expect(result.error).toContain('无权访问');
  });
});
