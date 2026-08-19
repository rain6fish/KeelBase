import { CreateContractTool } from './create-contract.tool';

describe('CreateContractTool', () => {
  const mockService = { create: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should have name and require confirmation + verified email', () => {
    const tool = new CreateContractTool(mockService as any);
    expect(tool.name).toBe('create_contract');
    expect(tool.requiresConfirmation).toBe(true);
    expect(tool.permissions.requireVerifiedEmail).toBe(true);
  });

  it('should build a valid tool definition', () => {
    const tool = new CreateContractTool(mockService as any);
    const def = tool.toToolDefinition();
    expect(def.function.name).toBe('create_contract');
    expect(def.function.parameters).toBeDefined();
  });

  it('should create and return id + first field', async () => {
    mockService.create.mockResolvedValue({ id: 7, name: 'sample' });
    const tool = new CreateContractTool(mockService as any);

    const result = await tool.execute({ name: 'sample' }, '1');

    expect(mockService.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'sample' }), 1);
    expect(result).toEqual({ success: true, data: { id: 7, name: 'sample' } });
  });

  it('should return error when service throws', async () => {
    mockService.create.mockRejectedValue(new Error('boom'));
    const tool = new CreateContractTool(mockService as any);

    const result = await tool.execute({}, '1');

    expect(result.success).toBe(false);
    expect(result.error).toBe('boom');
  });
});
