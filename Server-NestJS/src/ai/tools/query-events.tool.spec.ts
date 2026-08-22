import { QueryEventsTool } from './query-events.tool';

describe('QueryEventsTool', () => {
  const mockEvents = [
    { id: 1, title: 'Meeting', startTime: '2026-07-15T10:00:00Z', endTime: '2026-07-15T11:00:00Z', isCancelled: false, location: 'Room A', colorRole: 'work' },
    { id: 2, title: 'Lunch', startTime: '2026-07-16T12:00:00Z', endTime: '2026-07-16T13:00:00Z', isCancelled: false, location: null, colorRole: 'personal' },
  ];

  const mockEventsService = {
    getEventsForRange: jest.fn(),
  };

  let tool: QueryEventsTool;

  beforeEach(() => {
    jest.clearAllMocks();
    tool = new QueryEventsTool(mockEventsService as any);
  });

  describe('metadata', () => {
    it('should have correct name', () => {
      expect(tool.name).toBe('query_events');
    });

    it('should have description', () => {
      expect(tool.description).toBeDefined();
      expect(tool.description.length).toBeGreaterThan(0);
    });

    it('should have optional startDate and endDate parameters with defaults', () => {
      expect(tool.parameters).toHaveLength(4);
      const startDate = tool.parameters.find((p) => p.name === 'startDate');
      expect(startDate).toBeDefined();
      expect(startDate!.required).toBe(false);

      const endDate = tool.parameters.find((p) => p.name === 'endDate');
      expect(endDate).toBeDefined();
      expect(endDate!.required).toBe(false);
    });
  });

  describe('toToolDefinition()', () => {
    it('should return a valid tool definition', () => {
      const def = tool.toToolDefinition();
      expect(def.type).toBe('function');
      expect(def.function.name).toBe('query_events');
      expect(def.function.parameters).toBeDefined();
    });
  });

  describe('execute()', () => {
    it('should call getEventsForRange with correct params', async () => {
      mockEventsService.getEventsForRange.mockResolvedValue(mockEvents);

      const result = await tool.execute(
        { startDate: '2026-07-01', endDate: '2026-07-31' },
        '1',
      );

      expect(mockEventsService.getEventsForRange).toHaveBeenCalledWith(
        '2026-07-01',
        '2026-07-31',
        1,
      );
      expect(result.success).toBe(true);
    });

    it('should filter by status when provided', async () => {
      mockEventsService.getEventsForRange.mockResolvedValue(mockEvents);

      const result = await tool.execute(
        { startDate: '2026-07-01', endDate: '2026-07-31', status: 'completed' },
        '1',
      );

      expect(result.success).toBe(true);
    });

    it('should filter cancelled events when status=cancelled', async () => {
      const events = [
        { id: 1, title: 'A', isCancelled: true },
        { id: 2, title: 'B', isCancelled: false },
      ];
      mockEventsService.getEventsForRange.mockResolvedValue(events);

      const result = await tool.execute(
        { startDate: '2026-07-01', endDate: '2026-07-31', status: 'cancelled' },
        '1',
      );

      expect(result.success).toBe(true);
      expect((result.data as any[]).map((e) => e.id)).toEqual([1]);
    });

    it('should filter non-cancelled events when status=active', async () => {
      const events = [
        { id: 1, title: 'A', isCancelled: true },
        { id: 2, title: 'B', isCancelled: false },
      ];
      mockEventsService.getEventsForRange.mockResolvedValue(events);

      const result = await tool.execute(
        { startDate: '2026-07-01', endDate: '2026-07-31', status: 'active' },
        '1',
      );

      expect(result.success).toBe(true);
      expect((result.data as any[]).map((e) => e.id)).toEqual([2]);
    });

    it('should default startDate/endDate to current month when not provided', async () => {
      mockEventsService.getEventsForRange.mockResolvedValue(mockEvents);

      const result = await tool.execute({}, '1');

      expect(result.success).toBe(true);
      const [start, end] = mockEventsService.getEventsForRange.mock.calls[0];
      expect(start).toMatch(/^\d{4}-\d{2}-01$/); // 本月1日
      expect(end).toMatch(/^\d{4}-\d{2}-\d{2}$/); // 今天
    });

    it('should limit results when limit is provided', async () => {
      const manyEvents = Array.from({ length: 20 }, (_, i) => ({
        id: i + 1,
        title: `Event ${i + 1}`,
      }));
      mockEventsService.getEventsForRange.mockResolvedValue(manyEvents);

      const result = await tool.execute(
        { startDate: '2026-07-01', endDate: '2026-07-31', limit: 5 },
        '1',
      );

      expect(result.success).toBe(true);
      expect((result.data as any[]).length).toBe(5);
    });

    it('should return empty data when no events found', async () => {
      mockEventsService.getEventsForRange.mockResolvedValue([]);

      const result = await tool.execute(
        { startDate: '2026-07-01', endDate: '2026-07-31' },
        '1',
      );

      expect(result.success).toBe(true);
      expect((result.data as any[])).toEqual([]);
    });

    it('should handle service errors gracefully', async () => {
      mockEventsService.getEventsForRange.mockRejectedValue(
        new Error('Database error'),
      );

      const result = await tool.execute(
        { startDate: '2026-07-01', endDate: '2026-07-31' },
        '1',
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database error');
    });
  });
});
