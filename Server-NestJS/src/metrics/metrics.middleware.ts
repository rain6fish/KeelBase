import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { MetricsService } from './metrics.service';

@Injectable()
export class MetricsMiddleware implements NestMiddleware {
  constructor(private readonly metrics: MetricsService) {}

  use(request: Request, response: Response, next: NextFunction): void {
    const { method } = request;
    // 中间件运行于 Express 路由匹配之前，request.route 此时恒 undefined；
    // route 标签在响应结束时读取（已匹配）；in-flight 用固定 'unmatched' 保证 inc/dec label 一致
    const route = () => request.route?.path || request.path || 'unmatched';

    this.metrics.httpRequestsInFlight.inc({ method, route: 'unmatched' });

    const start = process.hrtime();

    const finish = () => {
      const status = String(response.statusCode);
      const r = route();
      const diff = process.hrtime(start);
      const durationSeconds = diff[0] + diff[1] / 1e9;

      this.metrics.httpRequestsTotal.inc({ method, route: r, status });
      this.metrics.httpRequestDurationSeconds.observe(
        { method, route: r, status },
        durationSeconds,
      );
      this.metrics.httpRequestsInFlight.dec({ method, route: 'unmatched' });
    };

    response.on('finish', finish);
    // 客户端中途断开只触发 close（不触发 finish）→ 补 dec，防 in-flight 计数泄漏
    response.on('close', () => {
      if (!response.writableEnded) {
        this.metrics.httpRequestsInFlight.dec({ method, route: 'unmatched' });
      }
    });

    next();
  }
}
