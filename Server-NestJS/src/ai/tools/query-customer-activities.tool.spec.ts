// SPDX-License-Identifier: Apache-2.0

import { QueryCustomerActivitiesTool } from './query-customer-activities.tool';

describe('QueryCustomerActivitiesTool（CRM 只读工具）', () => {
  const crmService = { listActivities: jest.fn() } as any;
  const tool = new QueryCustomerActivitiesTool(crmService);

  beforeEach(() => crmService.listActivities.mockReset());

  it('返回跟进记录映射（按 userId 限定数据范围）', async () => {
    crmService.listActivities.mockResolvedValue([
      { id: 1, type: 'call', summary: '回访', happenedAt: '2026-08-01' },
    ]);
    const result = await tool.execute({ customerId: 3 }, '7');
    expect(crmService.listActivities).toHaveBeenCalledWith(3, 7);
    expect(result.success).toBe(true);
    expect(result.data).toEqual([{ id: 1, type: 'call', summary: '回访', happenedAt: '2026-08-01' }]);
  });

  it('customerId 非法 → 参数错误', async () => {
    const result = await tool.execute({ customerId: 'abc' }, '1');
    expect(result.success).toBe(false);
    expect(result.error).toContain('必须是数字');
  });

  it('服务异常（非本人客户）→ success:false', async () => {
    crmService.listActivities.mockRejectedValue(new Error('客户不存在或无权访问'));
    const result = await tool.execute({ customerId: 9 }, '1');
    expect(result.success).toBe(false);
    expect(result.error).toContain('无权访问');
  });
});
