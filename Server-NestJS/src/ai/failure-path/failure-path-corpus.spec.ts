// SPDX-License-Identifier: Apache-2.0

/**
 * KB-4 失败路径回归语料（A 层·确定性 fault-injection）——见 docs/failure-path-corpus.spec.md。
 *
 * 判定：失败下系统**如实记录状态、不假装成功、不重复副作用、证据不丢**。
 * 形态覆盖：FP-1 幂等 / FP-2 确认重放 / FP-3 外部超时 / FP-4 DB-down 不吞 /
 *          FP-5 唯一冲突 skip / FP-6 审计中断 fail-closed / FP-7 补偿失败如实 / FP-8 未知结果如实。
 * 全确定性无 LLM：直接 new service + mock seam（DB / fetch），不启 Nest 容器。
 */
import { ProxyTool } from '../proxy/proxy-tool';
import { ProxyToolRevokerService } from '../proxy/proxy-revoker.service';
import { AiToolEffectsService } from '../tool-effects/ai-tool-effects.service';
import { ConfirmationStore } from '../confirmation/confirmation.store';
import { AuditService } from '../audit/audit.service';

/** 挂起但尊重 AbortSignal 的 fetch（超时测试用） */
const hangingFetch = (_url: unknown, init: RequestInit) =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () =>
      reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
    );
  });

/** mock 副作用 repo（AiToolEffectsService 直构造） */
function effectsRepoMock() {
  return {
    create: jest.fn((d: unknown) => d),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
  };
}

