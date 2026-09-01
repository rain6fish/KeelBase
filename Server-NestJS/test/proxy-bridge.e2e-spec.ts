// SPDX-License-Identifier: Apache-2.0

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createServer, Server } from 'http';
import { createTestApp, registerUser, authHeader } from './helpers';
import { ProxyTool } from '../src/ai/proxy/proxy-tool';
import { ProxyToolRegistryService } from '../src/ai/proxy/proxy-tool.service';
import { ToolRegistry } from '../src/ai/tools/tool-registry';
import { SettingsService } from '../src/settings/settings.service';
import { AiService } from '../src/ai/ai.service';
import { DelegationTokenService } from '../src/auth/delegation-token.service';

/**
 * AI Bridge B 路径（§4）：ProxyTool → 模拟 Java 系统端到端验收。
 *
 * 确定性（无 LLM，可进 CI）：
 *   - 读工具：委托身份注入目标（Authorization: Bearer 委托 JWT）+ 目标识别用户
 *   - 写工具：R3 → requiresConfirmation 门控（走现有确认流）
 *   - 越权：目标拒绝（401）→ 工具失败透传（供 Agent 回退）
 * 真实验签在 Java 端（共享 DELEGATION_SECRET，§5）；模拟 server 用 echo 验证委托身份已到达目标。
 */
