// SPDX-License-Identifier: Apache-2.0

import { PmController } from './pm.controller';
import { PmService } from './pm.service';

describe('PmController（AI Project Management 旗舰）', () => {
  let controller: PmController;
  let pmService: Record<string, jest.Mock>;

  const mockUser = { sub: 1, username: 'alex' };
  const ability = {} as any;

  const methods = [
    'createProject', 'listProjects', 'getProjectDetail', 'updateProject',
    'removeProject', 'analyzeProjectRisk', 'listMembers', 'addMember',
    'listMilestones', 'createMilestone', 'listTasks', 'createTask',
    'completeTask', 'listRisks', 'createRisk',
  ];

  beforeEach(() => {
    pmService = Object.fromEntries(methods.map((m) => [m, jest.fn()]));
    controller = new PmController(pmService as unknown as PmService);
  });

  it('项目 CRUD 委托 service', async () => {
    const dto = { name: 'AI 平台', status: 'active' };
    pmService.createProject.mockReturnValue({ id: 1 });
    pmService.listProjects.mockReturnValue({ items: [], total: 0 });
    pmService.getProjectDetail.mockReturnValue({ id: 1 });
    pmService.updateProject.mockReturnValue({ id: 1 });
    pmService.removeProject.mockResolvedValue(undefined);

    expect(controller.createProject(dto as any, mockUser as any)).toEqual({ id: 1 });
    expect(controller.listProjects(mockUser as any, 1, 20, 'active', 'AI')).toEqual({ items: [], total: 0 });
    expect(controller.getProjectDetail(1, mockUser as any, ability)).toEqual({ id: 1 });
    expect(controller.updateProject(1, dto as any, mockUser as any, ability)).toEqual({ id: 1 });
    await expect(controller.removeProject(1, mockUser as any, ability)).resolves.toBeNull();

    expect(pmService.createProject).toHaveBeenCalledWith(dto, 1);
    expect(pmService.listProjects).toHaveBeenCalledWith(1, { page: 1, limit: 20, status: 'active', keyword: 'AI' });
    expect(pmService.getProjectDetail).toHaveBeenCalledWith(1, ability);
    expect(pmService.updateProject).toHaveBeenCalledWith(1, dto, ability);
    expect(pmService.removeProject).toHaveBeenCalledWith(1, ability);
  });

  it('风险分析委托 service', () => {
    pmService.analyzeProjectRisk.mockReturnValue({ score: 6, level: 'medium' });
    expect(controller.analyze(1, mockUser as any)).toEqual({ score: 6, level: 'medium' });
    expect(pmService.analyzeProjectRisk).toHaveBeenCalledWith(1, 1);
  });

  it('成员/里程碑子资源委托 service', () => {
    pmService.listMembers.mockReturnValue([]);
    pmService.addMember.mockReturnValue({ id: 1 });
    pmService.listMilestones.mockReturnValue([]);
    pmService.createMilestone.mockReturnValue({ id: 1 });

    expect(controller.listMembers(1, mockUser as any)).toEqual([]);
    expect(controller.addMember(1, { userId: 5, role: 'member' } as any, mockUser as any)).toEqual({ id: 1 });
    expect(controller.listMilestones(1, mockUser as any)).toEqual([]);
    expect(controller.createMilestone(1, { title: 'M1' } as any, mockUser as any)).toEqual({ id: 1 });

    expect(pmService.addMember).toHaveBeenCalledWith(1, 5, 'member', 1);
    expect(pmService.createMilestone).toHaveBeenCalledWith(1, { title: 'M1' }, 1);
  });

  it('任务/风险委托 service', () => {
    pmService.listTasks.mockReturnValueOnce([]); // 项目任务
    pmService.listTasks.mockReturnValueOnce([]); // 我的任务
    pmService.createTask.mockReturnValue({ id: 1 });
    pmService.completeTask.mockReturnValue({ id: 1, completed: true });
    pmService.listRisks.mockReturnValue([]);
    pmService.createRisk.mockReturnValue({ id: 1 });

    expect(controller.listTasks(1, mockUser as any)).toEqual([]);
    expect(pmService.listTasks).toHaveBeenCalledWith(1, 1);
    expect(controller.listMyTasks(mockUser as any)).toEqual([]);
    expect(pmService.listTasks).toHaveBeenLastCalledWith(1);
    expect(controller.createTask({ title: 'T' } as any, mockUser as any)).toEqual({ id: 1 });
    expect(controller.completeTask(2, mockUser as any)).toEqual({ id: 1, completed: true });
    expect(controller.listRisks(1, mockUser as any)).toEqual([]);
    expect(controller.createRisk(1, { level: 'high' } as any, mockUser as any)).toEqual({ id: 1 });

    expect(pmService.createTask).toHaveBeenCalledWith({ title: 'T' }, 1);
    expect(pmService.completeTask).toHaveBeenCalledWith(2, 1);
    expect(pmService.createRisk).toHaveBeenCalledWith(1, { level: 'high' }, 1);
  });
});
