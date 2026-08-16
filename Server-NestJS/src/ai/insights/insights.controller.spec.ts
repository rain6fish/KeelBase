import { InsightsController } from './insights.controller';
import { InsightsService } from './insights.service';

describe('InsightsController', () => {
  let controller: InsightsController;
  let insightsService: Record<string, jest.Mock>;

  beforeEach(() => {
    insightsService = { generateInsights: jest.fn() };
    controller = new InsightsController(insightsService as unknown as InsightsService);
  });

  it('生成洞察报告委托 service（days 透传）', async () => {
    insightsService.generateInsights.mockResolvedValue({ summary: '数据' });
    await expect(controller.generateInsights({ sub: 1 } as any, { days: 30 } as any)).resolves.toEqual({ summary: '数据' });
    expect(insightsService.generateInsights).toHaveBeenCalledWith(1, 30);
  });

  it('days 未传时用 undefined 透传', async () => {
    insightsService.generateInsights.mockResolvedValue({});
    await controller.generateInsights({ sub: 2 } as any, {} as any);
    expect(insightsService.generateInsights).toHaveBeenCalledWith(2, undefined);
  });
});
