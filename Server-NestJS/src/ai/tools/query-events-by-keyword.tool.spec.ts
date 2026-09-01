// SPDX-License-Identifier: Apache-2.0

import { QueryEventsByKeywordTool } from './query-events-by-keyword.tool';

describe('QueryEventsByKeywordTool', () => {
  const mockEventsService = {
    search: jest.fn(),
  };

  let tool: QueryEventsByKeywordTool;

  beforeEach(() => {
    jest.clearAllMocks();
    tool = new QueryEventsByKeywordTool(mockEventsService as any);
  });

  describe('metadata', () => {
    it('should have correct name', () => {
      expect(tool.name).toBe('query_events_by_keyword');
    });

    it('should have required keyword parameter', () => {
      const keyword = tool.parameters.find((p) => p.name === 'keyword');
      expect(keyword).toBeDefined();
      expect(keyword!.required).toBe(true);
    });
  });

  describe('toToolDefinition()', () => {
    it('should return a valid tool definition', () => {
      const def = tool.toToolDefinition();
      expect(def.type).toBe('function');
      expect(def.function.name).toBe('query_events_by_keyword');
    });
  });

  describe('execute()', () => {
    it('should search events by keyword', async () => {
      mockEventsService.search.mockResolvedValue({
        items: [
          { id: 1, title: 'Team Meeting', startTime: '2026-07-15T10:00:00Z' },
          { id: 2, title: 'Meeting with Client', startTime: '2026-07-16T14:00:00Z' },
        ],
        total: 2,
        page: 1,
        limit: 20,
        totalPages: 1,
      });

      const result = await tool.execute({ keyword: 'Meeting' }, '1');

      expect(mockEventsService.search).toHaveBeenCalledWith(
        { keyword: 'Meeting', start: undefined, end: undefined, page: 1, limit: 20 },
        1,
      );
      expect(result.success).toBe(true);
      expect((result.data as any[])).toHaveLength(2);
    });

    it('should pass date range when provided', async () => {
      mockEventsService.search.mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
      });

      const result = await tool.execute(
        { keyword: 'Meeting', startDate: '2026-07-01', endDate: '2026-07-31' },
        '1',
      );

      expect(mockEventsService.search).toHaveBeenCalledWith(
        { keyword: 'Meeting', start: '2026-07-01', end: '2026-07-31', page: 1, limit: 20 },
        1,
      );
    });

    it('should return empty when no matches', async () => {
      mockEventsService.search.mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
      });

      const result = await tool.execute({ keyword: 'Nonexistent' }, '1');

      expect(result.success).toBe(true);
      expect((result.data as any[])).toEqual([]);
    });

    it('should handle service errors gracefully', async () => {
      mockEventsService.search.mockRejectedValue(new Error('Search error'));

      const result = await tool.execute({ keyword: 'Meeting' }, '1');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Search error');
    });
  });
});
