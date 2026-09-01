// SPDX-License-Identifier: Apache-2.0

import { runHumanTask } from './human-task.node';
import { OrgMemberRole } from '../../org/org-member-role.enum';

describe('runHumanTask（FLOW-2/FLOW-4 审批节点）', () => {
  const instance = { id: 1, initiatorId: 9, dataJson: '{}' };
  const node = { id: 'n1', type: 'human_task', name: '请假审批' };

  function mockRepos() {
    const taskRepo = {
      create: jest.fn((d: any) => d),
      save: jest.fn((d: any) => Promise.resolve(d)),
    };
    const usersRepo = {
      find: jest.fn().mockResolvedValue([]),
    };
    const orgMemberRepo = {
      findOne: jest.fn().mockResolvedValue(null),
    };
    const notify = { create: jest.fn().mockResolvedValue({}) };
    return { taskRepo, usersRepo, orgMemberRepo, notify };
  }

  it('assigneeUserId 优先', async () => {
    const { taskRepo, usersRepo, orgMemberRepo, notify } = mockRepos();
    await runHumanTask(taskRepo as any, usersRepo as any, orgMemberRepo as any, notify as any, instance as any, { ...node, assigneeUserId: 42 } as any);
    expect(taskRepo.save).toHaveBeenCalledWith(expect.objectContaining({ assigneeId: 42 }));
    expect(orgMemberRepo.findOne).not.toHaveBeenCalled();
    expect(notify.create).toHaveBeenCalledWith(expect.objectContaining({ userId: 42 }));
  });

  it('data.approverId 兜底', async () => {
    const { taskRepo, usersRepo, orgMemberRepo, notify } = mockRepos();
    const inst = { ...instance, dataJson: JSON.stringify({ approverId: 55 }) };
    await runHumanTask(taskRepo as any, usersRepo as any, orgMemberRepo as any, notify as any, inst as any, node as any);
    expect(taskRepo.save).toHaveBeenCalledWith(expect.objectContaining({ assigneeId: 55 }));
  });

  it('组织角色解析：admin → owner+admin，排除发起人', async () => {
    const { taskRepo, usersRepo, orgMemberRepo, notify } = mockRepos();
    orgMemberRepo.findOne
      .mockResolvedValueOnce({ userId: 9, orgId: 1, deptId: null }) // 发起人成员
      .mockResolvedValueOnce({ userId: 3, orgId: 1, role: OrgMemberRole.ADMIN }); // 候选审批人
    await runHumanTask(taskRepo as any, usersRepo as any, orgMemberRepo as any, notify as any, instance as any, {
      ...node,
      assigneeOrgRole: { role: OrgMemberRole.ADMIN, scope: 'org' },
    } as any);
    expect(orgMemberRepo.findOne).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ role: expect.anything(), userId: expect.anything() }) }),
    );
    expect(taskRepo.save).toHaveBeenCalledWith(expect.objectContaining({ assigneeId: 3 }));
  });

  it('组织角色 scope=department 且发起人无部门时回退全局角色', async () => {
    const { taskRepo, usersRepo, orgMemberRepo, notify } = mockRepos();
    // 发起人成员（无部门）→ 组织解析 undefined → 全局角色找到候选
    orgMemberRepo.findOne.mockResolvedValueOnce({ userId: 9, orgId: 1, deptId: null });
    usersRepo.find.mockResolvedValue([{ id: 7 }]);
    await runHumanTask(taskRepo as any, usersRepo as any, orgMemberRepo as any, notify as any, instance as any, {
      ...node,
      assigneeOrgRole: { role: OrgMemberRole.MEMBER, scope: 'department' },
      roles: ['admin'],
    } as any);
    expect(usersRepo.find).toHaveBeenCalledWith({ where: { role: 'admin' }, take: 1 });
    expect(taskRepo.save).toHaveBeenCalledWith(expect.objectContaining({ assigneeId: 7 }));
  });

  it('无任何解析 → 发起人本人', async () => {
    const { taskRepo, usersRepo, orgMemberRepo, notify } = mockRepos();
    await runHumanTask(taskRepo as any, usersRepo as any, orgMemberRepo as any, notify as any, instance as any, node as any);
    expect(taskRepo.save).toHaveBeenCalledWith(expect.objectContaining({ assigneeId: 9, status: 'pending' }));
  });

  it('无通知服务时不发通知', async () => {
    const { taskRepo, usersRepo, orgMemberRepo } = mockRepos();
    await runHumanTask(taskRepo as any, usersRepo as any, orgMemberRepo as any, null, instance as any, node as any);
    expect(taskRepo.save).toHaveBeenCalled();
  });
});
