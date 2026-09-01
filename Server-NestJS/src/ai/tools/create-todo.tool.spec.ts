// SPDX-License-Identifier: Apache-2.0

import { CreateTodoTool } from './create-todo.tool';

describe('CreateTodoTool', () => {
  const mockTodosService = {
    create: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should have name create_todo and require confirmation', () => {
    const tool = new CreateTodoTool(mockTodosService as any);
    expect(tool.name).toBe('create_todo');
    expect(tool.requiresConfirmation).toBe(true);
  });

  it('should build toToolDefinition with required title', () => {
    const tool = new CreateTodoTool(mockTodosService as any);
    const def = tool.toToolDefinition();
    expect(def.function.name).toBe('create_todo');
    expect(def.function.parameters).toMatchObject({ required: ['title'] });
  });

  it('should create a todo and return id', async () => {
    mockTodosService.create.mockResolvedValue({ id: 7, title: '买牛奶' });
    const tool = new CreateTodoTool(mockTodosService as any);

    const result = await tool.execute(
      { title: '买牛奶', dueDate: '2026-08-10T18:00:00Z' },
      '1',
    );

    expect(mockTodosService.create).toHaveBeenCalledWith(
      { title: '买牛奶', dueDate: '2026-08-10T18:00:00Z' },
      1,
    );
    expect(result).toEqual({ success: true, data: { id: 7, title: '买牛奶' } });
  });

  it('should return error result when service throws', async () => {
    mockTodosService.create.mockRejectedValue(new Error('boom'));
    const tool = new CreateTodoTool(mockTodosService as any);

    const result = await tool.execute({ title: 'T' }, '1');

    expect(result.success).toBe(false);
    expect(result.error).toBe('boom');
  });
});
