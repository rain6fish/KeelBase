// SPDX-License-Identifier: Apache-2.0

import { GovernancePolicyService, policyRevisionOf } from './governance-policy.service';

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

  describe('§22.17③ policy revision（内容指纹版本）', () => {
    it('无行 → 固定空策略指纹', async () => {
      mockRow(null);
      const a = await service.getPolicy();
      const b = await service.getPolicy();
      expect(a.revision).toBe(policyRevisionOf(undefined));
      expect(a.revision).toBe(b.revision);
    });

    it('同内容恒同号、改内容变号', async () => {
      const v1 = JSON.stringify({
        tools: { create_event: { enabled: false } },
        audit: { granularity: 'write' },
      });
      mockRow(v1);
      const r1a = (await service.getPolicy()).revision;
      mockRow(v1);
      const r1b = (await service.getPolicy()).revision;
      expect(r1b).toBe(r1a);
      mockRow(
        JSON.stringify({
          tools: { create_event: { enabled: true } },
          audit: { granularity: 'write' },
        }),
      );
      const r2 = (await service.getPolicy()).revision;
      expect(r2).not.toBe(r1a);
    });

    it('key 顺序无关（normalize 排序）', async () => {
      mockRow(JSON.stringify({ tools: { b: { allowedRoles: ['admin'] }, a: { enabled: false } } }));
      const r1 = (await service.getPolicy()).revision;
      mockRow(JSON.stringify({ tools: { a: { enabled: false }, b: { allowedRoles: ['admin'] } } }));
      const r2 = (await service.getPolicy()).revision;
      expect(r2).toBe(r1);
    });

    it('setPolicy 返回带 revision，与 getPolicy 再读一致', async () => {
      let stored: string | null = null;
      repo.save.mockImplementation(async (args: any) => {
        stored = args.value;
        return { id: 1, value: args.value, updatedAt: new Date('2026-09-04T12:00:00Z') };
      });
      const result = await service.setPolicy({ tools: { create_event: { enabled: false } } });
      expect(result.revision).toBeTruthy();
      mockRow(stored!);
      const reread = await service.getPolicy();
      expect(reread.revision).toBe(result.revision);
    });
  });

  describe('§22.17③ verifyReproducible（决策可复现）', () => {
    it('无 policyRevision → verifiable false（历史记录）', async () => {
      const res = await service.verifyReproducible({
        tool: 'create_event',
        checks: [{ name: 'tool_enabled', ok: true }],
      });
      expect(res.verifiable).toBe(false);
      expect(res.note).toContain('历史');
    });

    it('策略未漂移 → 可复现', async () => {
      const stored = JSON.stringify({ tools: { create_event: { enabled: true } } });
      mockRow(stored);
      const ra = (await service.getPolicy()).revision as string;
      const res = await service.verifyReproducible({
        tool: 'create_event',
        checks: [{ name: 'tool_enabled', ok: true }],
        policyRevision: ra,
      });
      expect(res.verifiable).toBe(true);
      expect(res.policyChanged).toBe(false);
      expect(res.reproducible).toBe(true);
    });

    it('策略漂移但该工具放行判定未变 → 仍可复现', async () => {
      mockRow(JSON.stringify({ tools: { web_search: { enabled: false } } }));
      const res = await service.verifyReproducible({
        tool: 'create_event',
        checks: [{ name: 'tool_enabled', ok: true }],
        policyRevision: 'oldhash',
      });
      expect(res.verifiable).toBe(true);
      expect(res.policyChanged).toBe(true);
      expect(res.toolDecisionChanged).toBe(false);
      expect(res.reproducible).toBe(true);
    });

    it('策略漂移且该工具被禁用 → 不可复现', async () => {
      mockRow(JSON.stringify({ tools: { create_event: { enabled: false } } }));
      const res = await service.verifyReproducible({
        tool: 'create_event',
        checks: [{ name: 'tool_enabled', ok: true }],
        policyRevision: 'oldhash',
      });
      expect(res.verifiable).toBe(true);
      expect(res.policyChanged).toBe(true);
      expect(res.toolDecisionChanged).toBe(true);
      expect(res.reproducible).toBe(false);
    });
  });
});
