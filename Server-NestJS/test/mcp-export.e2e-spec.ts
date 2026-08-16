import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, registerUser, authHeader } from './helpers';

/**
 * HS-10 MCP 出口 HTTP 层 e2e：真实 MCP JSON-RPC 过 JWT 认证 → 控制器 → 治理层。
 */
describe('MCP Export (HS-10) e2e', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    app = await createTestApp();
    const { accessToken } = await registerUser(app, {
      username: 'mcpuser',
      email: 'mcpuser@example.com',
      password: 'Passw0rd!',
      nickname: 'McpUser',
    });
    token = accessToken;
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

  it('未知方法 → -32601', async () => {
    const res = await post({ jsonrpc: '2.0', id: 5, method: 'bogus' }).expect(201);
    expect(res.body.error.code).toBe(-32601);
  });
});
