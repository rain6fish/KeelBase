// SPDX-License-Identifier: Apache-2.0

import { QueryTagsTool } from './query-tags.tool';

describe('QueryTagsTool', () => {
  const mockService = { findAll: jest.fn() };

  let tool: QueryTagsTool;

  beforeEach(() => {
    jest.clearAllMocks();
    tool = new QueryTagsTool(mockService as any);
  });

  it('should have correct name and description', () => {
    expect(tool.name).toBe('query_tags');
    expect(tool.description.length).toBeGreaterThan(0);
  });

  it('should build a valid tool definition', () => {
    const def = tool.toToolDefinition();
    expect(def.type).toBe('function');
    expect(def.function.name).toBe('query_tags');
    expect(def.function.parameters).toBeDefined();
  });

  it('should fetch own tags scoped by userId and map fields', async () => {
    mockService.findAll.mockResolvedValue([{ id: 1, name: 'sample' }]);

    const result = await tool.execute({}, '7');

    expect(mockService.findAll).toHaveBeenCalledWith(7);
    expect(result.success).toBe(true);
    expect((result.data as any[])[0]).toMatchObject({ id: 1, name: 'sample' });
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
});
