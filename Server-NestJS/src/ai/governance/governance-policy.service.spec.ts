// SPDX-License-Identifier: Apache-2.0

import {
  GovernancePolicyService,
  declaredGateMode,
  effectiveGateMode,
} from './governance-policy.service';

describe('GovernancePolicyService (HS-9, D2-1d 自有表)', () => {
  let service: GovernancePolicyService;
  let repo: { findOne: jest.Mock; save: jest.Mock };

  beforeEach(() => {
    repo = { findOne: jest.fn(), save: jest.fn() };
    service = new GovernancePolicyService(repo as any);
  });

  const mockRow = (value: string | null) =>
    repo.findOne.mockResolvedValue(value ? { id: 1, value } : null);

  describe('getPolicy', () => {
    it('未配置 → 默认全放行 + 审计 all', async () => {
      mockRow(null);
      const policy = await service.getPolicy();
      expect(policy.tools).toEqual({});
      expect(policy.audit.granularity).toBe('all');
    });

    it('JSON 字符串策略被解析', async () => {
      mockRow(
        JSON.stringify({
          tools: { create_event: { enabled: false } },
          audit: { granularity: 'write' },
        }),
      );
      const policy = await service.getPolicy();
      expect(policy.tools.create_event.enabled).toBe(false);
      expect(policy.audit.granularity).toBe('write');
    });

    it('非法 JSON → 回退默认', async () => {
      mockRow('{ not valid json');
      const policy = await service.getPolicy();
      expect(policy.tools).toEqual({});
      expect(policy.audit.granularity).toBe('all');
    });

    it('非法 granularity → 回退 all', async () => {
      mockRow(JSON.stringify({ audit: { granularity: 'bogus' } }));
      const policy = await service.getPolicy();
      expect(policy.audit.granularity).toBe('all');
    });
  });

  describe('setPolicy', () => {
    it('写策略 upsert 单行 id=1，返回规范化策略', async () => {
      repo.save.mockResolvedValue({ id: 1 });
      const result = await service.setPolicy({
        tools: { create_event: { enabled: false } },
        audit: { granularity: 'off' },
      });
      expect(repo.save).toHaveBeenCalledWith({
        id: 1,
        value: expect.stringContaining('"enabled":false'),
      });
      expect(result.audit.granularity).toBe('off');
    });

    it('缺失维度回退默认', async () => {
      repo.save.mockResolvedValue({ id: 1 });
      const result = await service.setPolicy({ tools: {} } as any);
      expect(result.audit.granularity).toBe('all');
    });
  });

  describe('getToolPolicy（默认 + 覆盖合并）', () => {
    it('未配置 → 默认值生效', async () => {
      mockRow(null);
      const p = await service.getToolPolicy('create_event', { requiresConfirmation: true });
      expect(p.enabled).toBe(true);
      expect(p.requiresConfirmation).toBe(true);
      expect(p.allowedRoles).toEqual([]);
    });

    it('策略覆盖默认', async () => {
      mockRow(
        JSON.stringify({
          tools: {
            create_event: { enabled: false, requiresConfirmation: false, allowedRoles: ['admin'] },
          },
        }),
      );
      const p = await service.getToolPolicy('create_event', { requiresConfirmation: true });
      expect(p.enabled).toBe(false);
      expect(p.requiresConfirmation).toBe(false);
      expect(p.allowedRoles).toEqual(['admin']);
    });
  });

  describe('便捷方法', () => {
    it('isToolEnabled 读取策略开关', async () => {
      mockRow(JSON.stringify({ tools: { web_search: { enabled: false } } }));
      await expect(service.isToolEnabled('web_search')).resolves.toBe(false);
      await expect(service.isToolEnabled('query_events')).resolves.toBe(true);
    });

    it('requiresConfirmation 覆盖工具默认', async () => {
      mockRow(JSON.stringify({ tools: { create_todo: { requiresConfirmation: false } } }));
      await expect(service.requiresConfirmation('create_todo', true)).resolves.toBe(false);
      await expect(service.requiresConfirmation('other', true)).resolves.toBe(true);
    });

    it('getAllowedRoles 返回白名单', async () => {
      mockRow(JSON.stringify({ tools: { x: { allowedRoles: ['admin'] } } }));
      await expect(service.getAllowedRoles('x')).resolves.toEqual(['admin']);
      await expect(service.getAllowedRoles('y')).resolves.toEqual([]);
    });

    it('getAuditGranularity 返回配置值', async () => {
      mockRow(JSON.stringify({ audit: { granularity: 'off' } }));
      await expect(service.getAuditGranularity()).resolves.toBe('off');
    });
  });

  describe('effectiveGateMode / declaredGateMode（§22.15(4) 门控档位）', () => {
    it('声明风险级推导默认档：R5→blocked / R4→approval / R3→confirm / R0-R2→auto', () => {
      expect(effectiveGateMode(undefined, 'R5')).toBe('blocked');
      expect(declaredGateMode('R4')).toBe('approval');
      expect(declaredGateMode('R3')).toBe('confirm');
      expect(declaredGateMode('R2')).toBe('auto');
      expect(declaredGateMode('R1')).toBe('auto');
      expect(declaredGateMode('R0')).toBe('auto');
    });

    it('mode 覆盖优先于声明档位：可升档 R3→approval、R2→confirm，可降档 R4→auto', () => {
      expect(effectiveGateMode({ mode: 'approval' }, 'R3')).toBe('approval');
      expect(effectiveGateMode({ mode: 'confirm' }, 'R2')).toBe('confirm');
      expect(effectiveGateMode({ mode: 'auto' }, 'R4')).toBe('auto');
    });

    it('R5 恒 blocked：即使写了 mode 覆盖也不可放宽', () => {
      expect(effectiveGateMode({ mode: 'auto' }, 'R5')).toBe('blocked');
      expect(effectiveGateMode({ mode: 'confirm' }, 'R5')).toBe('blocked');
    });

    it('legacy requiresConfirmation 布尔兼容：false→auto（降级）；true 在 R2 工具上→confirm', () => {
      expect(effectiveGateMode({ requiresConfirmation: false }, 'R4')).toBe('auto');
      expect(effectiveGateMode({ requiresConfirmation: false }, 'R3')).toBe('auto');
      expect(effectiveGateMode({ requiresConfirmation: true }, 'R2')).toBe('confirm');
      expect(effectiveGateMode({ requiresConfirmation: true }, 'R4')).toBe('approval');
    });
  });

  describe('resolveGateMode / requiresApproval / requiresConfirmation（§22.15(4) 档位读策略）', () => {
    it('无覆盖时按声明：R4→approval / R3→confirm', async () => {
      mockRow(null);
      await expect(service.resolveGateMode('review_approval_request', 'R4')).resolves.toBe('approval');
      await expect(service.requiresApproval('review_approval_request', 'R4')).resolves.toBe(true);
      await expect(service.resolveGateMode('create_event', 'R3')).resolves.toBe('confirm');
      await expect(service.requiresApproval('create_event', 'R3')).resolves.toBe(false);
    });

    it('策略把 R3 工具升档 approval → 判为需审批', async () => {
      mockRow(JSON.stringify({ tools: { create_customer: { mode: 'approval' } } }));
      await expect(service.resolveGateMode('create_customer', 'R3')).resolves.toBe('approval');
      await expect(service.requiresApproval('create_customer', 'R3')).resolves.toBe(true);
    });

    it('策略把 R4 工具降档 confirm/auto → 不再走审批', async () => {
      mockRow(JSON.stringify({ tools: { review_approval_request: { mode: 'auto' } } }));
      await expect(service.resolveGateMode('review_approval_request', 'R4')).resolves.toBe('auto');
      await expect(service.requiresApproval('review_approval_request', 'R4')).resolves.toBe(false);
    });

    it('requiresConfirmation（模式）在档位下正确：approval/confirm→需确认，auto→免确认', async () => {
      mockRow(JSON.stringify({ tools: { a: { mode: 'approval' }, b: { mode: 'auto' } } }));
      await expect(service.requiresConfirmation('a', false)).resolves.toBe(true);
      await expect(service.requiresConfirmation('b', true)).resolves.toBe(false);
      await expect(service.requiresConfirmation('legacy_off', true)).resolves.toBe(true);
    });
  });
});
