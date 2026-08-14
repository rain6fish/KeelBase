import { CreateEventTool } from './create-event.tool';

describe('CreateEventTool', () => {
  const mockEventsService = {
    create: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should have name create_event and require confirmation', () => {
    const tool = new CreateEventTool(mockEventsService as any);
    expect(tool.name).toBe('create_event');
    expect(tool.requiresConfirmation).toBe(true);
  });

  it('should build toToolDefinition with required params', () => {
    const tool = new CreateEventTool(mockEventsService as any);
    const def = tool.toToolDefinition();
    expect(def.type).toBe('function');
    expect(def.function.name).toBe('create_event');
    expect(def.function.parameters).toMatchObject({
      required: ['title', 'startTime', 'endTime'],
    });
  });

  it('should create an event and return id', async () => {
    mockEventsService.create.mockResolvedValue({
      id: 42,
      title: '产品评审会',
      startTime: '2026-08-10T09:00:00Z',
    });
    const tool = new CreateEventTool(mockEventsService as any);

    const result = await tool.execute(
      {
        title: '产品评审会',
        startTime: '2026-08-10T09:00:00Z',
        endTime: '2026-08-10T10:00:00Z',
      },
      '1',
    );

    expect(mockEventsService.create).toHaveBeenCalledWith(
      {
        title: '产品评审会',
        startTime: '2026-08-10T09:00:00Z',
        endTime: '2026-08-10T10:00:00Z',
      },
      1,
    );
    expect(result).toEqual({
      success: true,
      data: { id: 42, title: '产品评审会', startTime: '2026-08-10T09:00:00Z' },
    });
  });

  it('should omit undefined optional keys from the dto', async () => {
    mockEventsService.create.mockResolvedValue({ id: 1, title: 'T', startTime: 'S' });
    const tool = new CreateEventTool(mockEventsService as any);

    await tool.execute(
      { title: 'T', startTime: 'S', endTime: 'E', description: undefined },
      '1',
    );

    expect(mockEventsService.create).toHaveBeenCalledWith(
      { title: 'T', startTime: 'S', endTime: 'E' },
      1,
    );
  });

  it('should return error result when service throws', async () => {
    mockEventsService.create.mockRejectedValue(new Error('boom'));
    const tool = new CreateEventTool(mockEventsService as any);

    const result = await tool.execute(
      { title: 'T', startTime: 'S', endTime: 'E' },
      '1',
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('boom');
  });
});
