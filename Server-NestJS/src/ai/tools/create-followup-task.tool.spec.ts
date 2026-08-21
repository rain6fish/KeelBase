import { CreateFollowupTaskTool } from './create-followup-task.tool';

describe('CreateFollowupTaskTool', () => {
  const crmService = { createTask: jest.fn() } as any;
  const tool = new CreateFollowupTaskTool(crmService);

  beforeEach(() => crmService.createTask.mockReset());

  it('声明为需确认的写工具', () => {
    expect(tool.requiresConfirmation).toBe(true);
    expect(tool.permissions).toEqual({ requireVerifiedEmail: true });
  });

  it('构造 dto 调用 createTask 并返回 id', async () => {
    crmService.createTask.mockResolvedValue({ id: 11, title: '跟进华润回款', customerId: 1, dueDate: null });
    const result = await tool.execute(
      { customerId: 1, title: '跟进华润回款', dueDate: '2026-08-20T10:00:00Z' },
      '3',
    );
    expect(crmService.createTask).toHaveBeenCalledWith(
      { customerId: 1, title: '跟进华润回款', dueDate: '2026-08-20T10:00:00Z' },
      3,
    );
    expect(result.success).toBe(true);
    expect((result.data as any).id).toBe(11);
  });

  it('缺少 customerId → success:false（防无客户关联的数据孤儿）', async () => {
    crmService.createTask.mockResolvedValue({ id: 12, title: '杂项任务', customerId: null });
    const result = await tool.execute({ title: '杂项任务' }, '3');
    expect(crmService.createTask).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.error).toContain('customerId');
  });

  it('服务异常 → success:false', async () => {
    crmService.createTask.mockRejectedValue(new Error('客户不存在'));
    const result = await tool.execute({ customerId: 99, title: 'x' }, '3');
    expect(result.success).toBe(false);
    expect(result.error).toContain('客户不存在');
  });
});
