// SPDX-License-Identifier: Apache-2.0

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp, registerUser, loginAs, authHeader } from './helpers';

/**
 * HS-10 MCP 出口（AR-2：MCP 即 Adapter）e2e：外部 Agent Framework 以 MCP client 身份
 * 经 JWT 认证 → 控制器 → 治理层，Identity / Permission / Audit 全走通。
 */
describe('MCP Export (HS-10 / AR-2) e2e', () => {
  let app: INestApplication;
  let token: string;
  let mcpUserId: number;
  let adminToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    const { accessToken } = await registerUser(app, {
      username: 'mcpuser',
      email: 'mcpuser@example.com',
      password: 'Passw0rd!',
      nickname: 'McpUser',
    });
    token = accessToken;

    // 操作者用户 id：审计归因断言用（谁做的）
    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set(authHeader(token))
      .expect(200);
    mcpUserId = me.body.data.id;

    // 管理员：注册 → 提升角色 → 重新登录（审计查询 admin-only）
    const regAdmin = await registerUser(app, {
      username: 'mcp_admin',
      email: 'mcp_admin@example.com',
      password: 'Passw0rd!',
      nickname: 'McpAdmin',
    });
    const adminMe = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set(authHeader(regAdmin.accessToken))
      .expect(200);
    const ds = app.get(DataSource);
    await ds.getRepository('users').update(adminMe.body.data.id, { role: 'admin' });
    adminToken = (await loginAs(app, 'mcp_admin', 'Passw0rd!')).accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  const post = (body: unknown) =>
    request(app.getHttpServer())
      .post('/api/v1/mcp')
      .set(authHeader(token))
      .send(body as Record<string, unknown>);

  it('未认证 → 401', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/mcp')
      .send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })
      .expect(401);
  });

  it('initialize 返回 serverInfo + tools 能力', async () => {
    const res = await post({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-03-26' },
    }).expect(201);
    expect(res.body.result.serverInfo.name).toBe('keelbase');
    expect(res.body.result.capabilities.tools).toEqual({});
  });

  it('tools/list 返回内置工具（含 query_events）', async () => {
    const res = await post({ jsonrpc: '2.0', id: 2, method: 'tools/list' }).expect(201);
    const names = res.body.result.tools.map((t: { name: string }) => t.name);
    expect(names).toContain('query_events');
    expect(names.some((n: string) => n.startsWith('mcp_'))).toBe(false); // 未注册外部 server
  });

  it('tools/list 工具声明携带治理契约扩展（§4.4：annotations + _meta.keelbase）', async () => {
    const res = await post({ jsonrpc: '2.0', id: 2, method: 'tools/list' }).expect(201);
    const tools = res.body.result.tools as Array<{
      name: string;
      annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
      _meta?: { keelbase?: { riskLevel: string; riskStrategy: string; requiresConfirmation: boolean } };
    }>;
    const query = tools.find((t) => t.name === 'query_events');
    expect(query?._meta?.keelbase?.riskLevel).toBe('R1');
    expect(query?._meta?.keelbase?.requiresConfirmation).toBe(false);
    expect(query?.annotations?.readOnlyHint).toBe(true);
    const create = tools.find((t) => t.name === 'create_event');
    expect(create?._meta?.keelbase?.riskLevel).toBe('R3');
    expect(create?._meta?.keelbase?.riskStrategy).toBe('confirmation');
    expect(create?._meta?.keelbase?.requiresConfirmation).toBe(true);
    expect(create?.annotations?.readOnlyHint).toBe(false);
  });

  it('tools/call 读工具 query_events 以当前用户身份执行', async () => {
    const res = await post({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'query_events', arguments: { start: '2026-01-01', end: '2026-12-31' } },
    }).expect(201);
    expect(res.body.result.isError).toBe(false);
    const text = res.body.result.content[0].text;
    const parsed = JSON.parse(text);
    expect(Array.isArray(parsed)).toBe(true); // 新用户无事件 → 空数组
  });

  it('tools/call 写工具 create_event → 需确认不执行', async () => {
    const res = await post({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'create_event', arguments: {} },
    }).expect(201);
    expect(res.body.result.content[0].text).toContain('requires confirmation');
    expect(res.body.result.isError).toBe(false);
  });

  it('tools/call 读工具执行 → 审计 provider=mcp 归因到调用者（Identity + Audit）', async () => {
    await post({
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: { name: 'query_events', arguments: { start: '2026-01-01', end: '2026-12-31' } },
    }).expect(201);

    const res = await request(app.getHttpServer())
      .get('/api/v1/audit/logs')
      .query({ userId: String(mcpUserId) })
      .set(authHeader(adminToken))
      .expect(200);
    const entries: Array<{ provider: string | null; action: string; detail: string | null; username: string | null }> =
      res.body.data;
    const mcpCalls = entries.filter((e) => e.provider === 'mcp' && e.action === 'tool_call');
    expect(mcpCalls.length).toBeGreaterThan(0);
    expect(mcpCalls.some((e) => (e.detail ?? '').includes('query_events'))).toBe(true);
    // 原则 3：审计带出用户名
    expect(entries.some((e) => e.username === 'mcpuser')).toBe(true);
  });

  it('tools/call 写工具被门控 → 尝试本身也留审计（Permission + Audit）', async () => {
    await post({
      jsonrpc: '2.0',
      id: 6,
      method: 'tools/call',
      params: { name: 'create_event', arguments: { title: 'gated' } },
    }).expect(201);

    const res = await request(app.getHttpServer())
      .get('/api/v1/audit/logs')
      .query({ userId: String(mcpUserId) })
      .set(authHeader(adminToken))
      .expect(200);
    const entries: Array<{ provider: string | null; action: string; detail: string | null }> = res.body.data;
    expect(entries.some((e) => e.provider === 'mcp' && (e.detail ?? '').includes('create_event'))).toBe(true);
  });

  it('T5 tools/call 授权拒绝（普通用户调 adminOnly 工具）→ deny 审计落库 authorization=JSON(reasons)', async () => {
    const res = await post({
      jsonrpc: '2.0',
      id: 8,
      method: 'tools/call',
      params: { name: 'navigate_admin_page', arguments: {} },
    }).expect(201);
    // deny → JSON-RPC error，message 为拒绝语义（admin-only/disabled 等），而非「需确认」门控提示
    expect(res.body.error?.code).toBe(-32603);
    expect(res.body.error?.message ?? '').not.toContain('requires confirmation');

    const r2 = await request(app.getHttpServer())
      .get('/api/v1/audit/logs')
      .query({ userId: String(mcpUserId) })
      .set(authHeader(adminToken))
      .expect(200);
    const entries: Array<{
      provider: string | null;
      action: string;
      detail: string | null;
      isError: boolean;
      authorization: string | null;
    }> = r2.body.data;
    const deny = entries.find(
      (e) => e.provider === 'mcp' && (e.detail ?? '').includes('authorization denied'),
    );
    expect(deny).toBeDefined();
    expect(deny!.isError).toBe(true);
    const reasons = JSON.parse(deny!.authorization ?? '[]');
    expect(Array.isArray(reasons)).toBe(true);
    expect(reasons.some((r: { ok: boolean }) => r.ok === false)).toBe(true);
  });

  it('未知方法 → -32601', async () => {
    const res = await post({ jsonrpc: '2.0', id: 7, method: 'bogus' }).expect(201);
    expect(res.body.error.code).toBe(-32601);
  });
});
