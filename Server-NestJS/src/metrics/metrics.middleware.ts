import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { MetricsService } from './metrics.service';

@Injectable()
export class MetricsMiddleware implements NestMiddleware {
  constructor(private readonly metrics: MetricsService) {}

  use(request: Request, response: Response, next: NextFunction): void {
    // 用路由模式而非完整 URL，避免高基数 label
    const route = request.route?.path || 'unmatched';
    const { method } = request;

    this.metrics.httpRequestsInFlight.inc({ method, route });

    const start = process.hrtime();

    response.on('finish', () => {
      const status = String(response.statusCode);
      const diff = process.hrtime(start);
      const durationSeconds = diff[0] + diff[1] / 1e9;

      this.metrics.httpRequestsTotal.inc({ method, route, status });
      this.metrics.httpRequestDurationSeconds.observe(
        { method, route, status },
        durationSeconds,
      );
      this.metrics.httpRequestsInFlight.dec({ method, route });
    });

    next();
  }
}
