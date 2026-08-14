import { QueryUserStatsTool } from './query-user-stats.tool';

describe('QueryUserStatsTool', () => {
  const mockUsersService = {
    findOne: jest.fn(),
  };

  const mockEventsService = {
    getEventsForRange: jest.fn(),
  };

  let tool: QueryUserStatsTool;

  beforeEach(() => {
    jest.clearAllMocks();
    tool = new QueryUserStatsTool(mockUsersService as any, mockEventsService as any);
  });

  describe('metadata', () => {
    it('should have correct name', () => {
      expect(tool.name).toBe('get_user_stats');
    });

    it('should have no required parameters', () => {
      expect(tool.parameters).toHaveLength(0);
    });
  });

  describe('toToolDefinition()', () => {
    it('should return a valid tool definition', () => {
      const def = tool.toToolDefinition();
      expect(def.type).toBe('function');
      expect(def.function.name).toBe('get_user_stats');
    });
  });

  describe('execute()', () => {
    it('should return user info with event counts', async () => {
      mockUsersService.findOne.mockResolvedValue({
        id: 1,
        username: 'alex',
        nickname: 'Alex',
        createdAt: '2026-01-15T00:00:00Z',
      });
      mockEventsService.getEventsForRange.mockResolvedValue([
        { id: 1, title: 'Event 1', isCancelled: false },
        { id: 2, title: 'Event 2', isCancelled: true },
      ]);

      const result = await tool.execute({}, '1');

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        username: 'alex',
        nickname: 'Alex',
        memberSince: '2026-01-15T00:00:00Z',
        totalEvents: 2,
        activeEvents: 1,
        cancelledEvents: 1,
      });
    });

    it('should return zero events when no events found', async () => {
      mockUsersService.findOne.mockResolvedValue({
        id: 1,
        username: 'alex',
        nickname: 'Alex',
        createdAt: '2026-01-15T00:00:00Z',
      });
      mockEventsService.getEventsForRange.mockResolvedValue([]);

      const result = await tool.execute({}, '1');

      expect(result.success).toBe(true);
      expect((result.data as any).totalEvents).toBe(0);
    });

    it('should handle user not found', async () => {
      mockUsersService.findOne.mockRejectedValue(
        new Error('User not found'),
      );

      const result = await tool.execute({}, '999');
      expect(result.success).toBe(false);
      expect(result.error).toBe('User not found');
    });

    it('should handle events service error gracefully', async () => {
      mockUsersService.findOne.mockResolvedValue({
        id: 1,
        username: 'alex',
        nickname: 'Alex',
        createdAt: '2026-01-15T00:00:00Z',
      });
      mockEventsService.getEventsForRange.mockRejectedValue(
        new Error('Events error'),
      );

      const result = await tool.execute({}, '1');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Events error');
    });
  });
});
