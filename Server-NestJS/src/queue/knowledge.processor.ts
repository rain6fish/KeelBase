// SPDX-License-Identifier: Apache-2.0

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { KnowledgeIngestionService } from '../ai/rag/knowledge-ingestion.service';
import { KnowledgeIngestionJobData } from '../ai/rag/knowledge-ingestion.service';

/**
 * knowledge 队列消费端：文档摄入（切块 + 向量化）。
 */
@Processor('knowledge')
export class KnowledgeIngestionProcessor extends WorkerHost {
  private readonly logger = new Logger(KnowledgeIngestionProcessor.name);

  constructor(
    private readonly ingestionService: KnowledgeIngestionService,
  ) {
    super();
  }

  async process(job: Job<KnowledgeIngestionJobData>): Promise<void> {
    try {
      const count = await this.ingestionService.ingestById(job.data.articleId);
      this.logger.log(
        `[Knowledge] ingested article=${job.data.articleId} chunks=${count ?? 0}`,
      );
    } catch (err) {
      this.logger.warn(
        `[Knowledge] ingest job failed article=${job.data.articleId}: ${(err as Error).message}`,
      );
    }
  }
}
