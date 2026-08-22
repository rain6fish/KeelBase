import { AiEvalController } from './ai-eval.controller';
import { AiEvalService } from './ai-eval.service';
import { CHECK_POLICIES_KEY } from '../../common/casl/check-policies.decorator';

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

  it('全部端点声明 manage:all 策略', () => {
    const ability = { can: jest.fn((a: string, r: string) => a === 'manage' && r === 'all') };
    const proto = AiEvalController.prototype as any;
    let count = 0;
    for (const method of Object.getOwnPropertyNames(proto)) {
      if (method === 'constructor') continue;
      const handlers = Reflect.getMetadata(CHECK_POLICIES_KEY, proto[method]);
      if (!handlers) continue;
      count++;
      for (const h of handlers) expect(h(ability)).toBe(true);
    }
    expect(count).toBe(6);
  });
});