describe('AI Bridge B 路径：ProxyTool × 模拟 Java 系统', () => {
  let app: INestApplication;
  let server: Server;
  let base: string;
  let delegation: DelegationTokenService;
  let userAId: string;
  let userAToken: string;

  beforeAll(async () => {
    // 模拟 Java 系统：验 Authorization（Bearer）→ echo 请求用户/方法/路径/body；无 token 或 /forbidden → 401
    server = createServer((req, res) => {
      const auth = req.headers.authorization;
      res.setHeader('Content-Type', 'application/json');
      if (!auth || !auth.startsWith('Bearer ')) {
        res.statusCode = 401;
        res.end(JSON.stringify({ error: 'unauthorized' }));
        return;
      }
      if (req.url?.includes('/forbidden')) {
        res.statusCode = 403;
        res.end(JSON.stringify({ error: 'forbidden' }));
        return;
      }
      // Java 端补偿端点（B 路径撤销约定）：POST /contracts/{id}/cancel → 记录 + 200
      if (req.method === 'POST' && /\/contracts\/\d+\/cancel$/.test(req.url || '')) {
        res.end(JSON.stringify({ cancelled: true, user: auth.slice(7), path: req.url }));
        return;
      }
      let body = '';
      req.on('data', (d) => (body += d));
      req.on('end', () => {
        res.end(JSON.stringify({ user: auth.slice(7), method: req.method, path: req.url, body: body || undefined }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as { port: number }).port;
    base = `http://localhost:${port}/api`;

    app = await createTestApp();
    const { accessToken } = await registerUser(app, {
      username: 'proxy_a',
      email: 'proxy_a@test.com',
      password: 'ProxyA1234',
      nickname: 'ProxyA',
    });
    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    userAId = String(me.body.data.id);
    userAToken = accessToken;
    delegation = app.get(DelegationTokenService);
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await app.close();
  });

  it('读工具（R1 自动）：委托身份注入目标 + 目标识别用户', async () => {
    const tool = new ProxyTool(
      {
        name: 'proxy_get_contract',
        description: '查合同',
        method: 'GET',
        path: '/contracts/{id}',
        parameters: [{ name: 'id', type: 'string', description: '合同 id', required: true }],
        riskLevel: 'R1',
      },
      delegation,
      base,
      'legacy-erp',
    );
    const r = await tool.execute({ id: '42' }, userAId);
    expect(r.success).toBe(true);
    // 目标收到委托 JWT 且识别到用户路径
    expect((r.data as any).user).toContain('eyJ'); // JWT 头
    expect((r.data as any).path).toBe('/api/contracts/42');
    expect((r.data as any).method).toBe('GET');
  });

  it('写工具（R3）：requiresConfirmation 门控 + body 送达目标', async () => {
    const tool = new ProxyTool(
      {
        name: 'proxy_create_contract',
        description: '建合同',
        method: 'POST',
        path: '/contracts',
        parameters: [{ name: 'title', type: 'string', description: '标题', required: true }],
      },
      delegation,
      base,
      'legacy-erp',
    );
    expect(tool.requiresConfirmation).toBe(true); // R3 缺省 → 人工确认门控
    const r = await tool.execute({ title: '新合同' }, userAId);
    expect(r.success).toBe(true);
    expect((r.data as any).method).toBe('POST');
    expect(JSON.parse((r.data as any).body)).toEqual({ title: '新合同' });
  });

  it('越权：目标拒绝（403/401）→ 工具失败透传（供 Agent 回退）', async () => {
    const tool = new ProxyTool(
      {
        name: 'proxy_forbidden',
        description: '越权路径',
        method: 'GET',
        path: '/forbidden',
        parameters: [],
      },
      delegation,
      base,
      'legacy-erp',
    );
    const r = await tool.execute({}, userAId);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/403/);
  });

  it('生成器产物（openapi-proxy 输出形态）→ Settings → 运行时注册 → 读自动/写确认 + 委托身份可调用', async () => {
    // 复刻 ai.module useFactory 的组装：真实 SettingsService + DelegationTokenService + ToolRegistry
    const settings = app.get(SettingsService);
    const registry = new ToolRegistry();
    const proxyRegistry = new ProxyToolRegistryService(settings, delegation, registry);
    // `keelbase-init --import-openapi-proxy` 的产物形态（riskLevel 显式：读 R1 / 写 R3）
    const cfg = {
      baseUrl: base,
      audience: 'legacy-erp',
      tools: [
        { name: 'proxy_gen_list', description: '列合同', method: 'GET', path: '/contracts', parameters: [{ name: 'page', type: 'integer', description: '页码', required: false }], riskLevel: 'R1' },
        { name: 'proxy_gen_create', description: '建合同', method: 'POST', path: '/contracts', parameters: [{ name: 'title', type: 'string', description: '标题', required: true }], riskLevel: 'R3' },
      ],
    };
    await settings.set('ai_proxy_tools', JSON.stringify(cfg), 'json');
    const r = await proxyRegistry.loadAndRegister();
    expect(r.registered).toEqual(['proxy_gen_list', 'proxy_gen_create']);

    // 读自动 / 写需确认（riskLevel 派生门控）
    expect(registry.requiresConfirmation('proxy_gen_list')).toBe(false);
    expect(registry.requiresConfirmation('proxy_gen_create')).toBe(true);
    expect(registry.riskLevel('proxy_gen_create')).toBe('R3');

    // 读工具经运行时执行 → mock 目标收到 + 委托身份注入
    const res = await registry.execute('proxy_gen_list', { page: '1' }, userAId);
    expect(res.success).toBe(true);
    expect((res.data as any).method).toBe('GET');
    expect((res.data as any).user).toContain('eyJ'); // 委托 JWT 到达目标
    // 工具定义 LLM 可见（含写工具参数 schema）
    const defs = registry.getToolDefinitions().map((d) => d.function.name);
    expect(defs).toContain('proxy_gen_create');
  });

  it('写工具（ProxyTool）经确认后执行 → 登记 proxy_call 副作用；撤销返回外部补偿语义', async () => {
    const settings = app.get(SettingsService);
    const aiService = app.get(AiService);
    // 注册进 app 的实际 ToolRegistry（_executeWriteTool 走 AiService 的注册表执行）
    const appRegistry = (aiService as any).toolRegistry;
    const proxyRegistry = new ProxyToolRegistryService(settings, delegation, appRegistry);
    await settings.set('ai_proxy_tools', JSON.stringify({
      baseUrl: base,
      audience: 'legacy-erp',
      tools: [{ name: 'proxy_side_create', description: '建合同', method: 'POST', path: '/contracts', parameters: [{ name: 'title', type: 'string', description: '标题', required: true }], riskLevel: 'R3', revokePath: 'POST /contracts/{id}/cancel' }],
    }), 'json');
    const reg = await proxyRegistry.loadAndRegister();
    expect(reg.registered).toEqual(['proxy_side_create']);

    // 经 AiService._executeWriteTool（AI 确认后执行路径）→ 工具注册表执行（ProxyTool → mock 目标）+ 副作用登记
    const effectsService = (aiService as any).toolEffectsService;
    const res = await (aiService as any)._executeWriteTool('proxy_side_create', { title: '外部合同' }, userAId, 'conv-proxy-side');
    expect(res.success).toBe(true);
    const list = await effectsService.list({ userId: Number(userAId) });
    const effect = list.items.find((e: any) => e.toolName === 'proxy_side_create');
    expect(effect).toBeDefined();
    expect(effect.resultType).toBe('proxy_call');
    expect(effect.targetExists).toBe(true);
    expect(effect.targetTitle).toContain('外部系统写调用');

    // 撤销外部副作用：revoker 调 Java 补偿端点（revokePath）→ compensated:true
    const revoke = await effectsService.revokeOwned(effect.id, userAId);
    expect(revoke.external).toBe(true);
    expect(revoke.compensated).toBe(true);
    expect(revoke.revoked).toBe(true);
    expect(revoke.message).toMatch(/已补偿/);
  });

  it('B4 治理视图：业务动作（副作用）→ effect + trace；越权 403', async () => {
    // 注册一个 B 路径写工具 + 触发副作用（B4：透过业务动作反查治理轨迹）
    const settings = app.get(SettingsService);
    const aiService = app.get(AiService);
    const appRegistry = (aiService as any).toolRegistry;
    const proxyRegistry = new ProxyToolRegistryService(settings, delegation, appRegistry);
    await settings.set('ai_proxy_tools', JSON.stringify({
      baseUrl: base,
      audience: 'legacy-erp',
      tools: [{ name: 'proxy_gov_create', description: '建合同', method: 'POST', path: '/contracts', parameters: [{ name: 'title', type: 'string', description: '标题', required: true }], riskLevel: 'R3' }],
    }), 'json');
    await proxyRegistry.loadAndRegister();
    await (aiService as any)._executeWriteTool('proxy_gov_create', { title: '治理视图合同' }, userAId, 'conv-gov');
    const effectsService = (aiService as any).toolEffectsService;
    const list = await effectsService.list({ userId: Number(userAId) });
    const effect = list.items.find((e: any) => e.toolName === 'proxy_gov_create');
    expect(effect).toBeDefined();

    // 本人可读治理视图（effect 元数据 + 决策轨迹 trace，trace 尽力而为）
    const res = await request(app.getHttpServer())
      .get(`/api/v1/ai/governance/action/proxy_call/${effect.resultId}`)
      .set(authHeader(userAToken))
      .expect(200);
    expect(res.body.data.effect.resultType).toBe('proxy_call');
    expect(res.body.data.effect.resultId).toBe(effect.resultId);
    expect(res.body.data.effect.toolName).toBe('proxy_gov_create');
    // trace 为 null（conv-gov 无真实对话）或含步骤——不强制，重点是 effect 反查通

    // 越权：他人 → 403
    const other = await registerUser(app, { username: 'proxy_gov_b', email: 'proxygov_b@test.com', password: 'ProxyGov1', nickname: 'ProxyGovB' });
    await request(app.getHttpServer())
      .get(`/api/v1/ai/governance/action/proxy_call/${effect.resultId}`)
      .set(authHeader(other.accessToken))
      .expect(403);
  });
});
