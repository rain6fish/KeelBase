// SPDX-License-Identifier: Apache-2.0

import { Module, Global } from '@nestjs/common';
import { CircuitBreakerService } from './circuit-breaker.service';

/** 熔断器：全局单例，mail/sms/push/ai 外部调用点注入（@Optional 兼容单测）。 */
@Global()
@Module({
  providers: [CircuitBreakerService],
  exports: [CircuitBreakerService],
})
export class CircuitBreakerModule {}
