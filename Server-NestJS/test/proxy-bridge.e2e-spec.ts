// SPDX-License-Identifier: Apache-2.0

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createServer, Server } from 'http';
import { DataSource } from 'typeorm';
import { createTestApp, registerUser, loginAs, authHeader } from './helpers';
import { ProxyTool } from '../src/ai/proxy/proxy-tool';
import { ProxyToolRegistryService } from '../src/ai/proxy/proxy-tool.service';
import { ToolRegistry } from '../src/ai/tools/tool-registry';
import { SettingsService } from '../src/settings/settings.service';
import { AiService } from '../src/ai/ai.service';
import { ToolExecutionService } from '../src/ai/tools/tool-execution.service';
import { DelegationTokenService } from '../src/auth/delegation-token.service';
import { AiWriteClaim } from '../src/governance-shared/entities/ai-write-claim.entity';
import { AiToolSideEffect } from '../src/governance-shared/entities/ai-tool-side-effect.entity';
import { AiAuditLog } from '../src/governance-shared/entities/ai-audit-log.entity';
import { TargetStatusLookupRow } from '../src/governance-shared/entities/target-status-lookup.entity';
import { WriteClaimStore } from '../src/governance-shared/services/write-claim.store';
import { buildKey } from '../src/governance-shared/services/effect-shared';

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
  let ds: DataSource;
  let delegation: DelegationTokenService;
  let userAId: string;
  let userAToken: string;
  let adminId: number;
  let adminToken: string;

  /**
   * F-128: what the target answers to a status query, keyed by the write's action key. A key that was
   * never seeded answers `unknown` — carrying no basis, so a wiring mistake reads as "the target did
   * not answer" rather than as a fabricated receipt. Cleared before every case.
   *
   * F-128：目标对状态查询的回答，按写的 action key 索引。没种过的键答 `unknown` —— 不带种类，故接线
   * 错了会表现为「目标没有回答」而不是伪造一张收据。每个用例前清空。
   */
  const targetStatus = new Map<string, { status: string; basis?: string }>();

  /** 等真实 app 的 proxyRegistry 热更新（SettingsService.onChange → reload）把工具注册进 registry */
  async function waitUntilRegistered(registry: ToolRegistry, name: string, timeoutMs = 3000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        registry.getTool(name);
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 50));
      }
    }
    throw new Error(`工具 ${name} 未在 ${timeoutMs}ms 内被热更新注册`);
  }

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
      // F-128: the status query a target may offer (AW-17). The answer is only `status` plus the
      // optional `basis` the probe parses — here seeded per case, so both `current_state` and
      // `receipt` are answers this target really gives over the wire, not fixture values written
      // straight into the evidence table.
      // F-128：目标可以提供的状态查询（AW-17）。回答只有 `status` 与探针解析的可选 `basis` —— 这里按
      // 用例种下，故 `current_state` 与 `receipt` 都是这个目标真的从线上给出的答案，而不是直接写进
      // 证据表的夹具值。
      if (req.method === 'GET' && /\/contracts\/status\//.test(req.url || '')) {
        const key = decodeURIComponent((req.url || '').split('/contracts/status/')[1] ?? '');
        res.end(JSON.stringify(targetStatus.get(key) ?? { status: 'unknown' }));
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
    ds = app.get(DataSource);
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

    // F-128: reconciling a hold is an administrator action; the same app serves both roles.
    // F-128：对账占位是管理员的动作；同一个应用同时服务两种角色。
    const adminUsername = `proxy_admin_${Date.now()}`;
    const adminReg = await registerUser(app, {
      username: adminUsername,
      email: `${adminUsername}@test.com`,
      password: 'ProxyAdmin1',
      nickname: 'ProxyAdmin',
    });
    const adminMe = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${adminReg.accessToken}`)
      .expect(200);
    adminId = adminMe.body.data.id as number;
    await ds.getRepository('users').update(adminId, { role: 'admin' });
    adminToken = (await loginAs(app, adminUsername, 'ProxyAdmin1')).accessToken;
  });

  beforeEach(() => {
    targetStatus.clear();
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

  it('热更新：Settings 变更 → reload → 旧工具移除、新工具注册（免重启）', async () => {
    const settings = app.get(SettingsService);
    const registry = new ToolRegistry();
    const proxyRegistry = new ProxyToolRegistryService(settings, delegation, registry);

    // 配置 A
    await settings.set('ai_proxy_tools', JSON.stringify({
      baseUrl: base,
      audience: 'legacy-erp',
      tools: [{ name: 'proxy_hot_old', description: '旧工具', method: 'GET', path: '/contracts', parameters: [] }],
    }), 'json');
    const first = await proxyRegistry.loadAndRegister();
    expect(first.registered).toEqual(['proxy_hot_old']);

    // 配置 B（改名 + 新增）——模拟 Java 团队改工具后只写 Settings、不重启
    await settings.set('ai_proxy_tools', JSON.stringify({
      baseUrl: base,
      audience: 'legacy-erp',
      tools: [
        { name: 'proxy_hot_new', description: '新工具', method: 'GET', path: '/contracts', parameters: [] },
        { name: 'proxy_hot_write', description: '新写工具', method: 'POST', path: '/contracts', parameters: [{ name: 'title', type: 'string', description: '标题', required: true }], riskLevel: 'R3' },
      ],
    }), 'json');
    const r = await proxyRegistry.reload();
    expect(r.registered).toEqual(['proxy_hot_new', 'proxy_hot_write']);

    // 旧工具已移除、新工具 LLM 可见
    expect(() => registry.getTool('proxy_hot_old')).toThrow('Tool "proxy_hot_old" not found');
    const defs = registry.getToolDefinitions().map((d) => d.function.name);
    expect(defs).toContain('proxy_hot_new');
    expect(defs).toContain('proxy_hot_write');
    // 新写工具仍受确认门控
    expect(registry.requiresConfirmation('proxy_hot_write')).toBe(true);
  });

  it('写工具（ProxyTool）经确认后执行 → 登记 proxy_call 副作用；撤销返回外部补偿语义', async () => {
    const settings = app.get(SettingsService);
    const aiService = app.get(AiService);
    // 写 Settings → 真实 proxyRegistry 热更新（onChange → reload）自动注册到 app 实际 registry
    const appRegistry = (aiService as any).toolRegistry;
    const toolExecution = app.get(ToolExecutionService);
    await settings.set('ai_proxy_tools', JSON.stringify({
      baseUrl: base,
      audience: 'legacy-erp',
      tools: [{ name: 'proxy_side_create', description: '建合同', method: 'POST', path: '/contracts', parameters: [{ name: 'title', type: 'string', description: '标题', required: true }], riskLevel: 'R3', revokePath: 'POST /contracts/{id}/cancel' }],
    }), 'json');
    await waitUntilRegistered(appRegistry, 'proxy_side_create');

    // 经 ToolExecutionService.executeWrite（AI 确认后执行路径）→ 工具注册表执行（ProxyTool → mock 目标）+ 副作用登记
    const effectsService = (toolExecution as any).toolEffectsService;
    const res = await toolExecution.executeWrite('proxy_side_create', { title: '外部合同' }, userAId, 'conv-proxy-side');
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
    // Case E 诚实文案：2xx 仅证「已请求补偿」，结果以目标系统为准（**不声称已撤销**）。
    // ARC-2：注释一直这么写，断言此前却是 `revoked === true` —— 缺陷被钉成了期望。
    // 现在四处同向（单条 / 组级 / 批量 / 跳过），`revoked:false` + `skipped` + `reason:'compensating'`。
    expect(revoke.revoked).toBe(false);
    expect(revoke.skipped).toBe(true);
    expect(revoke.reason).toBe('compensating');
    expect(revoke.revokeStatus).toBe('compensating');
    expect(revoke.message).toMatch(/已请求补偿/);
    expect(revoke.message).toContain('结果以目标系统为准');
    // ARC-3（派发先认领）在**真 sqlite** 上的两个方向由 `revoke-dispatch-claim.spec.ts` 覆盖：
    // 谓词匹配 NULL（首次派发）与在 `compensating` 上命中 0 行（不重复派发）。此处不重复造同一组用例。
  });

  it('B4 治理视图：业务动作（副作用）→ effect + trace；越权 404（按查看者收窄）', async () => {
    // 写 Settings → 热更新注册 B 路径写工具 → 触发副作用（B4：透过业务动作反查治理轨迹）
    const settings = app.get(SettingsService);
    const aiService = app.get(AiService);
    const appRegistry = (aiService as any).toolRegistry;
    const toolExecution = app.get(ToolExecutionService);
    await settings.set('ai_proxy_tools', JSON.stringify({
      baseUrl: base,
      audience: 'legacy-erp',
      tools: [{ name: 'proxy_gov_create', description: '建合同', method: 'POST', path: '/contracts', parameters: [{ name: 'title', type: 'string', description: '标题', required: true }], riskLevel: 'R3' }],
    }), 'json');
    await waitUntilRegistered(appRegistry, 'proxy_gov_create');
    await toolExecution.executeWrite('proxy_gov_create', { title: '治理视图合同' }, userAId, 'conv-gov');
    const effectsService = (toolExecution as any).toolEffectsService;
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

    // 越权：他人 → 404（A8：查询按查看者收窄，不确认该动作存在）
    const other = await registerUser(app, { username: 'proxy_gov_b', email: 'proxygov_b@test.com', password: 'ProxyGov1', nickname: 'ProxyGovB' });
    await request(app.getHttpServer())
      .get(`/api/v1/ai/governance/action/proxy_call/${effect.resultId}`)
      .set(authHeader(other.accessToken))
      .expect(404);
  });

  /**
   * F-128: the **receipt** path, run once for real.
   *
   * R-1 gave the evidence row a `basis` column and taught the probe to read an optional `basis` from
   * the target's answer. Until this case existed, nothing in the repository ever *answered* `receipt`
   * over the wire: the column was read on every surface while its second value was only ever written
   * from a fixture. Here the mock target — the one this repository controls — answers a status query
   * with both kinds, and the reading is followed from the probe through the stored row to all three
   * read faces: the claim's lookup history (`items`), the in-flight list (`lastLookup`), and the
   * release evidence (`releaseLookups`). The distinction is asserted on the field, never by parsing
   * prose.
   *
   * The hold is taken through the production claim path (`WriteClaimStore.claimWrite`) and only its
   * `claimedAt` is moved back — a stale hold is otherwise an hour of waiting, and it is exactly the
   * fixture the hourly sweep would leave behind.
   *
   * F-128：**收据**路径，真的跑一次。
   *
   * R-1 给证据行加了 `basis` 列，也让探针读目标应答里的可选 `basis`。在本用例出现之前，仓内没有任何
   * 目标真的在线上答过 `receipt`：这一列在每个读面上都被读到，而它的第二个取值只从夹具里写过。这里由
   * 本仓控制的模拟目标对状态查询给出两种种类，读数从探针一路追到落库的行，再追到三个读面：占位的查询
   * 历史（`items`）、在途清单（`lastLookup`）、释放证据（`releaseLookups`）。区分由字段断言，绝不
   * 解析散文。
   *
   * 占位走生产路径（`WriteClaimStore.claimWrite`）取得，只把 `claimedAt` 拨回 —— 否则要等一小时，而
   * 这份夹具正是每小时清扫会留下的那种陈旧占位。
   */
  describe('F-128 收据（receipt）路径：我们控制的目标真的答一次收据', () => {
    let seq = 0;
    const uniqueTool = (label: string) => `proxy_f128_${label}_${Date.now()}_${++seq}`;

    const claimsRepo = () => ds.getRepository(AiWriteClaim);
    const lookupsRepo = () => ds.getRepository(TargetStatusLookupRow);
    const auditRepo = () => ds.getRepository(AiAuditLog);
    const store = () => new WriteClaimStore(ds.getRepository(AiToolSideEffect), claimsRepo());

    const age = (claimId: number) =>
      claimsRepo().update(claimId, { claimedAt: new Date(Date.now() - 90 * 60_000) });

    /** Register a write tool whose target answers status queries, so the probe has somewhere to ask. */
    async function registerStatusTool(toolName: string): Promise<void> {
      const settings = app.get(SettingsService);
      const appRegistry = (app.get(AiService) as any).toolRegistry;
      await settings.set('ai_proxy_tools', JSON.stringify({
        baseUrl: base,
        audience: 'legacy-erp',
        tools: [{
          name: toolName,
          description: '建合同（F-128 收据路径）',
          method: 'POST',
          path: '/contracts',
          parameters: [{ name: 'title', type: 'string', description: '标题', required: true }],
          riskLevel: 'R3',
          statusPath: 'GET /contracts/status/{key}',
        }],
      }));
      await waitUntilRegistered(appRegistry, toolName);
    }

    /** Take the hold through the production claim path, then move it past the staleness threshold. */
    async function takeStaleHold(toolName: string, conversationId: string) {
      const ctx = {
        userId: String(userAId),
        conversationId,
        toolName,
        args: { title: `${toolName}:${conversationId}` },
      };
      expect((await store().claimWrite(ctx)).won).toBe(true);
      const key = buildKey(ctx);
      const row = await claimsRepo().findOneByOrFail({ idempotencyKey: key });
      await age(row.id);
      return { ctx, key, claimId: row.id };
    }

    const reconcile = (claimId: number) =>
      request(app.getHttpServer())
        .post(`/api/v1/ai/tool-effects/claims/${claimId}/reconcile`)
        .set(authHeader(adminToken));

    const lookupsFor = (claimId: number) =>
      request(app.getHttpServer())
        .get(`/api/v1/ai/tool-effects/claims/${claimId}/lookups`)
        .set(authHeader(adminToken))
        .expect(200);

    async function listedClaim(toolName: string, claimId: number) {
      const res = await request(app.getHttpServer())
        .get('/api/v1/ai/tool-effects/claims')
        .query({ toolName, decisionState: 'all', limit: 100 })
        .set(authHeader(adminToken))
        .expect(200);
      const row = (res.body.data.items as Array<{ id: number; lastLookup: unknown }>).find(
        (r) => r.id === claimId,
      );
      expect(row).toBeTruthy();
      return row!;
    }

    /** The off-chain `releaseLookups` column of the newest/oldest `claim_release` row for a tool. */
    async function releaseEvidence(toolName: string, index = 0) {
      const rows = (await auditRepo().find({
        where: { action: 'claim_release', tool: toolName } as never,
        order: { id: 'ASC' },
      })) as unknown as Array<{ releaseLookups: string | null }>;
      expect(rows[index]).toBeTruthy();
      return JSON.parse(rows[index].releaseLookups!) as {
        count: number;
        items: Array<{ conclusion: string; basis: string }>;
      };
    }

    it('目标答 executed + receipt ⇒ 账落定；证据行与查询历史都读得出 receipt', async () => {
      const toolName = uniqueTool('exec');
      await registerStatusTool(toolName);
      const { key, claimId } = await takeStaleHold(toolName, 'f128-exec');
      targetStatus.set(key, { status: 'executed', basis: 'receipt' });

      const res = await reconcile(claimId).expect(200);
      expect(res.body.data).toMatchObject({
        outcome: 'reconciled',
        conclusion: 'executed',
        claimStatus: 'settled',
      });
      expect(res.body.data.evidence.basis).toBe('receipt');

      // The row the probe wrote — not a fixture value.
      const [row] = await lookupsRepo().find({ where: { idempotencyKey: key } });
      expect(row).toMatchObject({
        conclusion: 'executed',
        reason: null,
        basis: 'receipt',
        lookedUpBy: String(adminId),
        asUserId: String(userAId),
      });

      const history = await lookupsFor(claimId);
      expect(history.body.data.items[0]).toMatchObject({ conclusion: 'executed', basis: 'receipt' });
    });

    it('目标答 not_executed + receipt ⇒ 释放证据带 receipt；重占位后在途清单的 lastLookup 也带它', async () => {
      const toolName = uniqueTool('release');
      await registerStatusTool(toolName);
      const { ctx, key, claimId } = await takeStaleHold(toolName, 'f128-release');
      targetStatus.set(key, { status: 'not_executed', basis: 'receipt' });

      const res = await reconcile(claimId).expect(200);
      expect(res.body.data).toMatchObject({
        outcome: 'reconciled',
        conclusion: 'not_executed',
        claimStatus: 'released',
      });

      const evidence = await releaseEvidence(toolName);
      expect(evidence.items[0]).toMatchObject({ conclusion: 'not_executed', basis: 'receipt' });

      // Re-claim through the production path: the hold is `claimed` again while the reading it caused
      // stays in the evidence — which is what the in-flight list reads back as `lastLookup`.
      // 经生产路径重占位：占位行回到 `claimed`，而它引起的那次读数仍在证据里 —— 在途清单据此读回 `lastLookup`。
      expect((await store().claimWrite(ctx)).won).toBe(true);
      const listed = await listedClaim(toolName, claimId);
      expect(listed.lastLookup).toMatchObject({ conclusion: 'not_executed', basis: 'receipt' });
    });

    it('同一条占位的两次读数：查询历史与最新释放证据都把 receipt 与 current_state 分得开', async () => {
      const toolName = uniqueTool('both');
      await registerStatusTool(toolName);
      const { ctx, key, claimId } = await takeStaleHold(toolName, 'f128-both');

      // First ask: the target answers from its own acceptance record.
      // 第一次询问：目标按自己的受理记录作答。
      targetStatus.set(key, { status: 'not_executed', basis: 'receipt' });
      await reconcile(claimId).expect(200);

      // Re-claim, move the hold back into the stale window, and ask again — this time the target
      // answers from its live object store.
      // 重占位、把占位时间拨回陈旧区间，再问一次 —— 这一次目标按当前对象存储作答。
      expect((await store().claimWrite(ctx)).won).toBe(true);
      await age(claimId);
      targetStatus.set(key, { status: 'not_executed', basis: 'current_state' });
      await reconcile(claimId).expect(200);

      // One key, two readings: the kind is a field, not prose — the two are told apart by value.
      // 同一个键、两条读数：种类是字段不是散文 —— 两者按取值分得开。
      const history = await lookupsFor(claimId);
      expect((history.body.data.items as Array<{ basis: string }>).map((i) => i.basis)).toEqual([
        'current_state',
        'receipt',
      ]);

      const evidence = await releaseEvidence(toolName, 1);
      expect(evidence.items.map((i) => i.basis)).toEqual(['current_state', 'receipt']);

      // One more re-claim: `lastLookup` takes the newest reading, so it now reads `current_state` —
      // a different value from the `receipt` the same field carried after the first round.
      // 再重占位一次：`lastLookup` 取最新那条读数，于是读作 `current_state` —— 与第一轮之后同一字段带的
      // `receipt` 是两个取值。
      expect((await store().claimWrite(ctx)).won).toBe(true);
      const listed = await listedClaim(toolName, claimId);
      expect(listed.lastLookup).toMatchObject({ conclusion: 'not_executed', basis: 'current_state' });
    });
  });
});
