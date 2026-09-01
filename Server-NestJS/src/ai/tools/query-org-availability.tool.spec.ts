// SPDX-License-Identifier: Apache-2.0

import { QueryOrgAvailabilityTool } from './query-org-availability.tool';

describe('QueryOrgAvailabilityTool (ORG-5)', () => {
  let tool: QueryOrgAvailabilityTool;
  let orgService: { getUserOrgId: jest.Mock; listMyMembers: jest.Mock };
  let eventsService: { getEventsForRange: jest.Mock };

  beforeEach(() => {
    orgService = {
      getUserOrgId: jest.fn().mockResolvedValue(1),
      listMyMembers: jest.fn().mockResolvedValue([
        { id: 1, nickname: 'Alice', deptName: '研发部', role: 'admin' },
        { id: 2, nickname: 'Bob', deptName: '研发部', role: 'member' },
        { id: 3, nickname: 'Carol', deptName: '市场部', role: 'member' },
      ]),
    };
    eventsService = {
      getEventsForRange: jest.fn().mockResolvedValue([
        { id: 10, title: '周会', userId: 1 },
        { id: 11, title: '评审', userId: 1 },
        { id: 12, title: '客户拜访', userId: 2 },
      ]),
    };
    tool = new QueryOrgAvailabilityTool(orgService as any, eventsService as any);
  });

  it('非组织成员 → 错误', async () => {
    orgService.getUserOrgId.mockResolvedValue(null);
    const res = await tool.execute({}, '99');
    expect(res.success).toBe(false);
    expect(res.error).toContain('不是任何组织的成员');
  });

  it('统计成员事件数（组织边界数据）', async () => {
    const res = await tool.execute({ startDate: '2026-08-01', endDate: '2026-08-31' }, '1');
    expect(res.success).toBe(true);
    const data = res.data as { orgId: number; members: any[] };
    expect(data.orgId).toBe(1);
    expect(data.members.find((m) => m.nickname === 'Alice').eventCount).toBe(2);
    expect(data.members.find((m) => m.nickname === 'Bob').eventCount).toBe(1);
    expect(data.members.find((m) => m.nickname === 'Carol').eventCount).toBe(0);
    expect(eventsService.getEventsForRange).toHaveBeenCalledWith('2026-08-01', '2026-08-31', 1);
  });

  it('未指定日期默认今天', async () => {
    await tool.execute({}, '1');
    const today = new Date();
    const expected = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    expect(eventsService.getEventsForRange).toHaveBeenCalledWith(expected, expected, 1);
  });

  it('工具定义含参数 schema', () => {
    const def = tool.toToolDefinition();
    expect(def.function.name).toBe('query_org_availability');
    expect(def.function.parameters.properties.startDate).toBeDefined();
  });
});
