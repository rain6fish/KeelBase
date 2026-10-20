// SPDX-License-Identifier: Apache-2.0

import { QueryLeaveRequestsTool } from './query-leave_requests.tool';

describe('QueryLeaveRequestsTool', () => {
  const mockService = { findAll: jest.fn() };

  let tool: QueryLeaveRequestsTool;

  beforeEach(() => {
    jest.clearAllMocks();
    tool = new QueryLeaveRequestsTool(mockService as any);
  });

  it('should have correct name and description', () => {
    expect(tool.name).toBe('query_leave_requests');
    expect(tool.description.length).toBeGreaterThan(0);
  });

  it('should build a valid tool definition', () => {
    const def = tool.toToolDefinition();
    expect(def.type).toBe('function');
    expect(def.function.name).toBe('query_leave_requests');
    expect(def.function.parameters).toBeDefined();
  });

  it('should fetch own leave_requests scoped by userId and map fields', async () => {
    mockService.findAll.mockResolvedValue([{ id: 1, requestNo: 'sample' }]);

    const result = await tool.execute({}, '7');

    expect(mockService.findAll).toHaveBeenCalledWith(7, undefined);
    expect(result.success).toBe(true);
    expect((result.data as any[])[0]).toMatchObject({ id: 1, requestNo: 'sample' });
  });

  it('should return empty data when none found', async () => {
    mockService.findAll.mockResolvedValue([]);

    const result = await tool.execute({}, '7');

    expect(result.success).toBe(true);
    expect(result.data).toEqual([]);
  });

  it('should handle service errors gracefully', async () => {
    mockService.findAll.mockRejectedValue(new Error('db down'));

    const result = await tool.execute({}, '7');

    expect(result.success).toBe(false);
    expect(result.error).toBe('db down');
  });

  it('should declare the same filter to the runtime and the model', () => {
    const def = tool.toToolDefinition();
    expect(Object.keys((def.function.parameters as any).properties)).toEqual(['keyword']);
    expect(tool.parameters.map((p) => p.name)).toEqual(['keyword']);
  });

  it('should pass the declared keyword filter through and narrow the result', async () => {
    mockService.findAll.mockImplementation((_userId: number, q?: string) =>
      Promise.resolve(q
        ? [{ id: 1, requestNo: 'sample' }]
        : [{ id: 1, requestNo: 'sample' }, { id: 2, requestNo: 'other' }]),
    );

    const unfiltered = await tool.execute({}, '7');
    const filtered = await tool.execute({ keyword: 'sample' }, '7');

    expect(mockService.findAll).toHaveBeenNthCalledWith(1, 7, undefined);
    expect(mockService.findAll).toHaveBeenNthCalledWith(2, 7, 'sample');
    expect((filtered.data as any[]).length).toBeLessThan((unfiltered.data as any[]).length);
  });
});
