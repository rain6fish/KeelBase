// SPDX-License-Identifier: Apache-2.0

import { CreateAssetLoanTool } from './create-asset_loans.tool';

describe('CreateAssetLoanTool', () => {
  const mockService = { create: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should have name and require confirmation + verified email', () => {
    const tool = new CreateAssetLoanTool(mockService as any);
    expect(tool.name).toBe('create_asset_loan');
    expect(tool.requiresConfirmation).toBe(true);
    expect(tool.permissions.requireVerifiedEmail).toBe(true);
  });

  it('should build a valid tool definition', () => {
    const tool = new CreateAssetLoanTool(mockService as any);
    const def = tool.toToolDefinition();
    expect(def.function.name).toBe('create_asset_loan');
    expect(def.function.parameters).toBeDefined();
  });

  it('should create and return id + first field', async () => {
    mockService.create.mockResolvedValue({ id: 7, assetName: 'sample' });
    const tool = new CreateAssetLoanTool(mockService as any);

    const result = await tool.execute({ assetName: 'sample' }, '1');

    expect(mockService.create).toHaveBeenCalledWith(expect.objectContaining({ assetName: 'sample' }), 1);
    expect(result).toEqual({ success: true, data: { id: 7, assetName: 'sample' } });
  });

  it('should return error when service throws', async () => {
    mockService.create.mockRejectedValue(new Error('boom'));
    const tool = new CreateAssetLoanTool(mockService as any);

    const result = await tool.execute({}, '1');

    expect(result.success).toBe(false);
    expect(result.error).toBe('boom');
  });
});
