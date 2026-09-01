// SPDX-License-Identifier: Apache-2.0

import { CountEventsByStatusTool } from './count-events-by-status.tool';

describe('CountEventsByStatusTool', () => {
  const mockEventsService = {
    getEventsForRange: jest.fn(),
  };

  let tool: CountEventsByStatusTool;

  beforeEach(() => {
    jest.clearAllMocks();
    tool = new CountEventsByStatusTool(mockEventsService as any);
  });

  describe('metadata', () => {
    it('should have correct name', () => {
      expect(tool.name).toBe('count_events_by_status');
    });

    it('should have parameters', () => {
      expect(tool.parameters.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('toToolDefinition()', () => {
    it('should return a valid tool definition', () => {
      const def = tool.toToolDefinition();
      expect(def.type).toBe('function');
      expect(def.function.name).toBe('count_events_by_status');
    });
  });

  describe('execute()', () => {
    it('should count events grouped by completion status', async () => {
      mockEventsService.getEventsForRange.mockResolvedValue([
        { id: 1, title: 'A', isCancelled: false },
        { id: 2, title: 'B', isCancelled: false },
        { id: 3, title: 'C', isCancelled: true },
        { id: 4, title: 'D', isCancelled: false },
      ]);

      const result = await tool.execute(
        { startDate: '2026-07-01', endDate: '2026-07-31' },
        '1',
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        total: 4,
        active: 3,
        cancelled: 1,
      });
    });

    it('should return zero counts when no events found', async () => {
      mockEventsService.getEventsForRange.mockResolvedValue([]);

      const result = await tool.execute(
        { startDate: '2026-07-01', endDate: '2026-07-31' },
        '1',
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        total: 0,
        active: 0,
        cancelled: 0,
      });
    });

    it('should handle service errors gracefully', async () => {
      mockEventsService.getEventsForRange.mockRejectedValue(
        new Error('DB error'),
      );

      const result = await tool.execute(
        { startDate: '2026-07-01', endDate: '2026-07-31' },
        '1',
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('DB error');
    });
  });
});
