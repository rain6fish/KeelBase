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

  it('listScenarios 返回 4 个对抗场景（id + 分类）', () => {
    expect(service.listScenarios()).toEqual([
      { id: 'injection', category: 'injection' },
      { id: 'unauthorized', category: 'unauthorized' },
      { id: 'r5-block', category: 'risk' },
      { id: 'confirmation', category: 'confirmation' },
    ]);
  });

  it('injection：命中 → refused + reasonKey + 4 步决策轨迹', () => {
    const r = service.runScenario('injection');
    expect(r.outcome).toBe('refused');
    expect(r.reasonKey).toBe('injection.reason');
    expect(r.reasonParams?.feature).toBe('prompt_injection');
    expect(r.trace.map((t) => t.step)).toEqual(['input', 'guard', 'decision', 'outcome']);
  });

  it('canary：注入样本未被 HS-8 命中 → fail-loud（防线漂移立即变红，而非假绿）', () => {
    (detectInjection as jest.Mock).mockReturnValue(null);
    expect(() => service.runScenario('injection')).toThrow(/drift/);
  });

  it('unauthorized：bob 越权读 alex 客户 → denied', () => {
    const r = service.runScenario('unauthorized');
    expect(r.outcome).toBe('denied');
    expect(r.reasonKey).toBe('unauthorized.reason');
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
  });

  it('confirmation：创建跟进任务（写操作 R3）→ requiresConfirmation + level=R3', () => {
    const r = service.runScenario('confirmation');
    expect(r.outcome).toBe('requiresConfirmation');
    expect(r.reasonKey).toBe('confirmation.reason');
    expect(r.reasonParams?.level).toBe('R3');
  });

  it('未知场景 → 404', () => {
    expect(() => service.runScenario('nope')).toThrow(NotFoundException);
  });
});
