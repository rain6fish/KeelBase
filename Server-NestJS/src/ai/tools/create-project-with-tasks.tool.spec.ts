// SPDX-License-Identifier: Apache-2.0

import { CreateProjectWithTasksTool } from './create-project-with-tasks.tool';

/**
 * 复合写工具体（docs/cascade-compensation.spec.md §3）。
 * 这里锁的是**副作用声明的形状与顺序**——根成员恒为第 0 条，级联补偿的 targetId 与
 * 「这是 N 条中的第 M 条」判定都建立在它之上，顺序错了整组语义就错。
 */
describe('CreateProjectWithTasksTool（复合写：建项目 + 拆任务）', () => {
  const makeService = (ret?: unknown) => ({
    createProjectWithTasks: jest.fn().mockResolvedValue(
      ret ?? {
        project: { id: 7, name: '客户门户二期' },
        tasks: [
          { id: 88, title: '梳理干系人' },
          { id: 89, title: '定技术选型' },
        ],
      },
    ),
  });

  it('是需确认的写工具（R3 派生 local_compensate）', () => {
    const tool = new CreateProjectWithTasksTool(makeService() as never);
    expect(tool.name).toBe('create_project_with_tasks');
    expect(tool.requiresConfirmation).toBe(true);
    expect(tool.permissions?.requireVerifiedEmail).toBe(true);
  });

  it('LLM 定义声明 tasks 为对象数组（否则模型无法表达「一并建的任务」）', () => {
    const tool = new CreateProjectWithTasksTool(makeService() as never);
    const def = tool.toToolDefinition().function.parameters as {
      properties: { tasks: { type: string; items: { required: string[] } } };
      required: string[];
    };
    expect(def.properties.tasks.type).toBe('array');
    expect(def.properties.tasks.items.required).toEqual(['title']);
    expect(def.required).toEqual(['name', 'tasks']);
  });

  it('execute：声明 effects，根成员（项目）恒为第 0 条', async () => {
    const svc = makeService();
    const tool = new CreateProjectWithTasksTool(svc as never);

    const res = await tool.execute(
      { name: '客户门户二期', tasks: [{ title: '梳理干系人' }, { title: '定技术选型' }] },
      '42',
    );

    expect(res.success).toBe(true);
    const data = res.data as { effects: Array<{ resultType: string; resultId: number }> };
    expect(data.effects).toEqual([
      { resultType: 'pm_project', resultId: 7 },
      { resultType: 'pm_task', resultId: 88 },
      { resultType: 'pm_task', resultId: 89 },
    ]);
  });

  it('execute：把项目字段与任务字段分别透传给单事务组合写', async () => {
    const svc = makeService();
    const tool = new CreateProjectWithTasksTool(svc as never);

    await tool.execute(
      {
        name: 'P',
        description: 'D',
        startDate: '2026-10-01T00:00:00Z',
        tasks: [{ title: 'T', description: 'TD', dueDate: '2026-10-02T00:00:00Z' }],
      },
      '42',
    );

    expect(svc.createProjectWithTasks).toHaveBeenCalledWith(
      { name: 'P', description: 'D', startDate: '2026-10-01T00:00:00Z' },
      [{ title: 'T', description: 'TD', dueDate: '2026-10-02T00:00:00Z' }],
      42,
    );
  });

  it('无任务也成立：effects 只剩根成员（仍归组，级联语义统一）', async () => {
    const svc = makeService({ project: { id: 7, name: 'P' }, tasks: [] });
    const tool = new CreateProjectWithTasksTool(svc as never);

    const res = await tool.execute({ name: 'P', tasks: [] }, '42');

    expect(res.success).toBe(true);
    expect((res.data as { effects: unknown[] }).effects).toEqual([
      { resultType: 'pm_project', resultId: 7 },
    ]);
  });

  it.each([
    ['缺 name', { tasks: [] }],
    ['name 为空串', { name: '   ', tasks: [] }],
    ['tasks 非数组', { name: 'P', tasks: 'x' }],
    ['tasks 项非对象', { name: 'P', tasks: ['x'] }],
    ['tasks 项为数组', { name: 'P', tasks: [[1]] }],
    ['tasks 项缺 title', { name: 'P', tasks: [{ description: 'd' }] }],
    ['tasks 项 title 为空白', { name: 'P', tasks: [{ title: '  ' }] }],
  ])('非法输入不落库：%s → success=false', async (_label, args) => {
    const svc = makeService();
    const tool = new CreateProjectWithTasksTool(svc as never);

    const res = await tool.execute(args as Record<string, unknown>, '42');

    expect(res.success).toBe(false);
    expect(svc.createProjectWithTasks).not.toHaveBeenCalled();
  });

  it('业务异常（如校验失败）→ success=false 且带原因，不上抛', async () => {
    const svc = {
      createProjectWithTasks: jest.fn().mockRejectedValue(new Error('项目名称重复')),
    };
    const tool = new CreateProjectWithTasksTool(svc as never);

    const res = await tool.execute({ name: 'P', tasks: [] }, '42');

    expect(res).toEqual({ success: false, error: '项目名称重复' });
  });
});
