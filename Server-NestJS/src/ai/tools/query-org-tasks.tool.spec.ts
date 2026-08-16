import { QueryOrgTasksTool } from './query-org-tasks.tool';

describe('QueryOrgTasksTool (ORG-5)', () => {
  let tool: QueryOrgTasksTool;
  let orgService: { getUserOrgId: jest.Mock; getOrgApprovalTaskStats: jest.Mock };

  beforeEach(() => {
    orgService = {
      getUserOrgId: jest.fn().mockResolvedValue(3),
      getOrgApprovalTaskStats: jest.fn().mockResolvedValue({
        orgId: 3,
        members: [
          { nickname: 'Alice', deptName: '研发部', pending: 2, processed: 5, total: 7 },
          { nickname: 'Bob', deptName: '市场部', pending: 0, processed: 1, total: 1 },
        ],
      }),
    };
    tool = new QueryOrgTasksTool(orgService as any);
  });

  it('非组织成员 → 错误', async () => {
    orgService.getUserOrgId.mockResolvedValue(null);
    const res = await tool.execute({}, '99');
    expect(res.success).toBe(false);
    expect(res.error).toContain('不是任何组织的成员');
    expect(orgService.getOrgApprovalTaskStats).not.toHaveBeenCalled();
  });

  it('返回组织审批待办统计（组织边界数据）', async () => {
    const res = await tool.execute({}, '1');
    expect(res.success).toBe(true);
    const data = res.data as { orgId: number; members: any[] };
    expect(data.orgId).toBe(3);
    expect(data.members.find((m) => m.nickname === 'Alice').pending).toBe(2);
    expect(data.members.find((m) => m.nickname === 'Alice').total).toBe(7);
    expect(orgService.getOrgApprovalTaskStats).toHaveBeenCalledWith(1);
  });

  it('工具定义含正确 name', () => {
    expect(tool.name).toBe('query_org_tasks');
    const def = tool.toToolDefinition();
    expect(def.function.name).toBe('query_org_tasks');
  });
});
