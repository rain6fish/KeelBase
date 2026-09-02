// SPDX-License-Identifier: Apache-2.0

import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { SecurityShowcaseService } from './security-showcase.service';
import { CaslAbilityFactory } from '../../common/casl/casl-ability.factory';

describe('SecurityShowcaseService (A2 对抗性证明产品化)', () => {
  let service: SecurityShowcaseService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        SecurityShowcaseService,
        { provide: CaslAbilityFactory, useValue: new CaslAbilityFactory() },
      ],
    }).compile();
    service = module.get(SecurityShowcaseService);
  });

  it('listScenarios 返回 4 个对抗场景（id + 分类）', () => {
    const scenarios = service.listScenarios();
    expect(scenarios).toEqual([
      { id: 'injection', category: 'injection' },
      { id: 'unauthorized', category: 'unauthorized' },
      { id: 'r5-block', category: 'risk' },
      { id: 'confirmation', category: 'confirmation' },
    ]);
  });

  it('injection：客户资料注入指令 → refused + 4 步决策轨迹', async () => {
    const r = await service.runScenario('injection');
    expect(r.outcome).toBe('refused');
    expect(r.reason).toContain('注入');
    expect(r.trace.map((t) => t.step)).toEqual(['input', 'guard', 'decision', 'outcome']);
  });

  it('unauthorized：bob 越权读 alex 客户 → denied', async () => {
    const r = await service.runScenario('unauthorized');
    expect(r.outcome).toBe('denied');
    expect(r.reason).toContain('DENY');
  });

  it('r5-block：删除客户（不可逆动作）→ blocked', async () => {
    const r = await service.runScenario('r5-block');
    expect(r.outcome).toBe('blocked');
    expect(r.reason).toContain('R5');
  });

  it('confirmation：创建跟进任务（写操作）→ requiresConfirmation', async () => {
    const r = await service.runScenario('confirmation');
    expect(r.outcome).toBe('requiresConfirmation');
    expect(r.reason).toContain('R3');
  });

  it('未知场景 → 404', async () => {
    await expect(service.runScenario('nope')).rejects.toThrow(NotFoundException);
  });
});
