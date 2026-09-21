// SPDX-License-Identifier: Apache-2.0

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { OrgDirectoryService } from './org-directory.service';
import { Organization } from './organization.entity';
import { Department } from './department.entity';
import { OrgMember } from './org-member.entity';
import { OrgMemberRole } from './org-member-role.enum';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FlowTask } from '../flows/entities/flow-task.entity';

/**
 * 组织通讯录单测（阶段 3 第十五刀从 \`org.service.spec.ts\` 整段搬来，**断言一字未改**；
 * PC-3 冻结契约原本一条覆盖三种形状，因服务归属拆成两半，①③ 在本文件、② 留在原文件）。
 */
function mockQB(overrides: Record<string, unknown> = {}) {
  const qb: any = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getCount: jest.fn().mockResolvedValue(0),
    getMany: jest.fn().mockResolvedValue([]),
    ...overrides,
  };
  return qb;
}

function mockRepo(overrides: Record<string, unknown> = {}) {
  const qb = mockQB();
  return {
    create: jest.fn((x) => x ?? {}),
    save: jest.fn((x) => Promise.resolve(x)),
    findOne: jest.fn().mockResolvedValue(null),
    find: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    createQueryBuilder: jest.fn(() => qb),
    ...overrides,
  };
}

describe('OrgDirectoryService', () => {
  let service: OrgDirectoryService;
  let orgs: ReturnType<typeof mockRepo>;
  let depts: ReturnType<typeof mockRepo>;
  let members: ReturnType<typeof mockRepo>;
  let flowTask: ReturnType<typeof mockRepo>;

  beforeEach(async () => {
    orgs = mockRepo();
    depts = mockRepo();
    members = mockRepo();
    flowTask = mockRepo();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrgDirectoryService,
        { provide: getRepositoryToken(Organization), useValue: orgs },
        { provide: getRepositoryToken(Department), useValue: depts },
        { provide: getRepositoryToken(OrgMember), useValue: members },
        { provide: getRepositoryToken(FlowTask), useValue: flowTask },
      ],
    }).compile();

    service = module.get(OrgDirectoryService);
  });

  it('getOrgApprovalTaskStats：A 在 org1 只见 org1 成员，不见 org2（B）', async () => {
    // _myMember(A=1) → org1
    members.findOne.mockResolvedValue({ id: 1, userId: 1, orgId: 1, role: 'member' });
    // org1 成员列表：A(1)、C(2)；org2 成员 B(3) 不在其中
    members.find.mockResolvedValue([
      { userId: 1, user: { nickname: 'CrossA' }, dept: null },
      { userId: 2, user: { nickname: 'CrossC' }, dept: null },
    ]);
    // 审批任务：org1 成员 + 一条 org2 成员 B 的任务（若泄漏应被排除）
    flowTask.createQueryBuilder.mockReturnValue(
      mockQB({
        getMany: jest.fn().mockResolvedValue([
          { assigneeId: 1, status: 'pending' },
          { assigneeId: 2, status: 'approved' },
          { assigneeId: 3, status: 'pending' }, // org2 的 B
        ]),
      }),
    );

    const res = await service.getOrgApprovalTaskStats(1);

    expect(res.orgId).toBe(1);
    const names = res.members.map((m) => m.nickname);
    expect(names).toContain('CrossA');
    expect(names).toContain('CrossC');
    expect(names).not.toContain('CrossB'); // org2 成员不出现
    // 成员查询按调用者所属 org 过滤
    expect(members.find).toHaveBeenCalledWith(expect.objectContaining({ where: { orgId: 1 } }));
  });

  it('getOrgApprovalTaskStats：B 在 org2 只见 org2 成员（反向隔离）', async () => {
    members.findOne.mockResolvedValue({ id: 9, userId: 3, orgId: 2, role: 'member' }); // B → org2
    members.find.mockResolvedValue([{ userId: 3, user: { nickname: 'CrossB' }, dept: null }]);
    flowTask.createQueryBuilder.mockReturnValue(mockQB({ getMany: jest.fn().mockResolvedValue([]) }));

    const res = await service.getOrgApprovalTaskStats(3);

    expect(res.orgId).toBe(2);
    expect(res.members.map((m) => m.nickname)).toEqual(['CrossB']);
    expect(members.find).toHaveBeenCalledWith(expect.objectContaining({ where: { orgId: 2 } }));
  });

  // ── 组织 ──

  it('我的组织：返回部门路径', async () => {
    members.findOne.mockResolvedValue({ id: 1, orgId: 1, userId: 9, deptId: 2, role: OrgMemberRole.MEMBER });
    orgs.findOne.mockResolvedValue({ id: 1, name: 'Acme', description: 'd' });
    depts.find.mockResolvedValue([
      { id: 1, name: '总部', parentId: null },
      { id: 2, name: '研发部', parentId: 1 },
    ]);
    const result = await service.getMyOrg(9);
    expect(result.deptPath).toEqual(['总部', '研发部']);
    expect(result.org.name).toBe('Acme');
  });

  it('我的组织：无部门路径为空；非成员抛 NotFound', async () => {
    members.findOne.mockResolvedValueOnce({ id: 1, orgId: 1, userId: 9, deptId: null, role: OrgMemberRole.MEMBER });
    orgs.findOne.mockResolvedValue({ id: 1, name: 'Acme' });
    const result = await service.getMyOrg(9);
    expect(result.deptPath).toEqual([]);

    members.findOne.mockResolvedValueOnce(null);
    await expect(service.getMyOrg(99)).rejects.toThrow(NotFoundException);
  });

  it('组织树：构建层级结构', async () => {
    members.findOne.mockResolvedValue({ id: 1, orgId: 1, userId: 9, deptId: null, role: OrgMemberRole.MEMBER });
    depts.find.mockResolvedValue([
      { id: 1, name: '总部', parentId: null },
      { id: 2, name: '研发部', parentId: 1 },
      { id: 3, name: '独立组', parentId: null },
    ]);
    members.find.mockResolvedValue([
      { deptId: 2 }, { deptId: 2 }, { deptId: 1 },
    ]);
    const tree = await service.getMyTree(9);
    expect(tree).toHaveLength(2);
    const root = tree.find((n) => n.id === 1) as any;
    expect(root.children).toHaveLength(1);
    expect(root.children[0]).toMatchObject({ id: 2, memberCount: 2 });
    expect((tree.find((n) => n.id === 3) as any).memberCount).toBe(0);
  });

  it('通讯录：脱敏白名单（无 email/phone/username）', async () => {
    members.findOne.mockResolvedValue({ id: 1, orgId: 1, userId: 9, deptId: null, role: OrgMemberRole.MEMBER });
    members.find.mockResolvedValue([
      {
        userId: 5, role: OrgMemberRole.MEMBER,
        user: { nickname: 'Alice', avatarUrl: 'http://a', username: 'alice', email: 'x@y.z' },
        dept: { name: '研发部' },
      },
    ]);
    const list = await service.listMyMembers(9);
    expect(list[0]).toEqual({ id: 5, nickname: 'Alice', avatarUrl: 'http://a', role: OrgMemberRole.MEMBER, deptName: '研发部' });
    expect(list[0]).not.toHaveProperty('email');
    expect(list[0]).not.toHaveProperty('username');
  });

  // ── 补充覆盖：update 成功路径 / 审批待办统计 ───────────────────────────────

  it('getOrgApprovalTaskStats：按成员聚合 pending/processed 审批任务', async () => {
    members.findOne.mockResolvedValue({ id: 1, orgId: 1, userId: 9, role: OrgMemberRole.MEMBER });
    members.find.mockResolvedValue([
      { userId: 5, role: OrgMemberRole.MEMBER, user: { nickname: 'Alice' }, dept: { name: '研发部' } },
      { userId: 6, role: OrgMemberRole.MEMBER, user: { nickname: 'Bob' }, dept: null },
    ]);
    flowTask.createQueryBuilder().getMany.mockResolvedValue([
      { assigneeId: 5, status: 'pending' },
      { assigneeId: 5, status: 'approved' },
      { assigneeId: 6, status: 'rejected' },
      { assigneeId: 6, status: 'pending' },
    ]);
    const result = await service.getOrgApprovalTaskStats(9);
    expect(result.orgId).toBe(1);
    const alice = result.members.find((m) => m.nickname === 'Alice')!;
    expect(alice).toMatchObject({ pending: 1, processed: 1, total: 2, deptName: '研发部' });
    const bob = result.members.find((m) => m.nickname === 'Bob')!;
    expect(bob).toMatchObject({ pending: 1, processed: 1, total: 2 });
  });

  // ── 权限-2 部门物化路径（ancestors）──
  it('PC-3 wire 形状冻结：① GET /org/my → org-membership-scope；③ GET /org/my/members → org-member-public（成员视角两形）', async () => {
    // ① GET /org/my → org-membership-scope（数据范围描述子）
    members.findOne.mockResolvedValue({ orgId: 1, role: OrgMemberRole.OWNER, deptId: 2 });
    orgs.findOne.mockResolvedValue({ id: 1, name: 'Acme', description: 'd' });
    depts.find.mockResolvedValue([
      { id: 1, name: '总部', parentId: null },
      { id: 2, name: '研发部', parentId: 1 },
    ]);
    const scopeSchema = JSON.parse(
      readFileSync(resolve(__dirname, '../../specs/protocol/schemas/v1/org-membership-scope.schema.json'), 'utf8'),
    ) as { properties: Record<string, unknown> & { org: { properties: Record<string, unknown> } } };
    const my = await service.getMyOrg(7);
    expect(Object.keys(my).sort()).toEqual(Object.keys(scopeSchema.properties).sort());
    expect(Object.keys(my.org).sort()).toEqual(Object.keys(scopeSchema.properties.org.properties).sort());
    expect(my.deptPath).toEqual(['总部', '研发部']);



    // ③ GET /org/my/members item → org-member-public（白名单：无 email/phone/username）
    members.find.mockResolvedValue([
      {
        userId: 5,
        role: OrgMemberRole.MEMBER,
        user: { nickname: 'Alice', avatarUrl: null },
        dept: { name: '研发部' },
      },
    ]);
    const pub = await service.listMyMembers(7);
    const pubSchema = JSON.parse(
      readFileSync(resolve(__dirname, '../../specs/protocol/schemas/v1/org-member-public.schema.json'), 'utf8'),
    ) as { properties: Record<string, unknown> };
    expect(Object.keys(pub[0]).sort()).toEqual(Object.keys(pubSchema.properties).sort());
  });

});
