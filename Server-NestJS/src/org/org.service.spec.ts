import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { OrgService } from './org.service';
import { Organization } from './organization.entity';
import { Department } from './department.entity';
import { OrgMember } from './org-member.entity';
import { OrgInvite } from './org-invite.entity';
import { OrgMemberRole } from './org-member-role.enum';
import { User } from '../common/entities/user.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { FlowRuntimeService } from '../flows/flow-runtime.service';
import { FlowInstance } from '../flows/entities/flow-instance.entity';

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
  let notify: { create: jest.Mock };

  beforeEach(async () => {
    orgs = mockRepo();
    depts = mockRepo();
    members = mockRepo();
    invites = mockRepo();
    users = mockRepo();
    notify = { create: jest.fn().mockResolvedValue({}) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrgService,
        { provide: getRepositoryToken(Organization), useValue: orgs },
        { provide: getRepositoryToken(Department), useValue: depts },
        { provide: getRepositoryToken(OrgMember), useValue: members },
        { provide: getRepositoryToken(OrgInvite), useValue: invites },
        { provide: getRepositoryToken(User), useValue: users },
        { provide: getRepositoryToken(FlowInstance), useValue: mockRepo() },
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

  it('getUserOrgId：非成员返回 null（不抛错）', async () => {
    members.findOne.mockResolvedValue(null);
    expect(await service.getUserOrgId(99)).toBeNull();
  });

  // ── 组织 ──

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
});
