// SPDX-License-Identifier: Apache-2.0

import { Job } from 'bullmq';
import { KnowledgeIngestionProcessor } from './knowledge.processor';
import { KnowledgeIngestionService } from '../ai/rag/knowledge-ingestion.service';

describe('KnowledgeIngestionProcessor', () => {
  let processor: KnowledgeIngestionProcessor;
  let ingestionService: { ingestById: jest.Mock };

  const makeJob = (articleId: number) =>
    ({ id: 'job-1', name: 'knowledge', data: { articleId } }) as Job;

  beforeEach(() => {
    ingestionService = { ingestById: jest.fn() };
    processor = new KnowledgeIngestionProcessor(
      ingestionService as unknown as KnowledgeIngestionService,
    );
  });

  it('成功摄入：调用 ingestById 并吞掉返回值', async () => {
    ingestionService.ingestById.mockResolvedValue(3);
    await expect(processor.process(makeJob(10))).resolves.toBeUndefined();
    expect(ingestionService.ingestById).toHaveBeenCalledWith(10);
  });

  it('摄入失败：记录日志不抛出', async () => {
    ingestionService.ingestById.mockRejectedValue(new Error('vectorize failed'));
    await expect(processor.process(makeJob(99))).resolves.toBeUndefined();
    expect(ingestionService.ingestById).toHaveBeenCalledWith(99);
  });
});
