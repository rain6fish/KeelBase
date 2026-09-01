// SPDX-License-Identifier: Apache-2.0

import client from 'prom-client';
import { MetricsService } from './metrics.service';

describe('MetricsService', () => {
  let service: MetricsService;

  beforeAll(() => {
    client.register.clear();
    service = new MetricsService();
  });

  it('初始化注册 Counter/Histogram/Gauge', () => {
    expect(service.httpRequestsTotal).toBeDefined();
    expect(service.httpRequestDurationSeconds).toBeDefined();
    expect(service.httpRequestsInFlight).toBeDefined();
  });

  it('计数器可自增、直方图可观测、仪表可增减', () => {
    expect(() => {
      service.httpRequestsTotal.inc({ method: 'GET', route: '/x', status: '200' });
      service.httpRequestDurationSeconds.observe({ method: 'GET', route: '/x', status: '200' }, 0.1);
      service.httpRequestsInFlight.inc({ method: 'GET', route: '/x' });
      service.httpRequestsInFlight.dec({ method: 'GET', route: '/x' });
    }).not.toThrow();
  });

  it('getMetrics 返回 Prometheus 文本且含注册的指标', async () => {
    const text = await service.getMetrics();
    expect(typeof text).toBe('string');
    expect(text).toContain('http_requests_total');
    expect(text).toContain('http_request_duration_seconds');
    expect(text).toContain('http_requests_in_flight');
  });
});
