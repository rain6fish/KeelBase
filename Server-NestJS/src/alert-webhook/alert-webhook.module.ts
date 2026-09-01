// SPDX-License-Identifier: Apache-2.0

import { Module, Global } from '@nestjs/common';
import { AlertWebhookService } from './alert-webhook.service';

/** 异常告警 Webhook（RG-4）：全局单例，AllExceptionsFilter 500 时调用。 */
@Global()
@Module({
  providers: [AlertWebhookService],
  exports: [AlertWebhookService],
})
export class AlertWebhookModule {}
