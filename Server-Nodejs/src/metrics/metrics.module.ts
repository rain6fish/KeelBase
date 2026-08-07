import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { MetricsMiddleware } from './metrics.middleware';

@Module({
  controllers: [MetricsController],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class MetricsModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // path-to-regexp v8 要求命名参数通配（`*` 裸通配已被弃用）
    consumer.apply(MetricsMiddleware).forRoutes('{*path}');
  }
}