describe('失败路径语料（KB-4 / FP）', () => {
  describe('FP-1/FP-5 重复执行与幂等', () => {
    it('并发唯一冲突（sqlite）→ 幂等 skip 返回既有记录，不重复建', async () => {
      const repo = effectsRepoMock();
      repo.save.mockRejectedValueOnce(new Error('SQLITE_CONSTRAINT: UNIQUE'));
      repo.findOne.mockResolvedValue({ id: 9, resultType: 'event', resultId: 7 });
      const svc = new AiToolEffectsService(repo as any);
      const saved = await svc.record(
        { userId: '1', conversationId: 'c', toolName: 'create_event', args: { title: 'X' } },
        'event',
        7,
      );
      expect(saved.id).toBe(9);
      expect(repo.findOne).toHaveBeenCalledTimes(1);
    });

    it('postgres 唯一冲突码 23505 同样走幂等 skip', async () => {
      const repo = effectsRepoMock();
      repo.save.mockRejectedValueOnce(Object.assign(new Error('duplicate key'), { code: '23505' }));
      repo.findOne.mockResolvedValue({ id: 9, resultType: 'event', resultId: 7 });
      const svc = new AiToolEffectsService(repo as any);
      const saved = await svc.record(
        { userId: '1', conversationId: 'c', toolName: 'create_event', args: { title: 'X' } },
        'event',
        7,
      );
      expect(saved.id).toBe(9);
    });
  });

  describe('FP-4 DB 故障不吞错', () => {
    it('非唯一冲突（DB down）→ 如实上抛，不伪装幂等命中', async () => {
      const repo = effectsRepoMock();
      repo.save.mockRejectedValueOnce(new Error('connection refused'));
      const svc = new AiToolEffectsService(repo as any);
      await expect(
        svc.record(
          { userId: '1', conversationId: 'c', toolName: 'create_event', args: { title: 'X' } },
          'event',
          7,
        ),
      ).rejects.toThrow('connection refused');
      expect(repo.findOne).not.toHaveBeenCalled();
    });
  });

  describe('FP-2 确认 token 一次性（防 replay 二次执行）', () => {
    let store: ConfirmationStore;
    let reqRepo: { save: jest.Mock; update: jest.Mock };

    beforeEach(() => {
      reqRepo = {
        create: jest.fn((d: unknown) => d),
        save: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      };
      store = new ConfirmationStore(reqRepo as any, 60_000);
    });

    it('approve 成功后同一 token 二次 resolve → false（不二次执行）', async () => {
      const { token } = await store.create('u1', 'create_event', { title: 'X' });
      expect(await store.resolve(token, 'u1', 'approve')).toBe(true);
      expect(await store.resolve(token, 'u1', 'approve')).toBe(false);
      expect(await store.resolve(token, 'u1', 'reject')).toBe(false);
    });

    it('他人 token / 未知 token → false（不执行）', async () => {
      const { token } = await store.create('u1', 'create_event', { title: 'X' });
      expect(await store.resolve(token, 'u2', 'approve')).toBe(false);
      expect(await store.resolve('not-a-token', 'u1', 'approve')).toBe(false);
    });

    it('未决 token 超时 → resolve timeout（不泄漏 pending）', async () => {
      const storeTtl = new ConfirmationStore(reqRepo as any, 20);
      const { decision } = await storeTtl.create('u1', 'create_event', { title: 'X' });
      await expect(decision).resolves.toMatchObject({ outcome: 'timeout' });
    });
  });

  describe('FP-3 外部调用超时有界（不无限挂起）', () => {
    const base = 'http://legacy:8080/api';
    const mockDelegation = {
      sign: jest.fn(async (userId: string, audience: string) => ({
        token: `jwt-${userId}-${audience}`,
      })),
    };
    const origFetch = global.fetch;
    afterEach(() => {
      global.fetch = origFetch;
      jest.clearAllMocks();
    });

    it('ProxyTool.execute 目标挂死 → 超时上限内返回"超时"失败', async () => {
      const tool = new ProxyTool(
        {
          name: 'proxy_get_contract',
          description: '查合同',
          method: 'GET',
          path: '/contracts/{id}',
          parameters: [{ name: 'id', type: 'string', description: 'id', required: true }],
          riskLevel: 'R1',
        },
        mockDelegation as any,
        base,
        'legacy',
        30,
      );
      global.fetch = hangingFetch as unknown as typeof fetch;
      const r = await tool.execute({ id: '42' }, 'u1');
      expect(r.success).toBe(false);
      expect(r.error).toMatch(/超时/);
    });

    it('ProxyToolRevokerService 补偿端点挂死 → "超时"，不无限挂起', async () => {
      global.fetch = hangingFetch as unknown as typeof fetch;
      const registry = { getTool: jest.fn().mockReturnValue(makeProxyTool(base)) };
      const delegation = { sign: jest.fn().mockResolvedValue({ token: 't' }) };
      const revoker = new ProxyToolRevokerService(registry as any, delegation as any, 30);
      const r = await revoker.revoke('proxy_create_contract', 7, 'u1');
      expect(r.ok).toBe(false);
      expect(r.message).toContain('超时');
    });
  });

  describe('FP-7 外部补偿失败如实（不谎报已撤销）', () => {
    const base = 'http://legacy:8080/api';
    const mockFetch = jest.fn();
    const origFetch = global.fetch;
    beforeEach(() => {
      global.fetch = mockFetch as unknown as typeof fetch;
      jest.clearAllMocks();
    });
    afterEach(() => {
      global.fetch = origFetch;
    });

    it('补偿端点 5xx → ok:false + 状态（上游可辨未撤销）', async () => {
      const registry = { getTool: jest.fn().mockReturnValue(makeProxyTool(base)) };
      const delegation = { sign: jest.fn().mockResolvedValue({ token: 't' }) };
      mockFetch.mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' });
      const revoker = new ProxyToolRevokerService(registry as any, delegation as any, 1000);
      const r = await revoker.revoke('proxy_create_contract', 7, 'u1');
      expect(r.ok).toBe(false);
      expect(r.message).toContain('500');
    });

    it('未配置 revokePath → 明确"无法撤销"而非假装成功', async () => {
      const registry = {
        getTool: jest.fn().mockReturnValue(makeProxyTool(base, null)),
      };
      const delegation = { sign: jest.fn().mockResolvedValue({ token: 't' }) };
      const revoker = new ProxyToolRevokerService(registry as any, delegation as any, 1000);
      const r = await revoker.revoke('proxy_create_contract', 7, 'u1');
      expect(r.ok).toBe(false);
      expect(r.message).toContain('未配置 revokePath');
    });
  });

  describe('FP-8 未知结果如实（不伪造成功 data）', () => {
    it('ProxyTool 204/空体 → success:true data:null（如实空，不编造 data）', async () => {
      const origFetch = global.fetch;
      const mockDelegation = {
        sign: jest.fn(async (userId: string) => ({ token: `jwt-${userId}` })),
      };
      global.fetch = (async () => ({ ok: true, status: 204, text: async () => '' })) as any;
      try {
        const tool = new ProxyTool(
          {
            name: 'proxy_delete_contract',
            description: '删合同',
            method: 'DELETE',
            path: '/contracts/{id}',
            parameters: [{ name: 'id', type: 'string', description: 'id', required: true }],
            riskLevel: 'R3',
          },
          mockDelegation as any,
          'http://legacy:8080/api',
          'legacy',
        );
        const r = await tool.execute({ id: '7' }, 'u1');
        expect(r.success).toBe(true);
        expect(r.data).toBeNull();
      } finally {
        global.fetch = origFetch;
      }
    });
  });

  describe('FP-6 审计中断 fail-closed（证据不丢 = 宁可报错不悄悄吞）', () => {
    it('sqlite 分支 audit 写失败 → log() 上抛给调用方，且队列仍可续（下一笔成功）', async () => {
      const qb = {
        select: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue(null),
      };
      const logRepo = {
        createQueryBuilder: jest.fn(() => qb),
        save: jest.fn().mockRejectedValueOnce(new Error('disk full')).mockResolvedValueOnce({ id: 1 }),
      };
      const usageRepo = { findOne: jest.fn().mockResolvedValue(null), save: jest.fn() };
      const effectsRepo = { find: jest.fn().mockResolvedValue([]) };
      const auditChain = { computeHash: jest.fn(() => 'h') };
      const dataSource = { options: { type: 'sqlite' } };
      const svc = new AuditService(
        logRepo as any,
        usageRepo as any,
        effectsRepo as any,
        auditChain as any,
        dataSource as any,
      );
      const entry = { userId: '1', action: 'test.fail' } as never;

      await expect(svc.log(entry)).rejects.toThrow('disk full');
      // fail-closed 后串行队列不断裂：下一笔正常落库
      await expect(svc.log(entry)).resolves.toBeUndefined();
      expect(logRepo.save).toHaveBeenCalledTimes(2);
    });

    it('postgres 分支 audit 写失败 → rollback + 上抛（fail-closed）', async () => {
      const runner = {
        connect: jest.fn().mockResolvedValue(undefined),
        startTransaction: jest.fn().mockResolvedValue(undefined),
        query: jest.fn().mockResolvedValue(undefined),
        commitTransaction: jest.fn(),
        rollbackTransaction: jest.fn().mockResolvedValue(undefined),
        release: jest.fn().mockResolvedValue(undefined),
        manager: { save: jest.fn().mockRejectedValue(new Error('pg down')) },
      };
      const logRepo = { save: jest.fn() };
      const usageRepo = { findOne: jest.fn().mockResolvedValue(null), save: jest.fn() };
      const effectsRepo = { find: jest.fn().mockResolvedValue([]) };
      const auditChain = { computeHash: jest.fn(() => 'h') };
      const dataSource = { options: { type: 'postgres' }, createQueryRunner: () => runner };
      const svc = new AuditService(
        logRepo as any,
        usageRepo as any,
        effectsRepo as any,
        auditChain as any,
        dataSource as any,
      );
      const entry = { userId: '1', action: 'test.fail' } as never;

      await expect(svc.log(entry)).rejects.toThrow('pg down');
      expect(runner.rollbackTransaction).toHaveBeenCalled();
    });
  });
});

/** B 路径代理工具（补偿端点 revokePath 可选） */
function makeProxyTool(base: string, revokePath: string | null = 'DELETE /contracts/{id}'): ProxyTool {
  return new ProxyTool(
    {
      name: 'proxy_create_contract',
      description: '创建合同（代理）',
      method: 'POST',
      path: '/contracts',
      parameters: [{ name: 'name', type: 'string', description: '名称', required: true }],
      ...(revokePath === null ? {} : { revokePath }),
    },
    {} as any,
    base,
    'legacy',
  );
}
