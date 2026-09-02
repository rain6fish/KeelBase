// SPDX-License-Identifier: Apache-2.0

import { DetectIdleCustomersTool } from './detect-idle-customers.tool';

describe('DetectIdleCustomersTool', () => {
  const crmService = { detectIdleCustomers: jest.fn() } as any;
  const tool = new DetectIdleCustomersTool(crmService);

  beforeEach(() => crmService.detectIdleCustomers.mockReset());

  it('返回长期未跟进客户（默认 30 天阈值）', async () => {
    crmService.detectIdleCustomers.mockResolvedValue({
      thresholdDays: 30,
      count: 1,
      items: [
        {
          customerId: 5,
          customerName: '辰光建材',
          company: '辰光集团',
          status: 'active',
          riskLevel: 'medium',
          lastContactAt: '2026-07-20T08:00:00.000Z',
          idleDays: 43,
          neverContacted: false,
        },
      ],
    });
    const result = await tool.execute({}, '7');
    expect(crmService.detectIdleCustomers).toHaveBeenCalledWith(7, 30, 20);
    expect(result.success).toBe(true);
    expect((result.data as any).thresholdDays).toBe(30);
    expect((result.data as any).items[0].customerName).toBe('辰光建材');
  });

  it('传 minIdleDays 与 limit 透传', async () => {
    crmService.detectIdleCustomers.mockResolvedValue({ thresholdDays: 60, count: 0, items: [] });
    const result = await tool.execute({ minIdleDays: 60, limit: 10 }, '7');
    expect(crmService.detectIdleCustomers).toHaveBeenCalledWith(7, 60, 10);
    expect(result.success).toBe(true);
  });

  it('minIdleDays 非法 → 参数错误', async () => {
    const result = await tool.execute({ minIdleDays: 0 }, '1');
    expect(result.success).toBe(false);
    expect(result.error).toContain('≥1');
  });

  it('服务异常 → success:false', async () => {
    crmService.detectIdleCustomers.mockRejectedValue(new Error('no access'));
    const result = await tool.execute({}, '1');
    expect(result.success).toBe(false);
    expect(result.error).toContain('no access');
  });
});
