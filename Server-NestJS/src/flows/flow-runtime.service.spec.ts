import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { User } from '../common/entities/user.entity';
import { OrgMember } from '../org/org-member.entity';
import { FlowRuntimeService } from './flow-runtime.service';
import { FlowDefinition } from './entities/flow-definition.entity';
import { FlowInstance } from './entities/flow-instance.entity';
import { FlowTask } from './entities/flow-task.entity';
import { FlowDefinition as FlowDef } from './flow-definition.types';
import { NotificationsService } from '../notifications/notifications.service';
import { LlmProviderFactory } from '../ai/providers/provider-factory';
import { AuditService } from '../ai/audit/audit.service';
import { ConfigService } from '@nestjs/config';

describe('FlowRuntimeService', () => {
  let service: FlowRuntimeService;

  const def: FlowDef = {
    id: 'leave_approval',
    name: '请假审批',
    version: '1.0',
    nodes: [
      { id: 'check_days', type: 'condition', name: '天数', expr: '{{days}} > 3', then: 'b', else: 'c' },
      { id: 'b', type: 'human_task', name: '经理审批' },
      { id: 'c', type: 'human_task', name: '直属审批' },
    ],
  };

  const mockDefRepo = { create: (x: any) => x, findOne: jest.fn(), save: jest.fn((x: any) => Promise.resolve(x)) };
  const mockInstRepo = {
    create: (x: any) => x,
    save: jest.fn((i: any) => Promise.resolve(i)),
    find: jest.fn(),
    findOne: jest.fn(),
  };
  const mockTaskRepo = { create: (x: any) => x, save: jest.fn((t: any) => Promise.resolve(t)), find: jest.fn(), findOne: jest.fn() };
  const mockUsersRepo = { find: jest.fn(), findOne: jest.fn() };
  const mockOrgMemberRepo = { findOne: jest.fn(), find: jest.fn() };
  const mockAudit = { log: jest.fn().mockResolvedValue(undefined) };
  const mockNotify = { create: jest.fn().mockResolvedValue({}) };
  const mockProviderFactory = { getProvider: jest.fn() };
  const mockConfig = { get: jest.fn().mockReturnValue('deepseek') };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockDefRepo.findOne.mockResolvedValue({ id: def.id, name: def.name, version: def.version, nodesJson: JSON.stringify(def.nodes), audit: true, confirmationRequired: true });
    mockInstRepo.findOne.mockResolvedValue({ id: 1, definitionId: def.id, state: 'running', initiatorId: 5, dataJson: '{}', currentNodeId: 'check_days' });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FlowRuntimeService,
        { provide: getRepositoryToken(FlowDefinition), useValue: mockDefRepo },
        { provide: getRepositoryToken(FlowInstance), useValue: mockInstRepo },
        { provide: getRepositoryToken(FlowTask), useValue: mockTaskRepo },
        { provide: getRepositoryToken(User), useValue: mockUsersRepo },
        { provide: getRepositoryToken(OrgMember), useValue: mockOrgMemberRepo },
        { provide: NotificationsService, useValue: mockNotify },
        { provide: LlmProviderFactory, useValue: mockProviderFactory },
        { provide: AuditService, useValue: mockAudit },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();
    service = module.get<FlowRuntimeService>(FlowRuntimeService);
  });

  it('start：condition(>3) → human_task 建任务挂起', async () => {
    await service.start(def.id, { days: 5 }, 5);
    // human_task 建任务
    const task = mockTaskRepo.save.mock.calls[0][0];
    expect(task.status).toBe('pending');
    expect(task.assigneeId).toBe(5);
    // 实例 running（挂起等审批）
    expect(mockInstRepo.save).toHaveBeenCalled();
    // 审计 flow_node
    expect(mockAudit.log).toHaveBeenCalled();
  });

  it('start：condition(≤3) → 走 else 分支 human_task', async () => {
    await service.start(def.id, { days: 2 }, 5);
    const task = mockTaskRepo.save.mock.calls[0][0];
    expect(task.nodeId).toBe('c'); // 直属审批（else）
  });

  it('resolveTask：审批人 approve → completed', async () => {
    mockTaskRepo.findOne.mockResolvedValue({ id: 1, instanceId: 1, nodeId: 'b', assigneeId: 5, status: 'pending' });
    mockInstRepo.findOne.mockResolvedValue({ id: 1, definitionId: def.id, state: 'running', initiatorId: 5, dataJson: '{}', currentNodeId: 'b' });
    mockInstRepo.save.mockImplementation((i: any) => {
      if (i.state === 'completed') mockInstRepo.saved = i;
      return Promise.resolve(i);
    });
    await service.resolveTask(1, 'approve', 5);
    expect(mockTaskRepo.save).toHaveBeenCalled();
    // human_task 无 next → completed
    expect(mockInstRepo.save).toHaveBeenCalledWith(expect.objectContaining({ state: 'completed' }));
    expect(mockAudit.log).toHaveBeenCalledWith(expect.objectContaining({ detail: expect.stringContaining('completed') }));
  });

  it('resolveTask：reject → failed', async () => {
    mockTaskRepo.findOne.mockResolvedValue({ id: 1, instanceId: 1, nodeId: 'b', assigneeId: 5, status: 'pending' });
    mockInstRepo.findOne.mockResolvedValue({ id: 1, definitionId: def.id, state: 'running', initiatorId: 5, dataJson: '{}', currentNodeId: 'b' });
    await service.resolveTask(1, 'reject', 5, '不同意');
    expect(mockInstRepo.save).toHaveBeenCalledWith(expect.objectContaining({ state: 'failed' }));
  });

  it('resolveTask：非审批人拒绝', async () => {
    mockTaskRepo.findOne.mockResolvedValue({ id: 1, instanceId: 1, nodeId: 'b', assigneeId: 5, status: 'pending' });
    await expect(service.resolveTask(1, 'approve', 999)).rejects.toThrow(ForbiddenException);
  });

  it('resolveTask：已处理任务拒绝重复审批', async () => {
    mockTaskRepo.findOne.mockResolvedValue({ id: 1, instanceId: 1, nodeId: 'b', assigneeId: 5, status: 'approved' });
    await expect(service.resolveTask(1, 'approve', 5)).rejects.toThrow(BadRequestException);
  });

  it('resolveTask：节点 roles 声明时非该角色审批人拒绝', async () => {
    const roleDef: FlowDef = {
      id: 'role_flow', name: '角色流程', version: '1.0',
      nodes: [{ id: 'a', type: 'human_task', name: '管理员审批', roles: ['admin'] }],
    };
    mockDefRepo.findOne.mockResolvedValue({ id: 'role_flow', name: '角色流程', version: '1.0', nodesJson: JSON.stringify(roleDef.nodes), audit: true, confirmationRequired: true });
    mockTaskRepo.findOne.mockResolvedValue({ id: 1, instanceId: 1, nodeId: 'a', assigneeId: 5, status: 'pending' });
    mockInstRepo.findOne.mockResolvedValue({ id: 1, definitionId: 'role_flow', state: 'running', initiatorId: 5, dataJson: '{}', currentNodeId: 'a' });
    mockUsersRepo.findOne.mockResolvedValue({ id: 5, role: 'user' });
    await expect(service.resolveTask(1, 'approve', 5)).rejects.toThrow(ForbiddenException);
  });

  it('resolveTask：节点 roles 声明且审批人属该角色通过', async () => {
    const roleDef: FlowDef = {
      id: 'role_flow', name: '角色流程', version: '1.0',
      nodes: [{ id: 'a', type: 'human_task', name: '管理员审批', roles: ['admin'] }],
    };
    mockDefRepo.findOne.mockResolvedValue({ id: 'role_flow', name: '角色流程', version: '1.0', nodesJson: JSON.stringify(roleDef.nodes), audit: true, confirmationRequired: true });
    mockTaskRepo.findOne.mockResolvedValue({ id: 1, instanceId: 1, nodeId: 'a', assigneeId: 5, status: 'pending' });
    mockInstRepo.findOne.mockResolvedValue({ id: 1, definitionId: 'role_flow', state: 'running', initiatorId: 5, dataJson: '{}', currentNodeId: 'a' });
    mockUsersRepo.findOne.mockResolvedValue({ id: 5, role: 'admin' });
    await service.resolveTask(1, 'approve', 5);
    expect(mockInstRepo.save).toHaveBeenCalledWith(expect.objectContaining({ state: 'completed' }));
  });

  it('ORG-4：human_task 按组织角色解析审批人（有组织管理员）', async () => {
    const orgDef: FlowDef = {
      id: 'org_flow', name: '组织审批', version: '1.0',
      nodes: [{ id: 'a', type: 'human_task', name: '组织管理员审批', assigneeOrgRole: { scope: 'org', role: 'admin' } }],
    };
    mockDefRepo.findOne.mockResolvedValue({ id: 'org_flow', name: '组织审批', version: '1.0', nodesJson: JSON.stringify(orgDef.nodes), audit: true, confirmationRequired: true });
    mockInstRepo.save.mockImplementation((i: any) => Promise.resolve({ ...i, id: 1 }));
    // 发起人成员 + 候选组织管理员
    mockOrgMemberRepo.findOne
      .mockResolvedValueOnce({ orgId: 1, userId: 5, deptId: null, role: 'member' })
      .mockResolvedValueOnce({ orgId: 1, userId: 99, deptId: null, role: 'admin' });
    await service.start('org_flow', {}, 5);
    expect(mockTaskRepo.save).toHaveBeenCalledWith(expect.objectContaining({ assigneeId: 99 }));
  });

  it('ORG-4：无组织管理员候选 → 回退发起人', async () => {
    const orgDef: FlowDef = {
      id: 'org_flow', name: '组织审批', version: '1.0',
      nodes: [{ id: 'a', type: 'human_task', name: '组织管理员审批', assigneeOrgRole: { scope: 'org', role: 'admin' } }],
    };
    mockDefRepo.findOne.mockResolvedValue({ id: 'org_flow', name: '组织审批', version: '1.0', nodesJson: JSON.stringify(orgDef.nodes), audit: true, confirmationRequired: true });
    mockInstRepo.save.mockImplementation((i: any) => Promise.resolve({ ...i, id: 1 }));
    mockOrgMemberRepo.findOne
      .mockResolvedValueOnce({ orgId: 1, userId: 5, deptId: null, role: 'member' }) // 发起人成员
      .mockResolvedValueOnce(null); // 无管理员候选
    await service.start('org_flow', {}, 5);
    expect(mockTaskRepo.save).toHaveBeenCalledWith(expect.objectContaining({ assigneeId: 5 }));
  });

  it('ORG-4：resolveTask 时审批人不再持有组织角色 → 拒绝', async () => {
    const orgDef: FlowDef = {
      id: 'org_flow', name: '组织审批', version: '1.0',
      nodes: [{ id: 'a', type: 'human_task', name: '组织管理员审批', assigneeOrgRole: { scope: 'org', role: 'admin' } }],
    };
    mockDefRepo.findOne.mockResolvedValue({ id: 'org_flow', name: '组织审批', version: '1.0', nodesJson: JSON.stringify(orgDef.nodes), audit: true, confirmationRequired: true });
    mockTaskRepo.findOne.mockResolvedValue({ id: 1, instanceId: 1, nodeId: 'a', assigneeId: 99, status: 'pending' });
    mockInstRepo.findOne.mockResolvedValue({ id: 1, definitionId: 'org_flow', state: 'running', initiatorId: 5, dataJson: '{}', currentNodeId: 'a' });
    // 发起人成员存在；审批人已不是该组织 admin
    mockOrgMemberRepo.findOne
      .mockResolvedValueOnce({ orgId: 1, userId: 5, deptId: null, role: 'member' })
      .mockResolvedValueOnce(null);
    await expect(service.resolveTask(1, 'approve', 99)).rejects.toThrow(ForbiddenException);
  });

  // ── 补充覆盖：注册/ai_task/推进失败/待办/实例/回滚 ──

  it('upsertDefinition 未声明 security 时用默认值并返回', async () => {
    const result = await service.upsertDefinition(def);
    expect(mockDefRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: def.id, nodesJson: JSON.stringify(def.nodes), audit: true, confirmationRequired: false }),
    );
    expect(result).toEqual(def);
  });

  it('upsertDefinition 声明 security 时持久化', async () => {
    await service.upsertDefinition({ ...def, security: { audit: false, confirmationRequired: true } });
    expect(mockDefRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ audit: false, confirmationRequired: true }),
    );
  });

  it('start：ai_task 节点同步推进到下一 human_task', async () => {
    const aiDef: FlowDef = {
      id: 'ai_flow', name: 'AI 流程', version: '1.0',
      nodes: [
        { id: 'a', type: 'ai_task', name: '总结', prompt: '总结上下文', outputKey: 'summary', next: 'b' },
        { id: 'b', type: 'human_task', name: '人工确认' },
      ],
    };
    mockDefRepo.findOne.mockResolvedValue({ id: 'ai_flow', name: 'AI 流程', version: '1.0', nodesJson: JSON.stringify(aiDef.nodes), audit: true, confirmationRequired: true });
    mockProviderFactory.getProvider.mockReturnValue({ generate: jest.fn().mockResolvedValue({ content: '总结结果' }), availableModels: ['m'] });
    await service.start('ai_flow', { input: 'x' }, 5);
    expect(mockProviderFactory.getProvider).toHaveBeenCalledWith('deepseek');
    // ai_result 写入 data，随后 human_task 建任务挂起
    expect(mockTaskRepo.save).toHaveBeenCalledWith(expect.objectContaining({ nodeId: 'b' }));
  });

  it('advance：next 节点不存在 → 实例置 failed', async () => {
    const defWithGap: FlowDef = {
      id: 'gap_flow', name: '断链流程', version: '1.0',
      nodes: [{ id: 'a', type: 'human_task', name: '审批', next: 'ghost' }],
    };
    mockDefRepo.findOne.mockResolvedValue({ id: 'gap_flow', name: '断链流程', version: '1.0', nodesJson: JSON.stringify(defWithGap.nodes), audit: true, confirmationRequired: true });
    mockTaskRepo.findOne.mockResolvedValue({ id: 1, instanceId: 1, nodeId: 'a', assigneeId: 5, status: 'pending' });
    mockInstRepo.findOne.mockResolvedValue({ id: 1, definitionId: 'gap_flow', state: 'running', initiatorId: 5, dataJson: '{}', currentNodeId: 'a' });
    await service.resolveTask(1, 'approve', 5);
    expect(mockInstRepo.save).toHaveBeenCalledWith(expect.objectContaining({ state: 'failed' }));
  });

  it('getTasksForUser：无待办返回空数组', async () => {
    mockTaskRepo.find.mockResolvedValue([]);
    await expect(service.getTasksForUser(5)).resolves.toEqual([]);
  });

  it('getTasksForUser：附带节点名/流程名', async () => {
    mockTaskRepo.find.mockResolvedValue([
      { id: 1, instanceId: 10, nodeId: 'b', assigneeId: 5, status: 'pending' },
      { id: 2, instanceId: 11, nodeId: 'c', assigneeId: 5, status: 'pending' },
    ]);
    mockInstRepo.find.mockResolvedValue([
      { id: 10, definitionId: def.id },
      { id: 11, definitionId: 'missing_def' },
    ]);
    // def 命中缓存；missing_def 返回 null（不缓存）
    mockDefRepo.findOne
      .mockResolvedValueOnce({ id: def.id, name: def.name, version: '1.0', nodesJson: JSON.stringify(def.nodes), audit: true, confirmationRequired: true })
      .mockResolvedValueOnce(null);
    const tasks = await service.getTasksForUser(5);
    expect(tasks[0]).toMatchObject({ title: '经理审批', flowName: '请假审批' });
    expect(tasks[1]).toMatchObject({ title: undefined, flowName: undefined }); // 流程定义缺失
    expect(mockDefRepo.findOne).toHaveBeenCalledTimes(2);
  });

  it('getInstance：本人/管理员可看，他人禁止，不存在 404', async () => {
    const forbidAbility = { cannot: jest.fn().mockReturnValue(true) };
    mockInstRepo.findOne.mockResolvedValueOnce({ id: 1, initiatorId: 5 });
    await expect(service.getInstance(1, 5, forbidAbility as any)).resolves.toMatchObject({ id: 1 });
    expect(forbidAbility.cannot).not.toHaveBeenCalled(); // 本人直接通过

    mockInstRepo.findOne.mockResolvedValueOnce({ id: 1, initiatorId: 5 });
    await expect(service.getInstance(1, 9, forbidAbility as any)).rejects.toThrow(ForbiddenException);

    const adminAbility = { cannot: jest.fn().mockReturnValue(false) };
    mockInstRepo.findOne.mockResolvedValueOnce({ id: 1, initiatorId: 5 });
    await expect(service.getInstance(1, 9, adminAbility as any)).resolves.toMatchObject({ id: 1 });

    mockInstRepo.findOne.mockResolvedValueOnce(null);
    await expect(service.getInstance(99, 5, adminAbility as any)).rejects.toThrow('流程实例不存在');
  });

  it('rollback：标记 rolled_back', async () => {
    mockInstRepo.findOne.mockResolvedValue({ id: 1, state: 'running' });
    await service.rollback(1);
    expect(mockInstRepo.save).toHaveBeenCalledWith(expect.objectContaining({ state: 'rolled_back' }));
    mockInstRepo.findOne.mockResolvedValue(null);
    await expect(service.rollback(99)).rejects.toThrow('流程实例不存在');
  });

  it('ORG-4：部门范围审批且发起人已无部门 → 拒绝', async () => {
    const deptDef: FlowDef = {
      id: 'dept_flow', name: '部门审批', version: '1.0',
      nodes: [{ id: 'a', type: 'human_task', name: '部门负责人', assigneeOrgRole: { scope: 'department', role: 'admin' } }],
    };
    mockDefRepo.findOne.mockResolvedValue({ id: 'dept_flow', name: '部门审批', version: '1.0', nodesJson: JSON.stringify(deptDef.nodes), audit: true, confirmationRequired: true });
    mockTaskRepo.findOne.mockResolvedValue({ id: 1, instanceId: 1, nodeId: 'a', assigneeId: 99, status: 'pending' });
    mockInstRepo.findOne.mockResolvedValue({ id: 1, definitionId: 'dept_flow', state: 'running', initiatorId: 5, dataJson: '{}', currentNodeId: 'a' });
    mockOrgMemberRepo.findOne.mockResolvedValueOnce({ orgId: 1, userId: 5, deptId: null, role: 'member' }); // 发起人无部门
    await expect(service.resolveTask(1, 'approve', 99)).rejects.toThrow('发起人已无部门');
  });
});
