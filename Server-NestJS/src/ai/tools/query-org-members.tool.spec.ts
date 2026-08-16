import { QueryOrgMembersTool } from './query-org-members.tool';

describe('QueryOrgMembersTool (ORG-5)', () => {
  let tool: QueryOrgMembersTool;
  let orgService: { getUserOrgId: jest.Mock; listMyMembers: jest.Mock };

  beforeEach(() => {
    orgService = {
      getUserOrgId: jest.fn().mockResolvedValue(2),
      listMyMembers: jest.fn().mockResolvedValue([
        { id: 1, nickname: 'Alice', deptName: '研发部', role: 'admin' },
        { id: 2, nickname: 'Bob', deptName: '市场部', role: 'member' },
      ]),
    };
    tool = new QueryOrgMembersTool(orgService as any);
  });

  it('非组织成员 → 错误', async () => {
    orgService.getUserOrgId.mockResolvedValue(null);
    const res = await tool.execute({}, '99');
    expect(res.success).toBe(false);
    expect(res.error).toContain('不是任何组织的成员');
  });

  it('返回组织成员目录（脱敏字段）', async () => {
    const res = await tool.execute({}, '1');
    expect(res.success).toBe(true);
    const data = res.data as { orgId: number; members: any[] };
    expect(data.orgId).toBe(2);
    expect(data.members).toHaveLength(2);
    expect(data.members[0]).toEqual({ nickname: 'Alice', deptName: '研发部', role: 'admin' });
  });

  it('按部门名筛选', async () => {
    const res = await tool.execute({ deptName: '市场部' }, '1');
    const data = res.data as { members: any[] };
    expect(data.members).toHaveLength(1);
    expect(data.members[0].nickname).toBe('Bob');
  });

  it('工具定义含参数 schema', () => {
    const def = tool.toToolDefinition();
    expect(def.function.name).toBe('query_org_members');
  });
});
