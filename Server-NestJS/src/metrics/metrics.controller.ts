import { Controller, Get, Header } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../auth/guards/public.decorator';
import { Raw } from '../common/decorators/raw.decorator';
import { MetricsService } from './metrics.service';

@ApiTags('指标')
@SkipThrottle()
@Controller({ path: 'metrics', version: '1' })
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Public()
  @Get()
  @Raw()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  @ApiOperation({ summary: 'Prometheus 指标（Prometheus 抓取端点）' })
  getMetrics(): Promise<string> {
    return this.metrics.getMetrics();
  }
}
