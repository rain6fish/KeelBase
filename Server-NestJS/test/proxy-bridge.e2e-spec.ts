import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createServer, Server } from 'http';
import { createTestApp, registerUser } from './helpers';
import { ProxyTool } from '../src/ai/proxy/proxy-tool';
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
});
