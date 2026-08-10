import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EvalCase } from './eval-case.entity';
import { AiEvalService } from './ai-eval.service';
import { AiService } from '../ai.service';

function makeEvalRepo() {
  return {
    create: jest.fn((d: any) => d),
    save: jest.fn(async (d: any) => ({ ...d, id: 1 })),
    find: jest.fn().mockResolvedValue([]),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
  };
}

describe('AiEvalService（AI-20）', () => {
  let service: AiEvalService;
  let evalRepo: ReturnType<typeof makeEvalRepo>;
  let aiService: { chat: jest.Mock };

  const cases: EvalCase[] = [
    { id: 1, category: 'tool-hit', prompt: '查一下我今天的事件', expected: '使用工具', enabled: true, createdAt: new Date() },
    { id: 2, category: 'no-tool', prompt: '你好', expected: '直接回复', enabled: true, createdAt: new Date() },
  ];

  beforeEach(async () => {
    evalRepo = makeEvalRepo();
    aiService = { chat: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AiEvalService,
        { provide: getRepositoryToken(EvalCase), useValue: evalRepo },
        { provide: AiService, useValue: aiService },
      ],
    }).compile();
    service = moduleRef.get(AiEvalService);
  });

  it('createCase 保存用例', async () => {
    const c = await service.createCase({ category: 'general', prompt: 'hi' });
    expect(evalRepo.save).toHaveBeenCalled();
    expect(c.id).toBe(1);
  });

  it('listCases 返回全部', async () => {
    evalRepo.find.mockResolvedValue(cases);
    const list = await service.listCases();
    expect(list).toHaveLength(2);
  });

  it('runEval 统计通过/失败，生成报告', async () => {
    evalRepo.find.mockResolvedValue(cases);
    aiService.chat.mockImplementation(async (userId: string, req: any) =>
      req.message.includes('你好') ? { reply: '你好！' } : { reply: '' },
    );

    const report = await service.runEval();

    expect(report.total).toBe(2);
    expect(report.passed).toBe(1); // no-tool 用例回复非空
    expect(report.failed).toBe(1); // tool-hit 用例 reply 空
    expect(service.getLastReport()).toEqual(report);
  });

  it('runEval 用例抛错判失败并记录 error', async () => {
    evalRepo.find.mockResolvedValue(cases);
    aiService.chat.mockRejectedValue(new Error('LLM down'));

    const report = await service.runEval();

    expect(report.passed).toBe(0);
    expect(report.failed).toBe(2);
    expect(report.cases[0].error).toBe('LLM down');
  });

  it('并发 runEval 被拒绝', async () => {
    evalRepo.find.mockResolvedValue(cases);
    aiService.chat.mockImplementation(
      () => new Promise((r) => setTimeout(() => r({ reply: 'x' }), 50)),
    );
    const p1 = service.runEval();
    await expect(service.runEval()).rejects.toThrow('评测已在运行中');
    await p1;
  });

  it('deleteCase 删除', async () => {
    const r = await service.deleteCase(1);
    expect(evalRepo.delete).toHaveBeenCalledWith(1);
    expect(r.deleted).toBe(true);
  });
});
