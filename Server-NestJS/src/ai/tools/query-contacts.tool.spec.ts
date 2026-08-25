import { QueryCustomerContactsTool } from './query-contacts.tool';

describe('QueryCustomerContactsTool', () => {
  const mockService = { listContacts: jest.fn() };
  let tool: QueryCustomerContactsTool;

  beforeEach(() => {
    jest.clearAllMocks();
    tool = new QueryCustomerContactsTool(mockService as any);
  });

  it('should have correct name and required customerId', () => {
    expect(tool.name).toBe('query_customer_contacts');
    expect(tool.parameters.find((p) => p.name === 'customerId')?.required).toBe(true);
  });

  it('should build tool definition with required customerId', () => {
    const def = tool.toToolDefinition();
    expect(def.function.name).toBe('query_customer_contacts');
    expect(def.function.parameters.required).toEqual(['customerId']);
  });

  it('should reject non-numeric customerId', async () => {
    const result = await tool.execute({ customerId: 'abc' }, '1');

    expect(result.success).toBe(false);
    expect(result.error).toBe('customerId 必须是数字');
  });

  it('should list contacts scoped by userId', async () => {
    mockService.listContacts.mockResolvedValue([{ id: 1, name: '张三' }]);

    const result = await tool.execute({ customerId: '42' }, '7');

    expect(mockService.listContacts).toHaveBeenCalledWith(42, 7);
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ items: [{ id: 1, name: '张三' }], total: 1 });
  });

  it('should handle service errors gracefully', async () => {
    mockService.listContacts.mockRejectedValue(new Error('db down'));

    const result = await tool.execute({ customerId: '42' }, '7');

    expect(result.success).toBe(false);
    expect(result.error).toBe('db down');
  });
});
