// SPDX-License-Identifier: Apache-2.0

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { Like } from 'typeorm';
import { OrgService } from './org.service';
import { Organization } from './organization.entity';
import { Department } from './department.entity';
import { OrgMember } from './org-member.entity';
import { OrgInvite } from './org-invite.entity';
import { OrgMemberRole } from './org-member-role.enum';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { User } from '../common/entities/user.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { FlowRuntimeService } from '../flows/flow-runtime.service';
import { FlowInstance } from '../flows/entities/flow-instance.entity';
import { FlowTask } from '../flows/entities/flow-task.entity';

/** 链式 QueryBuilder mock */
function mockQB(overrides: Record<string, unknown> = {}) {
  const qb: any = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    getCount: jest.fn().mockResolvedValue(0),
    getMany: jest.fn().mockResolvedValue([]),
    getRawMany: jest.fn().mockResolvedValue([]),
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
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
    count: jest.fn().mockResolvedValue(0),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
    softDelete: jest.fn().mockResolvedValue({ affected: 1 }),
    createQueryBuilder: jest.fn(() => qb),
    ...overrides,
  };
}

describe('OrgService', () => {
  let service: OrgService;
  let orgs: ReturnType<typeof mockRepo>;
  let depts: ReturnType<typeof mockRepo>;
  let members: ReturnType<typeof mockRepo>;
  let invites: ReturnType<typeof mockRepo>;
  let users: ReturnType<typeof mockRepo>;
  let flowInst: ReturnType<typeof mockRepo>;
  let flowTask: ReturnType<typeof mockRepo>;
  let notify: { create: jest.Mock };

  beforeEach(async () => {
    orgs = mockRepo();
    depts = mockRepo();
    members = mockRepo();
    invites = mockRepo();
    users = mockRepo();
    flowInst = mockRepo();
    flowTask = mockRepo();
    notify = { create: jest.fn().mockResolvedValue({}) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrgService,
        { provide: getRepositoryToken(Organization), useValue: orgs },
        { provide: getRepositoryToken(Department), useValue: depts },
        { provide: getRepositoryToken(OrgMember), useValue: members },
        { provide: getRepositoryToken(OrgInvite), useValue: invites },
        { provide: getRepositoryToken(User), useValue: users },
        { provide: getRepositoryToken(FlowInstance), useValue: flowInst },
        { provide: getRepositoryToken(FlowTask), useValue: flowTask },
        { provide: NotificationsService, useValue: notify },
        {
          provide: FlowRuntimeService,
          useValue: { start: jest.fn().mockResolvedValue({ id: 1, definitionId: 'org_request_approval' }) },
        },
      ],
    }).compile();

    service = module.get(OrgService);
  });

  // ── ORG-3 数据隔离 ──

  it('getUserOrgId：成员返回 orgId', async () => {
    members.findOne.mockResolvedValue({ id: 1, userId: 5, orgId: 3, role: 'member' });
    expect(await service.getUserOrgId(5)).toBe(3);
  });

  it('getUserOrgId：多组织用户按最早加入确定返回（A10）', async () => {
    members.findOne.mockResolvedValue({ id: 1, userId: 5, orgId: 3, role: 'member' });
    await service.getUserOrgId(5);
    expect(members.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 5 }, order: { id: 'ASC' } }),
    );
  });

  it('getUserOrgId：非成员返回 null（不抛错）', async () => {
    members.findOne.mockResolvedValue(null);
    expect(await service.getUserOrgId(99)).toBeNull();
  });

  // ── ORG-5 组织审批待办统计：跨组织隔离（security-matrix §3 待补项）──

  it('创建组织：重名冲突', async () => {
    orgs.findOne.mockResolvedValue({ id: 1, name: 'Acme' });
    await expect(service.createOrganization({ name: 'Acme' }, 1)).rejects.toThrow(
      ConflictException,
    );
  });

  it('创建组织：成功并自动建 owner 成员', async () => {
    orgs.findOne.mockResolvedValue(null);
    orgs.save.mockResolvedValue({ id: 1, name: 'Acme' });
    await service.createOrganization({ name: 'Acme' }, 9);
    expect(members.save).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: 1, userId: 9, role: OrgMemberRole.OWNER }),
    );
  });

  it('删除组织：有成员时拒绝', async () => {
    orgs.findOne.mockResolvedValue({ id: 1, name: 'Acme' });
    members.count.mockResolvedValue(5);
    await expect(service.removeOrganization(1)).rejects.toThrow(BadRequestException);
    expect(orgs.softDelete).not.toHaveBeenCalled();
  });

  // ── 部门 ──

  it('创建部门：上级部门不属于该组织时报错', async () => {
    orgs.findOne.mockResolvedValue({ id: 1, name: 'Acme' });
    depts.findOne.mockResolvedValue(null); // parent not found
    await expect(
      service.createDepartment(1, { name: '研发部', parentId: 99 }),
    ).rejects.toThrow(BadRequestException);
  });

  it('创建部门：同名冲突', async () => {
    orgs.findOne.mockResolvedValue({ id: 1, name: 'Acme' });
    depts.findOne
      .mockResolvedValueOnce({ id: 10, orgId: 1 }) // parent exists
      .mockResolvedValueOnce({ id: 2, orgId: 1, name: '研发部' }); // dup name
    await expect(service.createDepartment(1, { name: '研发部' })).rejects.toThrow(
      ConflictException,
    );
  });

  it('更新部门：不能挂到自己下面', async () => {
    depts.findOne.mockResolvedValue({ id: 1, orgId: 1, parentId: null });
    await expect(service.updateDepartment(1, { parentId: 1 })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('更新部门：不能挂到自己的子孙下面', async () => {
    depts.findOne
      .mockResolvedValueOnce({ id: 1, orgId: 1, parentId: null }) // the dept
      .mockResolvedValueOnce({ id: 3, orgId: 1 }); // parent 3 exists in org
    depts.find.mockResolvedValue([
      { id: 1, orgId: 1, parentId: null },
      { id: 2, orgId: 1, parentId: 1 },
      { id: 3, orgId: 1, parentId: 2 },
    ]);
    await expect(service.updateDepartment(1, { parentId: 3 })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('删除部门：子孙挂父级、成员脱离', async () => {
    depts.findOne.mockResolvedValue({ id: 2, orgId: 1, parentId: 1 });
    await service.removeDepartment(2);
    expect(depts.update).toHaveBeenCalledWith({ parentId: 2 }, { parentId: 1 });
    expect(members.update).toHaveBeenCalledWith({ deptId: 2 }, { deptId: null });
    expect(depts.softDelete).toHaveBeenCalledWith(2);
  });

  // ── 成员 ──

  it('添加成员：用户不存在', async () => {
    orgs.findOne.mockResolvedValue({ id: 1, name: 'Acme' });
    users.findOne.mockResolvedValue(null);
    await expect(service.addMember(1, { userId: 99 })).rejects.toThrow(NotFoundException);
  });

  it('添加成员：重复加入 409', async () => {
    orgs.findOne.mockResolvedValue({ id: 1, name: 'Acme' });
    users.findOne.mockResolvedValue({ id: 5, username: 'alice' });
    members.findOne.mockResolvedValue({ id: 1 });
    await expect(service.addMember(1, { userId: 5 })).rejects.toThrow(ConflictException);
  });

  it('添加成员：成功并通知', async () => {
    orgs.findOne.mockResolvedValue({ id: 1, name: 'Acme' });
    users.findOne.mockResolvedValue({ id: 5, username: 'alice' });
    members.findOne.mockResolvedValue(null);
    members.save.mockResolvedValue({ id: 9, orgId: 1, userId: 5 });
    await service.addMember(1, { userId: 5, role: OrgMemberRole.ADMIN });
    expect(members.save).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: 1, userId: 5, role: OrgMemberRole.ADMIN }),
    );
    expect(notify.create).toHaveBeenCalled();
  });

  it('更新成员：最后 owner 不能降级', async () => {
    members.findOne.mockResolvedValue({ id: 1, orgId: 1, userId: 5, role: OrgMemberRole.OWNER });
    members.createQueryBuilder().getCount.mockResolvedValue(0); // 无其他 owner
    await expect(
      service.updateMember(1, { role: OrgMemberRole.MEMBER }),
    ).rejects.toThrow(BadRequestException);
  });

  it('移除成员：最后 owner 不能移除', async () => {
    members.findOne.mockResolvedValue({ id: 1, orgId: 1, userId: 5, role: OrgMemberRole.OWNER });
    members.createQueryBuilder().getCount.mockResolvedValue(0);
    await expect(service.removeMember(1)).rejects.toThrow(BadRequestException);
  });

  it('成员列表：返回脱敏视图（email 掩码）', async () => {
    orgs.findOne.mockResolvedValue({ id: 1, name: 'Acme' });
    members.createQueryBuilder().getCount.mockResolvedValue(1);
    members.createQueryBuilder().getMany.mockResolvedValue([
      {
        id: 1,
        orgId: 1,
        userId: 5,
        deptId: 2,
        role: OrgMemberRole.MEMBER,
        user: { username: 'alice', nickname: 'Alice', avatarUrl: null, email: 'alice@example.com' },
        dept: { name: '研发部' },
      },
    ]);
    const result = await service.listMembers(1, 1, 20);
    expect(result.items[0].email).toBe('a***@example.com');
    expect(result.items[0].deptName).toBe('研发部');
  });

  // PC-3（CE-2 缺口）：org/orgId 数据范围 membership wire 形状在**源侧**冻结——与
  // specs/protocol/schemas/v1/org-*.schema.json（additionalProperties:false + 样例）配合：
  // 任一侧加/改字段，本断言或 wire-schema 冻结门先红。
  it('PC-3 wire 形状冻结：② GET /org/organizations/:orgId/members item → org-member-item（管理端，email 掩码）', async () => {     // ② 原本与 ① 同处一个用例（① 顺带设了 org 夹具）；拆开后这半边自带最小夹具——断言未改
    orgs.findOne.mockResolvedValue({ id: 1, name: 'Acme' });

    // ② GET /org/organizations/:orgId/members item → org-member-item（管理端，email 掩码）
    members.createQueryBuilder().getCount.mockResolvedValue(1);
    members.createQueryBuilder().getMany.mockResolvedValue([
      {
        id: 1,
        orgId: 1,
        userId: 5,
        deptId: 2,
        role: OrgMemberRole.MEMBER,
        user: { username: 'alice', nickname: 'Alice', avatarUrl: null, email: 'alice@example.com' },
        dept: { name: '研发部' },
      },
    ]);
    const admin = await service.listMembers(1, 1, 20);
    const itemSchema = JSON.parse(
      readFileSync(resolve(__dirname, '../../specs/protocol/schemas/v1/org-member-item.schema.json'), 'utf8'),
    ) as { properties: Record<string, unknown> };
    expect(Object.keys(admin.items[0]).sort()).toEqual(Object.keys(itemSchema.properties).sort());

  });
  // ── 邀请（ORG-6） ──

  it('兑换邀请码：有效 → 入组织 + 标记已用 + 通知邀请者', async () => {
    invites.findOne.mockResolvedValue({
      id: 1, code: 'ABC12345', orgId: 1, inviterId: 2,
      role: OrgMemberRole.MEMBER, deptId: null, expiresAt: null, usedBy: null, usedAt: null,
    });
    members.findOne.mockResolvedValue(null);
    const ok = await service.redeemOrgInvite('ABC12345', 9);
    expect(ok).toBe(true);
    expect(members.save).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: 1, userId: 9, role: OrgMemberRole.MEMBER }),
    );
    expect(invites.save).toHaveBeenCalledWith(expect.objectContaining({ usedBy: 9 }));
    expect(notify.create).toHaveBeenCalled();
  });

  it('兑换邀请码：已用 / 过期 / 无效 → 静默 false', async () => {
    invites.findOne
      .mockResolvedValueOnce({ id: 1, usedBy: 5, expiresAt: null }) // used
      .mockResolvedValueOnce({ id: 2, usedBy: null, expiresAt: new Date(Date.now() - 1000) }) // expired
      .mockResolvedValueOnce(null); // invalid
    expect(await service.redeemOrgInvite('USED', 9)).toBe(false);
    expect(await service.redeemOrgInvite('EXPI', 9)).toBe(false);
    expect(await service.redeemOrgInvite('XXXX', 9)).toBe(false);
    expect(members.save).not.toHaveBeenCalled();
  });

  it('兑换邀请码：已是组织成员 → 不消耗邀请码、不发通知', async () => {
    invites.findOne.mockResolvedValue({
      id: 3, code: 'MEMBER', orgId: 1, inviterId: 2,
      role: OrgMemberRole.MEMBER, deptId: null, expiresAt: null, usedBy: null, usedAt: null,
    });
    members.findOne.mockResolvedValue({ id: 99, orgId: 1, userId: 9 }); // 已是成员
    const ok = await service.redeemOrgInvite('MEMBER', 9);
    expect(ok).toBe(false);
    expect(members.save).not.toHaveBeenCalled();
    expect(invites.save).not.toHaveBeenCalled();
    expect(notify.create).not.toHaveBeenCalled();
  });

  // ── 申请（ORG-4） ──

  it('提交申请：非成员 403', async () => {
    members.findOne.mockResolvedValue(null);
    await expect(service.submitRequest(9, { title: '请假' })).rejects.toThrow(ForbiddenException);
  });

  it('提交申请：成员 → 发起 FLOW 审批流 + 通知发起人', async () => {
    members.findOne.mockResolvedValue({ id: 1, orgId: 1, userId: 9, deptId: 2, role: OrgMemberRole.MEMBER });
    const inst = await service.submitRequest(9, { title: '请假' });
    expect(inst.definitionId).toBe('org_request_approval');
    expect(notify.create).toHaveBeenCalled();
  });

  // ── 补充覆盖：组织列表/查询/更新 ──

  it('组织列表：带关键词过滤 + 成员/部门计数', async () => {
    orgs.findAndCount.mockResolvedValue([
      [
        { id: 1, name: 'Acme', createdAt: new Date() },
        { id: 2, name: 'Globex', createdAt: new Date() },
      ],
      2,
    ]);
    (members.createQueryBuilder().getRawMany as jest.Mock).mockResolvedValue([
      { groupKey: '1', cnt: '3' },
    ]);
    (depts.createQueryBuilder().getRawMany as jest.Mock).mockResolvedValue([
      { groupKey: '2', cnt: '5' },
    ]);
    const result = await service.findAllOrganizations(1, 20, 'Acme');
    expect(result.total).toBe(2);
    expect(result.totalPages).toBe(1);
    expect(result.items[0]).toMatchObject({ memberCount: 3, deptCount: 0 });
    expect(result.items[1]).toMatchObject({ memberCount: 0, deptCount: 5 });
    expect(orgs.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({ where: { name: Like('%Acme%') } }),
    );
  });

  it('组织列表：无关键词不过滤、空列表不查计数', async () => {
    orgs.findAndCount.mockResolvedValue([[], 0]);
    const result = await service.findAllOrganizations(1, 20);
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
    expect(orgs.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    );
  });

  it('组织详情：存在返回 / 不存在抛 NotFound', async () => {
    orgs.findOne.mockResolvedValueOnce({ id: 1, name: 'Acme' });
    await expect(service.findOrganization(1)).resolves.toMatchObject({ id: 1 });
    orgs.findOne.mockResolvedValueOnce(null);
    await expect(service.findOrganization(99)).rejects.toThrow(NotFoundException);
  });

  it('更新组织：合并字段并保存', async () => {
    const org = { id: 1, name: 'Acme', description: 'old' };
    orgs.findOne.mockResolvedValue(org);
    orgs.save.mockResolvedValue({ ...org, description: 'new' });
    await expect(service.updateOrganization(1, { description: 'new' })).resolves.toMatchObject({ description: 'new' });
    expect(orgs.save).toHaveBeenCalled();
  });

  it('删除组织：无成员时软删', async () => {
    orgs.findOne.mockResolvedValue({ id: 1, name: 'Acme' });
    members.count.mockResolvedValue(0);
    await expect(service.removeOrganization(1)).resolves.toBeUndefined();
    expect(orgs.softDelete).toHaveBeenCalledWith(1);
  });

  // ── 补充覆盖：部门成功路径 ──

  it('创建部门：成功保存（无父级、默认排序）', async () => {
    orgs.findOne.mockResolvedValue({ id: 1, name: 'Acme' });
    depts.findOne.mockResolvedValue(null);
    depts.save.mockResolvedValue({ id: 5, orgId: 1, name: '研发部' });
    await service.createDepartment(1, { name: '研发部' });
    expect(depts.save).toHaveBeenCalledWith(expect.objectContaining({ orgId: 1, name: '研发部', parentId: null, sortOrder: 0 }));
  });

  it('部门列表：委托 repo 按排序查询', async () => {
    orgs.findOne.mockResolvedValue({ id: 1, name: 'Acme' });
    depts.find.mockResolvedValue([{ id: 1 }]);
    await expect(service.listDepartments(1)).resolves.toEqual([{ id: 1 }]);
    expect(depts.find).toHaveBeenCalledWith({ where: { orgId: 1 }, order: { sortOrder: 'ASC', id: 'ASC' } });
  });

  it('更新部门：设父级为 null、改名、改排序', async () => {
    depts.findOne.mockResolvedValue({ id: 1, orgId: 1, parentId: 2, name: '旧名', sortOrder: 1 });
    depts.save.mockImplementation(async (x) => x);
    await service.updateDepartment(1, { parentId: null, name: '新名', sortOrder: 9 });
    expect(depts.save).toHaveBeenCalledWith(expect.objectContaining({ parentId: null, name: '新名', sortOrder: 9 }));
  });

  it('更新部门：改名与其他部门冲突抛 Conflict', async () => {
    depts.findOne
      .mockResolvedValueOnce({ id: 1, orgId: 1, parentId: null, name: 'A' })
      .mockResolvedValueOnce({ id: 2, orgId: 1, name: 'B' }); // dup
    await expect(service.updateDepartment(1, { name: 'B' })).rejects.toThrow(ConflictException);
  });

  it('更新部门：部门不存在抛 NotFound', async () => {
    depts.findOne.mockResolvedValue(null);
    await expect(service.updateDepartment(99, { name: 'X' })).rejects.toThrow(NotFoundException);
  });

  // ── 补充覆盖：成员成功路径 ──

  it('成员列表：关键词 + 部门过滤走 andWhere', async () => {
    orgs.findOne.mockResolvedValue({ id: 1, name: 'Acme' });
    members.createQueryBuilder().getCount.mockResolvedValue(1);
    members.createQueryBuilder().getMany.mockResolvedValue([
      { id: 1, orgId: 1, userId: 5, deptId: 2, role: OrgMemberRole.MEMBER, user: { username: 'alice', email: 'alice@example.com' }, dept: null },
    ]);
    const result = await service.listMembers(1, 1, 20, 'ali', 2);
    expect(result.total).toBe(1);
    expect(members.createQueryBuilder().andWhere).toHaveBeenCalled();
  });

  it('更新成员：有另一 owner 时允许降级 + 移部门/设部门', async () => {
    members.findOne.mockResolvedValueOnce({ id: 1, orgId: 1, userId: 5, deptId: 2, role: OrgMemberRole.OWNER });
    members.createQueryBuilder().getCount.mockResolvedValue(1); // 还有别的 owner
    members.save.mockImplementation(async (x) => x);
    await service.updateMember(1, { role: OrgMemberRole.MEMBER, deptId: null });
    expect(members.save).toHaveBeenCalledWith(expect.objectContaining({ role: OrgMemberRole.MEMBER, deptId: null }));
  });

  it('更新成员：设部门需属于组织', async () => {
    members.findOne.mockResolvedValue({ id: 1, orgId: 1, userId: 5, deptId: null, role: OrgMemberRole.MEMBER });
    depts.findOne.mockResolvedValueOnce(null); // dept not in org
    await expect(service.updateMember(1, { deptId: 99 })).rejects.toThrow(BadRequestException);
  });

  it('更新成员：成员不存在抛 NotFound', async () => {
    members.findOne.mockResolvedValue(null);
    await expect(service.updateMember(99, { role: OrgMemberRole.MEMBER })).rejects.toThrow(NotFoundException);
  });

  it('移除成员：普通成员直接删除', async () => {
    members.findOne.mockResolvedValue({ id: 1, orgId: 1, userId: 5, role: OrgMemberRole.MEMBER });
    await service.removeMember(1);
    expect(members.delete).toHaveBeenCalledWith(1);
  });

  it('移除成员：不存在抛 NotFound', async () => {
    members.findOne.mockResolvedValue(null);
    await expect(service.removeMember(99)).rejects.toThrow(NotFoundException);
  });

  // ── 补充覆盖：邀请 ──

  it('创建邀请：保存邀请码/角色/过期时间', async () => {
    orgs.findOne.mockResolvedValue({ id: 1, name: 'Acme' });
    invites.save.mockImplementation(async (x) => ({ ...x, id: 1 }));
    const inv = await service.createInvite(1, { role: OrgMemberRole.ADMIN, expiresAt: '2026-12-31T00:00:00Z' }, 2);
    expect(inv.code).toHaveLength(8);
    expect(inv.role).toBe(OrgMemberRole.ADMIN);
    expect(inv.expiresAt).toBeInstanceOf(Date);
  });

  it('邀请列表：委托 repo 倒序', async () => {
    orgs.findOne.mockResolvedValue({ id: 1, name: 'Acme' });
    invites.find.mockResolvedValue([{ id: 1 }]);
    await expect(service.listInvites(1)).resolves.toEqual([{ id: 1 }]);
    expect(invites.find).toHaveBeenCalledWith({ where: { orgId: 1 }, order: { createdAt: 'DESC' } });
  });

  it('撤销邀请：不存在抛 NotFound，存在删除', async () => {
    invites.findOne.mockResolvedValue(null);
    await expect(service.removeInvite(99)).rejects.toThrow(NotFoundException);
    invites.findOne.mockResolvedValue({ id: 1 });
    await service.removeInvite(1);
    expect(invites.delete).toHaveBeenCalledWith(1);
  });

  // ── 补充覆盖：申请 / 我的组织（ORG-7） ──

  it('我的申请列表：委托 flow 仓库', async () => {
    flowInst.find.mockResolvedValue([{ id: 1 }]);
    await expect(service.listMyRequests(9)).resolves.toEqual([{ id: 1 }]);
    expect(flowInst.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { definitionId: 'org_request_approval', initiatorId: 9 } }),
    );
  });

  it('更新部门：设非 null 父级成功（在组织内且无环）', async () => {
    depts.findOne
      .mockResolvedValueOnce({ id: 1, orgId: 1, parentId: null, name: 'A' })
      .mockResolvedValueOnce({ id: 3, orgId: 1 }); // 父级在组织内
    depts.find.mockResolvedValue([{ id: 1, orgId: 1, parentId: null }]); // 无环
    depts.save.mockImplementation(async (x) => x);
    await service.updateDepartment(1, { parentId: 3 });
    expect(depts.save).toHaveBeenCalledWith(expect.objectContaining({ parentId: 3 }));
  });

  it('更新成员：设非 null 部门成功', async () => {
    members.findOne.mockResolvedValue({ id: 1, orgId: 1, userId: 5, deptId: null, role: OrgMemberRole.MEMBER });
    depts.findOne.mockResolvedValue({ id: 2, orgId: 1 }); // 部门在组织内
    members.save.mockImplementation(async (x) => x);
    await service.updateMember(1, { deptId: 2 });
    expect(members.save).toHaveBeenCalledWith(expect.objectContaining({ deptId: 2 }));
  });

  describe('权限-2 部门物化路径 ancestors', () => {
    it('createDepartment 子部门 → ancestors = 父路径 + 父 id', async () => {
      orgs.findOne.mockResolvedValue({ id: 1, name: 'O' });
      depts.findOne
        .mockResolvedValueOnce({ id: 3, orgId: 1, name: '父', parentId: null, ancestors: '/' } as any)
        .mockResolvedValueOnce(null);
      await service.createDepartment(1, { name: '子', parentId: 3 });
      expect(depts.save).toHaveBeenCalledWith(expect.objectContaining({ ancestors: '/3/' }));
    });

    it('createDepartment 根部门 → ancestors = /', async () => {
      orgs.findOne.mockResolvedValue({ id: 1, name: 'O' });
      depts.findOne.mockResolvedValue(null);
      await service.createDepartment(1, { name: '根' });
      expect(depts.save).toHaveBeenCalledWith(expect.objectContaining({ ancestors: '/' }));
    });

    it('listDeptSubtreeIds 返回自身 + ancestors 命中的子孙（绑定参数，不拼串）', async () => {
      const qb = mockQB({ getRawMany: jest.fn().mockResolvedValue([{ id: 7 }, { id: '9' }]) });
      depts.createQueryBuilder.mockReturnValue(qb);

      await expect(service.listDeptSubtreeIds(1, 3)).resolves.toEqual([3, 7, 9]);
      expect(qb.andWhere).toHaveBeenCalledWith('d.ancestors LIKE :pattern', { pattern: '%/3/%' });
    });

    it('updateDepartment 改父级 → 整组织重算 ancestors（子树级联）', async () => {
      const parent5 = { id: 5, orgId: 1, name: 'P', parentId: null, ancestors: '/' } as any;
      const self = { id: 3, orgId: 1, name: 'A', parentId: null, ancestors: '/', sortOrder: 0 } as any;
      const child = { id: 7, orgId: 1, name: 'B', parentId: 3, ancestors: '/3/', sortOrder: 0 } as any;

      depts.findOne
        .mockResolvedValueOnce(self) // 取自己
        .mockResolvedValueOnce(parent5); // _ensureDeptInOrg(5)
      depts.find.mockResolvedValue([parent5, self, child]); // _assertNoCycle + rebuild

      await service.updateDepartment(3, { parentId: 5 });

      // calls[0] = 保存自身；calls[1] = 重算后落库的子树
      const rebuildArg = (depts.save as jest.Mock).mock.calls[1][0] as any[];
      expect(rebuildArg.map((d) => d.id).sort()).toEqual([3, 7]);
      expect(rebuildArg.find((d) => d.id === 3)!.ancestors).toBe('/5/');
      expect(rebuildArg.find((d) => d.id === 7)!.ancestors).toBe('/5/3/');
    });

    it('getUserOrgContext 返回 orgId + deptId；非成员 null', async () => {
      members.findOne.mockResolvedValueOnce({ id: 1, orgId: 1, userId: 9, deptId: 4 } as any);
      await expect(service.getUserOrgContext(9)).resolves.toEqual({ orgId: 1, deptId: 4 });

      members.findOne.mockResolvedValueOnce(null);
      await expect(service.getUserOrgContext(9)).resolves.toBeNull();
    });
  });
});
