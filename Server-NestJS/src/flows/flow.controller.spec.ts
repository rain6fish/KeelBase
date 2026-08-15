import { BadRequestException } from '@nestjs/common';
import { FlowController } from './flow.controller';
import { FlowRuntimeService } from './flow-runtime.service';
import { AiFlowService } from './ai-flow.service';
import { validateFlowDefinition } from './flow-definition.schema';

jest.mock('./flow-definition.schema', () => ({
  validateFlowDefinition: jest.fn(),
}));

const mockValidate = validateFlowDefinition as jest.Mock;

describe('FlowController', () => {
  let controller: FlowController;
  let runtime: Record<string, jest.Mock>;
  let aiFlow: { generateFromDescription: jest.Mock };

  const mockUser = { sub: 1, username: 'alex' };
  const mockAbility = { cannot: () => false } as any;
  const mockDefinition = { id: 'leave_approval', nodes: [], edges: [] };

  beforeEach(() => {
    runtime = Object.fromEntries(
      ['upsertDefinition', 'start', 'getTasksForUser', 'resolveTask', 'getInstance', 'rollback']
        .map((m) => [m, jest.fn()]),
    );
    aiFlow = { generateFromDescription: jest.fn() };
    controller = new FlowController(
      runtime as unknown as FlowRuntimeService,
      aiFlow as unknown as AiFlowService,
    );
    mockValidate.mockReset();
  });

  it('aiGenerate 委托 aiFlow', async () => {
    aiFlow.generateFromDescription.mockResolvedValue({ nodes: [] });
    await expect(controller.aiGenerate({ description: '请假审批' } as any)).resolves.toEqual({ nodes: [] });
    expect(aiFlow.generateFromDescription).toHaveBeenCalledWith('请假审批');
  });

  it('saveDefinition 定义合法时发布', async () => {
    mockValidate.mockReturnValue({ ok: true });
    runtime.upsertDefinition.mockResolvedValue(mockDefinition);
    await expect(
      controller.saveDefinition({ definition: mockDefinition } as any),
    ).resolves.toBe(mockDefinition);
    expect(runtime.upsertDefinition).toHaveBeenCalledWith(mockDefinition);
  });

  it('saveDefinition 定义非法时抛 400', async () => {
    mockValidate.mockReturnValue({ ok: false, error: '节点缺少 type' });
    await expect(
      controller.saveDefinition({ definition: mockDefinition } as any),
    ).rejects.toThrow(BadRequestException);
    expect(runtime.upsertDefinition).not.toHaveBeenCalled();
  });

  it('start 委托 runtime 并传 userId 与空 data 回退', async () => {
    runtime.start.mockResolvedValue({ id: 1 });
    await controller.start('leave_approval', { data: { days: 3 } } as any, mockUser as any);
    expect(runtime.start).toHaveBeenCalledWith('leave_approval', { days: 3 }, 1);
    await controller.start('leave_approval', {} as any, mockUser as any);
    expect(runtime.start).toHaveBeenCalledWith('leave_approval', {}, 1);
  });

  it('myTasks / approve / instance 委托 runtime', async () => {
    runtime.getTasksForUser.mockResolvedValue([]);
    runtime.resolveTask.mockResolvedValue({ id: 1 });
    runtime.getInstance.mockResolvedValue({ id: 2 });

    await controller.myTasks(mockUser as any);
    await controller.approve(3, { decision: 'approve', note: 'ok' } as any, mockUser as any);
    await controller.instance(2, mockUser as any, mockAbility);

    expect(runtime.getTasksForUser).toHaveBeenCalledWith(1);
    expect(runtime.resolveTask).toHaveBeenCalledWith(3, 'approve', 1, 'ok');
    expect(runtime.getInstance).toHaveBeenCalledWith(2, 1, mockAbility);
  });

  it('rollback 委托 runtime', async () => {
    runtime.rollback.mockResolvedValue({ id: 1 });
    await expect(controller.rollback(1)).resolves.toEqual({ id: 1 });
    expect(runtime.rollback).toHaveBeenCalledWith(1);
  });
});
