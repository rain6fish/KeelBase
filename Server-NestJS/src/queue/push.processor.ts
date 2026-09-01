// SPDX-License-Identifier: Apache-2.0

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PUSH_SERVICE, PushPayload } from '../push/push.service';
import type { PushService } from '../push/push.service';
import { PushTokenService } from '../push/push-token.service';

export interface PushJobData {
  userId: number;
  title: string;
  body?: string | null;
  type?: string | null;
  link?: string | null;
  targetType?: string | null;
  targetId?: string | null;
}

/**
 * push 队列消费端：把通知推送到该用户全部设备 token。
 */
@Processor('push')
export class PushProcessor extends WorkerHost {
  private readonly logger = new Logger(PushProcessor.name);

  constructor(
    @Inject(PUSH_SERVICE) private pushService: PushService,
    private pushTokenService: PushTokenService,
  ) {
    super();
  }

  async process(job: Job<PushJobData>): Promise<void> {
    const { userId, title, body, type, link, targetType, targetId } = job.data;
    try {
      const tokens = await this.pushTokenService.getTokensForUser(userId);
      if (tokens.length === 0) return;

      const payload: PushPayload = {
        title,
        body: body ?? '',
        data: {
          ...(type ? { type } : {}),
          ...(link ? { link } : {}),
          ...(targetType ? { targetType } : {}),
          ...(targetId ? { targetId } : {}),
        },
      };
      await Promise.all(
        tokens.map((t) =>
          this.pushService.sendToDevice(t.token, payload).catch((err) => {
            this.logger.warn(`[Push] send failed to ${t.token?.slice(0, 8)}...: ${(err as Error).message}`);
          }),
        ),
      );
    } catch (err) {
      this.logger.warn(`[Push] job failed userId=${userId}: ${(err as Error).message}`);
    }
  }
}
