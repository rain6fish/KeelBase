// SPDX-License-Identifier: Apache-2.0

import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { SecurityShowcaseService } from './security-showcase.service';
import { CaslAbilityFactory } from '../../common/casl/casl-ability.factory';

// canary 测试：注入样本「必须」命中防线。miss 时 runInjection 应 fail-loud（防线漂移 → 抛错变红）。
jest.mock('../security/injection-guard', () => {
  const actual = jest.requireActual('../security/injection-guard');
  return { ...actual, detectInjection: jest.fn() };
});

import { detectInjection } from '../security/injection-guard';

describe('SecurityShowcaseService (A2 对抗性证明产品化)', () => {
  let service: SecurityShowcaseService;

  beforeEach(async () => {
    (detectInjection as jest.Mock).mockReturnValue('prompt_injection');
    const module = await Test.createTestingModule({
      providers: [
        SecurityShowcaseService,
        { provide: CaslAbilityFactory, useValue: new CaslAbilityFactory() },
      ],
    }).compile();
    service = module.get(SecurityShowcaseService);
  });

  it('listScenarios 返回 6 个对抗场景（id + 分类，含撤销）', () => {
    expect(service.listScenarios()).toEqual([
      { id: 'injection', category: 'injection' },
      { id: 'unauthorized', category: 'unauthorized' },
      { id: 'r5-block', category: 'risk' },
      { id: 'confirmation', category: 'confirmation' },
      { id: 'unknown-tool', category: 'hallucination' },
      { id: 'revoke', category: 'revoke' },
    ]);
  });

  it('injection：命中 → refused + reasonKey + 4 步决策轨迹（每步带服务端判定）', () => {
    const r = service.runScenario('injection');
    expect(r.outcome).toBe('refused');
    expect(r.reasonKey).toBe('injection.reason');
    expect(r.reasonParams?.feature).toBe('prompt_injection');
    expect(r.invariantKey).toBe('invariant.injection');
    expect(r.trace.map((t) => t.step)).toEqual(['input', 'guard', 'decision', 'outcome']);
    // 判据来自服务端：guard 步的 verdict/basis/evidence 由真实 detectInjection 结果派生
    expect(r.trace[1].verdict).toBe('deny');
    expect(r.trace[1].basisKey).toBe('basis.injection.hit');
    expect(r.trace[1].evidence).toMatchObject({ feature: 'prompt_injection' });
    expect(r.trace[3].evidence).toMatchObject({ executed: false });
  });

  it('canary：注入样本未被 HS-8 命中 → fail-loud（防线漂移立即变红，而非假绿）', () => {
    (detectInjection as jest.Mock).mockReturnValue(null);
    expect(() => service.runScenario('injection')).toThrow(/drift/);
  });

  it('unauthorized：bob 越权读 alex 客户 → denied（evidence 取真实 CASL 结果）', () => {
    const r = service.runScenario('unauthorized');
    expect(r.outcome).toBe('denied');
    expect(r.reasonKey).toBe('unauthorized.reason');
    expect(r.invariantKey).toBe('invariant.unauthorized');
    expect(r.trace[1].verdict).toBe('deny');
    expect(r.trace[1].evidence).toMatchObject({ ownerMatch: false });
    expect(r.trace[2].evidence).toMatchObject({ allowed: false, subject: 'CrmCustomer' });
  });

  it('canary：CASL 放行跨属主读 → fail-loud', async () => {
    const driftModule = await Test.createTestingModule({
      providers: [
        SecurityShowcaseService,
        {
          provide: CaslAbilityFactory,
          useValue: { createForUser: () => ({ can: () => true }) },
        },
      ],
    }).compile();
    const driftService = driftModule.get(SecurityShowcaseService);
    expect(() => driftService.runScenario('unauthorized')).toThrow(/drift/);
  });

  it('r5-block：删除客户（不可逆动作 R5）→ blocked + reasonParams.level=R5', () => {
    const r = service.runScenario('r5-block');
    expect(r.outcome).toBe('blocked');
    expect(r.reasonKey).toBe('r5.reason');
    expect(r.reasonParams?.level).toBe('R5');
    expect(r.invariantKey).toBe('invariant.r5');
    expect(r.trace[1].verdict).toBe('block');
    expect(r.trace[1].evidence).toMatchObject({ riskLevel: 'R5', irreversible: true });
  });

  it('confirmation：创建跟进任务（写操作 R3）→ requiresConfirmation + level=R3', () => {
    const r = service.runScenario('confirmation');
    expect(r.outcome).toBe('requiresConfirmation');
    expect(r.reasonKey).toBe('confirmation.reason');
    expect(r.reasonParams?.level).toBe('R3');
    expect(r.invariantKey).toBe('invariant.confirmation');
    expect(r.trace[1].verdict).toBe('require');
    expect(r.trace[1].evidence).toMatchObject({ riskLevel: 'R3', requiresConfirmation: true });
  });

  it('unknown-tool：模型幻觉出的工具名 → unresolved + reasonParams.tool', () => {
    const r = service.runScenario('unknown-tool');
    expect(r.outcome).toBe('unresolved');
    expect(r.reasonKey).toBe('unknownTool.reason');
    expect(r.reasonParams?.tool).toBe('delete_all_customers');
    expect(r.trace.map((t) => t.step)).toEqual(['input', 'guard', 'decision', 'outcome']);
  });

  it('canary：未注册的工具名在注册表里被解析出来 → fail-loud（工具面被幻觉撑开即变红）', () => {
    // 注册表被换成一个「任何名字都返回工具」的替身 —— 正是漂移的形状
    const drift = service as unknown as { toolRegistry: { getTool: (n: string) => unknown } };
    const original = drift.toolRegistry;
    drift.toolRegistry = { getTool: () => ({ name: 'anything' }) };
    try {
      expect(() => service.runScenario('unknown-tool')).toThrow(/drift/);
    } finally {
      drift.toolRegistry = original;
    }
  });

  it('revoke：本人撤销自己的 AI 副作用 → revoked（档位取真实 resolveRevokeClass）', () => {
    const r = service.runScenario('revoke');
    expect(r.outcome).toBe('revoked');
    expect(r.reasonKey).toBe('revoke.reason');
    expect(r.reasonParams?.revokeClass).toBe('local_compensate');
    expect(r.invariantKey).toBe('invariant.revoke');
    expect(r.trace.map((t) => t.step)).toEqual(['input', 'guard', 'decision', 'outcome']);
    expect(r.trace[1].verdict).toBe('allow');
    expect(r.trace[1].evidence).toMatchObject({ ownerMatch: true, crossUserDenied: true });
    expect(r.trace[2].evidence).toMatchObject({ tool: 'create_followup_task', revokeClass: 'local_compensate' });
    expect(r.trace[3].evidence).toMatchObject({ revoked: true, restorable: true });
  });

  it('canary：撤销档位漂移（确认写不再派生 local_compensate）→ fail-loud', () => {
    const drift = service as unknown as {
      toolRegistry: { getTool: (n: string) => unknown };
    };
    const original = drift.toolRegistry;
    // 一个「不需要确认」的工具替身 → resolveRevokeClass 返回 none，正是档位漂移的形状
    drift.toolRegistry = { getTool: () => ({ name: 'create_followup_task', requiresConfirmation: false }) };
    try {
      expect(() => service.runScenario('revoke')).toThrow(/drift/);
    } finally {
      drift.toolRegistry = original;
    }
  });

  it('未知场景 → 404', () => {
    expect(() => service.runScenario('nope')).toThrow(NotFoundException);
  });
});
