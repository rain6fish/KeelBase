import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';

describe('MetricsController', () => {
  it('getMetrics 委托 service 返回指标文本', async () => {
    const metrics = { getMetrics: jest.fn().mockResolvedValue('# HELP http_requests_total') };
    const controller = new MetricsController(metrics as unknown as MetricsService);
    await expect(controller.getMetrics()).resolves.toContain('http_requests_total');
    expect(metrics.getMetrics).toHaveBeenCalled();
  });
});
