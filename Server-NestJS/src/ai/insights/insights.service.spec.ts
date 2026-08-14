import { Test, TestingModule } from '@nestjs/testing';
import { InsightsService } from './insights.service';
import { EventsService } from '../../events/events.service';
import { Event } from '../../events/event.entity';

describe('InsightsService', () => {
  let service: InsightsService;
  let eventsService: { getEventsForRange: jest.Mock };

  function makeEvent(id: number, start: Date, cancelled = false): Event {
    return {
      id,
      title: `Event ${id}`,
      startTime: start,
      endTime: new Date(start.getTime() + 3600_000),
      isCancelled: cancelled,
      isRecurring: false,
      colorRole: 0 as any,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Event;
  }

  beforeEach(async () => {
    eventsService = { getEventsForRange: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InsightsService,
        { provide: EventsService, useValue: eventsService },
      ],
    }).compile();

    service = module.get<InsightsService>(InsightsService);
  });

  describe('generateInsights', () => {
    it('returns empty stats when no events', async () => {
      eventsService.getEventsForRange.mockResolvedValue([]);

      const result = await service.generateInsights(1);

      expect(result.stats.totalEvents).toBe(0);
      expect(result.stats.activeEvents).toBe(0);
      expect(result.stats.monthlyBreakdown).toEqual([]);
      expect(result.summary).toContain('没有任何事件');
    });

    it('computes stats correctly for events across months', async () => {
      eventsService.getEventsForRange.mockResolvedValue([
        makeEvent(1, new Date('2026-08-10T09:00:00Z')),
        makeEvent(2, new Date('2026-08-15T09:00:00Z')),
        makeEvent(3, new Date('2026-07-01T09:00:00Z'), true),
      ]);

      const result = await service.generateInsights(1, 30);

      expect(result.stats.totalEvents).toBe(3);
      expect(result.stats.activeEvents).toBe(2);
      expect(result.stats.cancelledEvents).toBe(1);
      expect(result.stats.monthlyBreakdown).toHaveLength(2);
      expect(result.stats.monthlyBreakdown[0]).toEqual({
        month: '2026-07',
        count: 1,
      });
      expect(result.stats.monthlyBreakdown[1]).toEqual({
        month: '2026-08',
        count: 2,
      });
      expect(result.stats.recentEvents).toBeGreaterThanOrEqual(2);
      expect(result.stats.earliestEventAt).toBeDefined();
      expect(result.stats.latestEventAt).toBeDefined();
      expect(result.summary).toContain('3 个事件');
    });
  });
});
