import { QueryProjectsTool } from './query-projects.tool';
import { QueryProjectTasksTool } from './query-project-tasks.tool';
import { AnalyzeProjectRiskTool } from './analyze-project-risk.tool';
import { CreateProjectTaskTool } from './create-project-task.tool';

describe('PM tools', () => {
  describe('QueryProjectsTool', () => {
    const pmService = { listProjects: jest.fn() } as any;
    const tool = new QueryProjectsTool(pmService);
    it('按 userId 查询并返回精简项目列表', async () => {
      pmService.listProjects.mockResolvedValue({ total: 1, items: [{ id: 1, name: '电商重构', status: 'active', riskLevel: 'high', endDate: null }] });
      const result = await tool.execute({ status: 'active' }, '1');
      expect(pmService.listProjects).toHaveBeenCalledWith(1, { status: 'active', keyword: undefined });
      expect(result.success).toBe(true);
      expect((result.data as any).items[0].name).toBe('电商重构');
    });
    it('服务异常 → success:false', async () => {
      pmService.listProjects.mockRejectedValue(new Error('db down'));
      const result = await tool.execute({}, '1');
      expect(result.success).toBe(false);
    });
  });

  describe('QueryProjectTasksTool', () => {
    const pmService = { listTasks: jest.fn() } as any;
    const tool = new QueryProjectTasksTool(pmService);
    it('projectId 非法 → 参数错误', async () => {
      const result = await tool.execute({ projectId: 'abc' }, '1');
      expect(result.success).toBe(false);
      expect(result.error).toContain('必须是数字');
    });
    it('返回任务列表', async () => {
      pmService.listTasks.mockResolvedValue({ items: [{ id: 1, title: 't', status: 'pending', dueDate: null, assigneeId: null }], total: 1 });
      const result = await tool.execute({ projectId: 1 }, '1');
      expect(pmService.listTasks).toHaveBeenCalledWith(1, 1);
      expect(result.success).toBe(true);
    });
  });

  describe('AnalyzeProjectRiskTool', () => {
    const pmService = { analyzeProjectRisk: jest.fn() } as any;
    const tool = new AnalyzeProjectRiskTool(pmService);
    it('返回风险等级', async () => {
      pmService.analyzeProjectRisk.mockResolvedValue({ level: 'critical', score: 9, reasons: ['里程碑延期'], dataPoints: {} });
      const result = await tool.execute({ projectId: 1 }, '7');
      expect(pmService.analyzeProjectRisk).toHaveBeenCalledWith(1, 7);
      expect((result.data as any).level).toBe('critical');
    });
    it('toToolDefinition 生成合法函数工具定义', () => {
      const def = tool.toToolDefinition();
      expect(def.type).toBe('function');
      expect(def.function.name).toBe('analyze_project_risk');
      expect(def.function.parameters.required).toContain('projectId');
    });
    it('projectId 非法 → 参数错误', async () => {
      const result = await tool.execute({ projectId: 'abc' }, '1');
      expect(result.success).toBe(false);
      expect(result.error).toContain('必须是数字');
    });
    it('服务异常 → success:false', async () => {
      pmService.analyzeProjectRisk.mockRejectedValue(new Error('risk engine down'));
      const result = await tool.execute({ projectId: 1 }, '1');
      expect(result.success).toBe(false);
      expect(result.error).toBe('risk engine down');
    });
  });

  describe('CreateProjectTaskTool', () => {
    const pmService = { createTask: jest.fn() } as any;
    const tool = new CreateProjectTaskTool(pmService);
    it('声明为需确认写工具', () => {
      expect(tool.requiresConfirmation).toBe(true);
      expect(tool.permissions).toEqual({ requireVerifiedEmail: true });
    });
    it('构造 dto 调用 createTask', async () => {
      pmService.createTask.mockResolvedValue({ id: 5, title: '跟进延期', projectId: 1, dueDate: null });
      const result = await tool.execute({ projectId: 1, title: '跟进延期' }, '3');
      expect(pmService.createTask).toHaveBeenCalledWith({ projectId: 1, title: '跟进延期' }, 3);
      expect((result.data as any).id).toBe(5);
    });
    it('服务异常 → success:false', async () => {
      pmService.createTask.mockRejectedValue(new Error('项目不存在'));
      const result = await tool.execute({ projectId: 99, title: 'x' }, '3');
      expect(result.success).toBe(false);
    });
  });
});
