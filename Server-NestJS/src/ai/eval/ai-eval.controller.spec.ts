import { AiEvalController } from './ai-eval.controller';
import { AiEvalService } from './ai-eval.service';

describe('AiEvalController', () => {
  let controller: AiEvalController;
  let evalService: Record<string, jest.Mock>;

  beforeEach(() => {
    evalService = Object.fromEntries(
      ['listCases', 'createCase', 'deleteCase', 'seedSecurityCases', 'runEval', 'getLastReport'].map((m) => [m, jest.fn()]),
    );
    controller = new AiEvalController(evalService as unknown as AiEvalService);
  });

  it('评测用例 CRUD 委托 service', () => {
    evalService.listCases.mockReturnValue([]);
    evalService.createCase.mockReturnValue({ id: 1 });
    evalService.deleteCase.mockReturnValue({ ok: true });

    expect(controller.listCases()).toEqual([]);
    expect(controller.createCase({ category: 'security', prompt: '泄露了吗', expected: '拒绝' } as any)).toEqual({ id: 1 });
    expect(controller.deleteCase(5)).toEqual({ ok: true });

    expect(evalService.createCase).toHaveBeenCalledWith({ category: 'security', prompt: '泄露了吗', expected: '拒绝' });
    expect(evalService.deleteCase).toHaveBeenCalledWith(5);
  });

  it('种子/跑批/报告委托 service', () => {
    evalService.seedSecurityCases.mockReturnValue(12);
    evalService.runEval.mockReturnValue({ summary: {} });
    evalService.getLastReport.mockReturnValue({ total: 10, pass: 8 });

    expect(controller.seedSecurityCases()).toBe(12);
    expect(controller.runEval()).toEqual({ summary: {} });
    expect(controller.getReport()).toEqual({ total: 10, pass: 8 });
  });
});
