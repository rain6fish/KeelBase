import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException, BadRequestException } from '@nestjs/common';
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
    findOne: jest.fn(),
  };
  const mockTaskRepo = { create: (x: any) => x, save: jest.fn((t: any) => Promise.resolve(t)), find: jest.fn(), findOne: jest.fn() };
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
});
