import { EventEmitter } from 'events';
import client from 'prom-client';
import { MetricsMiddleware } from './metrics.middleware';
import { MetricsService } from './metrics.service';

describe('MetricsMiddleware', () => {
  let middleware: MetricsMiddleware;
  let metrics: MetricsService;

  beforeAll(() => {
    client.register.clear();
    metrics = new MetricsService();
    middleware = new MetricsMiddleware(metrics);
  });

  it('请求 start/finish 记录 total/duration 并增减 in-flight', () => {
    const incSpy = jest.spyOn(metrics.httpRequestsInFlight, 'inc');
    const decSpy = jest.spyOn(metrics.httpRequestsInFlight, 'dec');
    const totalSpy = jest.spyOn(metrics.httpRequestsTotal, 'inc');
    const observeSpy = jest.spyOn(metrics.httpRequestDurationSeconds, 'observe');

    const request = { route: { path: '/events' }, method: 'GET' } as any;
    const response = new EventEmitter() as any;
    response.statusCode = 200;

    const next = jest.fn();
    middleware.use(request, response, next);
    expect(next).toHaveBeenCalled();
    // in-flight 是 gauge，inc/dec 用固定 unmatched 保证 label 一致（中间件入口路由未匹配）
    expect(incSpy).toHaveBeenCalledWith({ method: 'GET', route: 'unmatched' });

    response.emit('finish');

    expect(decSpy).toHaveBeenCalledWith({ method: 'GET', route: 'unmatched' });
    expect(totalSpy).toHaveBeenCalledWith({ method: 'GET', route: '/events', status: '200' });
    expect(observeSpy).toHaveBeenCalledWith(
      { method: 'GET', route: '/events', status: '200' },
      expect.any(Number),
    );
  });

  it('无路由时用 unmatched 标签', () => {
    const incSpy = jest.spyOn(metrics.httpRequestsInFlight, 'inc');
    const request = { method: 'POST' } as any;
    const response = new EventEmitter() as any;
    response.statusCode = 400;

    middleware.use(request, response, jest.fn());
    expect(incSpy).toHaveBeenCalledWith({ method: 'POST', route: 'unmatched' });
  });

  it('客户端断连（close 无 finish）补 dec in-flight 防泄漏', () => {
    const incSpy = jest.spyOn(metrics.httpRequestsInFlight, 'inc');
    const decSpy = jest.spyOn(metrics.httpRequestsInFlight, 'dec');
    const request = { method: 'GET' } as any;
    const response = new EventEmitter() as any;
    response.writableEnded = false; // 未正常 finish

    middleware.use(request, response, jest.fn());
    response.emit('close');

    expect(decSpy).toHaveBeenCalledWith({ method: 'GET', route: 'unmatched' });
  });
});
