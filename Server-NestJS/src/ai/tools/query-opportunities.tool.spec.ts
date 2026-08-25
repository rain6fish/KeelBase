import { QueryCustomerOpportunitiesTool } from './query-opportunities.tool';

describe('QueryCustomerOpportunitiesTool', () => {
  const mockService = { listOpportunities: jest.fn() };
  let tool: QueryCustomerOpportunitiesTool;

  beforeEach(() => {
    jest.clearAllMocks();
    tool = new QueryCustomerOpportunitiesTool(mockService as any);
  });

  it('should have correct name and required customerId', () => {
    expect(tool.name).toBe('query_customer_opportunities');
    expect(tool.parameters.find((p) => p.name === 'customerId')?.required).toBe(true);
  });

  it('should build tool definition with required customerId', () => {
    const def = tool.toToolDefinition();
    expect(def.function.name).toBe('query_customer_opportunities');
    expect(def.function.parameters.required).toEqual(['customerId']);
  });

  it('should reject non-numeric customerId', async () => {
    const result = await tool.execute({ customerId: 'abc' }, '1');

    expect(result.success).toBe(false);
    expect(result.error).toBe('customerId 必须是数字');
  });

  it('should list opportunities scoped by userId', async () => {
    mockService.listOpportunities.mockResolvedValue([{ id: 1, name: '大单' }]);

    const result = await tool.execute({ customerId: '42' }, '7');

    expect(mockService.listOpportunities).toHaveBeenCalledWith(42, 7);
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ items: [{ id: 1, name: '大单' }], total: 1 });
  });

  it('should handle service errors gracefully', async () => {
    mockService.listOpportunities.mockRejectedValue(new Error('db down'));

    const result = await tool.execute({ customerId: '42' }, '7');

    expect(result.success).toBe(false);
    expect(result.error).toBe('db down');
  });
});
