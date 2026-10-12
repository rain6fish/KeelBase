// SPDX-License-Identifier: Apache-2.0

import { CreatePointRecordTool } from './create-point_records.tool';

describe('CreatePointRecordTool', () => {
  const mockService = { create: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should have name and require confirmation + verified email', () => {
    const tool = new CreatePointRecordTool(mockService as any);
    expect(tool.name).toBe('create_point_record');
    expect(tool.requiresConfirmation).toBe(true);
    expect(tool.permissions.requireVerifiedEmail).toBe(true);
  });

  it('should build a valid tool definition', () => {
    const tool = new CreatePointRecordTool(mockService as any);
    const def = tool.toToolDefinition();
    expect(def.function.name).toBe('create_point_record');
    expect(def.function.parameters).toBeDefined();
  });

  it('should create and return id + first field', async () => {
    mockService.create.mockResolvedValue({ id: 7, points: 'sample' });
    const tool = new CreatePointRecordTool(mockService as any);

    const result = await tool.execute({ points: 'sample' }, '1');

    expect(mockService.create).toHaveBeenCalledWith(expect.objectContaining({ points: 'sample' }), 1);
    expect(result).toEqual({ success: true, data: { id: 7, points: 'sample' } });
  });

  it('should return error when service throws', async () => {
    mockService.create.mockRejectedValue(new Error('boom'));
    const tool = new CreatePointRecordTool(mockService as any);

    const result = await tool.execute({}, '1');

    expect(result.success).toBe(false);
    expect(result.error).toBe('boom');
  });
});
