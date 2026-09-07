// SPDX-License-Identifier: Apache-2.0

import { INestApplication } from '@nestjs/common';
import { createServer, Server } from 'http';
import request from 'supertest';
import { createTestApp, registerUser } from './helpers';
import { ProxyTool } from '../src/ai/proxy/proxy-tool';
import { ProxyToolRegistryService } from '../src/ai/proxy/proxy-tool.service';
import { ProxyToolRevokerService } from '../src/ai/proxy/proxy-revoker.service';
import { ToolRegistry } from '../src/ai/tools/tool-registry';
import { SettingsService } from '../src/settings/settings.service';
import { DelegationTokenService } from '../src/auth/delegation-token.service';

/**
 * KB-4 失败路径回归语料（B 层·真实链路 e2e）——见 docs/failure-path-corpus.spec.md。
 *
 * 确定性（无 LLM）：真实 app + 真实模拟目标（http server）+ 真实 fetch。覆盖：
 *   FP-3  目标挂起 → 有界超时（AbortController），不无限挂起
 *   FP-7  补偿端点 5xx → 如实 ok:false + 状态（不谎报已撤销）
 *   FP-8  未知结果（204 空体）→ success data:null，如实空不伪造
 *   FP-1/FP-2（重复执行 / token replay）由 A 层 + 既有 spec 覆盖（真执行写副作用需 LLM 确认流，
 *   此处不可达——见 docs/failure-path-corpus.spec.md Known limits）。
 */
describe('失败路径回归（KB-4 / B 层真实链路）', () => {
  let app: INestApplication;
  let target: Server;
  let base: string;
  let delegation: DelegationTokenService;
  let userId: string;
  let registry: ToolRegistry;

  beforeAll(async () => {
    // 模拟旧系统：echo 成功 / /server-error→500 / /no-content→204 / /cancel-500→补偿失败 / /hang→永不返回
    target = createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json');
      if (req.url?.includes('/server-error')) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: 'internal boom' }));
        return;
      }
      if (req.url?.includes('/no-content')) {
        res.statusCode = 204;
        res.end();
        return;
      }
      if (req.url?.includes('/cancel-500')) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: 'compensation refused' }));
        return;
      }
      if (req.url?.includes('/hang')) {
        return; // 挂起：不写响应（测有界超时）
      }
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          method: req.method,
          path: req.url,
          auth: (req.headers.authorization ?? '').slice(7) || undefined,
        }),
      );
    });
    await new Promise<void>((resolve) => target.listen(0, resolve));
    const port = (target.address() as { port: number }).port;
    base = `http://localhost:${port}/api`;

    app = await createTestApp();
    const { accessToken } = await registerUser(app, {
      username: 'failpath_a',
      email: 'failpath_a@test.com',
      password: 'FailPath1234',
      nickname: 'FailPathA',
    });
    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    userId = String((me.body.data as { id: number }).id);
    delegation = app.get(DelegationTokenService);

    // 真实装配：Settings → ProxyToolRegistryService → ToolRegistry（与 ai.module useFactory 同路径）
    const settings = app.get(SettingsService);
    await settings.set(
      'ai_proxy_tools',
      JSON.stringify({
        baseUrl: base,
        audience: 'legacy-erp',
        tools: [
          {
            name: 'proxy_fp_read',
            description: '读合同',
            method: 'GET',
            path: '/contracts/{id}',
            parameters: [{ name: 'id', type: 'string', description: 'id', required: true }],
            riskLevel: 'R1',
          },
        ],
      }),
      'json',
    );
    registry = new ToolRegistry();
    const proxyRegistry = new ProxyToolRegistryService(settings, delegation, registry);
    await proxyRegistry.loadAndRegister();
  });

  afterAll(async () => {
    (target as unknown as { closeAllConnections?: () => void }).closeAllConnections?.();
    await new Promise<void>((resolve) => target.close(() => resolve()));
    await app.close();
  });

  it('基线：Settings 注册的 R1 读工具经真实目标成功（委托身份到达）', async () => {
    const r = await registry.execute('proxy_fp_read', { id: '42' }, userId);
    expect(r.success).toBe(true);
    expect((r.data as any).path).toBe('/api/contracts/42');
    expect((r.data as any).auth).toContain('eyJ'); // 委托 JWT 到达目标
  });

  it('FP-7/5xx：目标系统 500 → 如实 success:false + 状态（不假装成功）', async () => {
    const tool = proxyTool({ name: 'proxy_fp_err', method: 'GET', path: '/server-error', parameters: [] }, 'R1', 2000);
    const r = await tool.execute({}, userId);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/500/);
  });

  it('FP-8：目标 204 空体 → success data:null（未知结果如实空，不编造 data）', async () => {
    const tool = proxyTool({ name: 'proxy_fp_204', method: 'GET', path: '/no-content', parameters: [] }, 'R1', 2000);
    const r = await tool.execute({}, userId);
    expect(r.success).toBe(true);
    expect(r.data).toBeNull();
  });

  it('FP-3：目标挂起 → 短超时内有界返回"超时"，不无限挂起', async () => {
    const tool = proxyTool({ name: 'proxy_fp_hang', method: 'GET', path: '/hang', parameters: [] }, 'R1', 300);
    const started = Date.now();
    const r = await tool.execute({}, userId);
    expect(Date.now() - started).toBeLessThan(3000); // 有界
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/超时/);
  });

  it('FP-7/补偿：撤销调补偿端点 5xx → 如实 ok:false + 状态（不谎报已撤销）', async () => {
    const tool = proxyTool(
      {
        name: 'proxy_fp_cancel',
        method: 'DELETE',
        path: '/contracts/{id}',
        parameters: [{ name: 'id', type: 'string', description: 'id', required: true }],
        revokePath: '/contracts/{id}/cancel-500',
      },
      'R3',
      2000,
    );
    const registryStub = { getTool: () => tool };
    const revoker = new ProxyToolRevokerService(registryStub as any, delegation, 2000);
    const r = await revoker.revoke('proxy_fp_cancel', 7, userId);
    expect(r.ok).toBe(false);
    expect(r.message).toContain('500');
  });

  function proxyTool(
    cfg: {
      name: string;
      method: string;
      path: string;
      parameters: Array<{ name: string; type: string; description: string; required: boolean }>;
      revokePath?: string;
    },
    riskLevel: 'R1' | 'R3',
    timeoutMs: number,
  ): ProxyTool {
    return new ProxyTool(
      { ...cfg, riskLevel } as never,
      delegation,
      base,
      'legacy-erp',
      timeoutMs,
    );
  }
});
