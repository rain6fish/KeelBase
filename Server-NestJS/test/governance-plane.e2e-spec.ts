// SPDX-License-Identifier: Apache-2.0

import * as fs from 'fs';
import * as path from 'path';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { INestApplication, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AiConfirmationRequest } from '../src/ai/approvals/ai-confirmation-request.entity';

/**
 * D2-2 独立治理控制平面 —— 真实 HTTP e2e（docs/ai-governance.spec.md / governance-plane）。
 *
 * 与纯单测互补：用 supertest 起 GovernanceModule（独立 GovernanceDataSource 治理库，独立进程等价），
 * 在 HTTP 层覆盖两类"纯单测不可达"的守卫路径：
 *  ① @CheckPolicies((a) => a.can('manage','all')) 路由策略 lambda + PoliciesGuard（admin→200 / user→403 / 无 token→401）
 *  ② ExternalGovernanceController 的 @UseGuards(GovernanceApiGuard) 服务身份（x-api-key / Bearer，错/缺→401）
 *
 * 技术要点：
 *  - GovernanceDataSource 在模块 import 时即读取 env（GOVERNANCE_DB_PATH/JWT_SECRET…）→ 必须在
 *    beforeAll 里先 set process.env、再延迟加载 GovernanceModule（CJS 运行时不支持 import()、
 *    静态 import 又会被 hoist 先于 env 设置执行 → 用延迟 require 让 ts-jest 在 env 就位后求值模块图）。
 *  - synchronize 条件 nodeEnv!=='production'，NODE_ENV=test → 建表自动完成，无需迁移。
 *  - 认证复用主应用共享 JWT_SECRET 手签 { sub, username, role }（JwtStrategy 只验 sub/username + secret）。
 *  - GOVERNANCE_TARGET_URL 置空串以中性化 approve-by / revoke 对业务系统的回调分支（空串 falsy → 本地/400 分支）。
 *  - 不 listen，用 app.getHttpServer() + supertest；独立治理库 ./data/governance_e2e.sqlite，跑完清理。
 */
describe('治理台真实 HTTP e2e（D2-2 独立控制平面）', () => {
  let app: INestApplication;
  let ds: DataSource;
  let adminToken: string;
  let userToken: string;
  let govDbPath: string;

  // 种子行 token（beforeAll 落治理库，供 pending/decided 列表断言真实 DB 往返）
  const pendingToken = `e2e-pending-${Date.now()}`;
  const decidedToken = `e2e-decided-${Date.now()}`;
  // 空库默认策略内容指纹（⑥ 捕获 → ⑧ 证明 apply-preset 已写库变更）
  let defaultPolicyRevision: string | undefined;

  // 与 governance-data-source / ConfigService 同源（process.env 优先于 .env 文件）
  const JWT_SECRET = 'e2e-governance-jwt-secret-0123456789abcdef!';
  const GOV_API_KEY = 'e2e-governance-api-key-test-9f8e';

  const govServer = () => app.getHttpServer();
  // token 在 beforeAll 才签发 → 用函数延迟取值（对象字面量会捕获 undefined）
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const asAdmin = () => auth(adminToken);
  const asUser = () => auth(userToken);

  beforeAll(async () => {
    // —— 1) 先设测试隔离 env（须早于 GovernanceModule import，DataSource 模块级读 env）——
    govDbPath = path.resolve(process.cwd(), 'data', 'governance_e2e.sqlite');
    if (fs.existsSync(govDbPath)) fs.unlinkSync(govDbPath);
    process.env.NODE_ENV = 'test';
    process.env.DB_TYPE = 'sqlite';
    process.env.JWT_SECRET = JWT_SECRET;
    process.env.JWT_EXPIRES_IN = '15m';
    process.env.GOVERNANCE_API_KEY = GOV_API_KEY;
    // 中性化回调分支：空串 falsy → approve-by 走 400、revoke 走本地 revoker，杜绝向真实业务系统发请求
    process.env.GOVERNANCE_TARGET_URL = '';
    process.env.GOVERNANCE_DB_PATH = govDbPath;
    process.env.ENCRYPTION_KEY = 'e640ea00aa5e1e0425b174fdbd2c56cd07c56b7f12daa57a6180bce226bcb1c4';
    process.env.ENCRYPTION_HMAC_KEY = 'c6c1385a82395cafcfc856f775e1fb54efd985aa628869e2652d86f500b84bfd';

    // —— 2) 动态加载（env 已就位）——镜像 main.ts：setGlobalPrefix('api') + versioning URI '1' → /api/v1/...
    // CJS 运行时不可用 import()（jest 报 dynamic import without --experimental-vm-modules）；改用延迟 require，
    // ts-jest 在 require 时即时 transform .ts，效果等同「先设 env 再求值 GovernanceDataSource/GovernanceModule」。
    const { GovernanceModule } = require('../src/governance/governance.module') as {
      GovernanceModule: new () => unknown;
    };
    const moduleRef = await Test.createTestingModule({ imports: [GovernanceModule] }).compile();
    app = moduleRef.createNestApplication();
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.setGlobalPrefix('api');
    await app.init();

    ds = app.get(DataSource);

    // —— 3) 手签 JWT（共享主应用 secret + role）——
    adminToken = jwt.sign({ sub: 1, username: 'gov_admin', role: 'admin' }, JWT_SECRET, { expiresIn: '1h' });
    userToken = jwt.sign({ sub: 2, username: 'gov_user', role: 'user' }, JWT_SECRET, { expiresIn: '1h' });

    // —— 4) 种子审批行（真实治理库插入；只测读列表 + 契约，不依赖业务表）——
    await ds.getRepository(AiConfirmationRequest).save([
      {
        token: pendingToken,
        toolName: 'review_approval_request',
        args: '{}',
        operatorId: '7',
        riskLevel: 'R4',
        status: 'pending',
        kind: 'single',
        conversationId: 'governance-plane-e2e',
      },
      {
        token: decidedToken,
        toolName: 'review_approval_request',
        args: '{}',
        operatorId: '7',
        riskLevel: 'R4',
        status: 'approved',
        approverId: '8',
        kind: 'single',
        decidedAt: new Date(),
      },
    ]);
  });

  afterAll(async () => {
    if (app) await app.close();
    if (govDbPath && fs.existsSync(govDbPath)) {
      try {
        fs.unlinkSync(govDbPath);
      } catch {
        /* 清理失败不阻塞套件结果 */
      }
    }
  });

  // ============ GovernanceController /api/v1/ai/*（@CheckPolicies manage-all → admin） ============

  it('① GET /api/v1/ai/health 公开可及（治理台健康检查，@Public 无 JWT）', async () => {
    const res = await request(govServer()).get('/api/v1/ai/health').expect(200);
    expect(res.body).toMatchObject({ ok: true, service: 'governance' });
  });

  it('② GET /api/v1/ai/confirmations/pending：admin 200 + 真库返回种子 pending 行', async () => {
    const res = await request(govServer())
      .get('/api/v1/ai/confirmations/pending')
      .set(asAdmin())
      .expect(200);
    const rows = res.body as Array<{ token: string; status: string; riskLevel: string }>;
    expect(Array.isArray(rows)).toBe(true);
    const seeded = rows.find((r) => r.token === pendingToken);
    expect(seeded).toBeDefined();
    expect(seeded!.status).toBe('pending');
    expect(seeded!.riskLevel).toBe('R4');
  });

  it('③ GET /api/v1/ai/confirmations/pending：无 token → 401（JwtAuthGuard 全局门禁）', async () => {
    const res = await request(govServer()).get('/api/v1/ai/confirmations/pending').expect(401);
    expect(res.body.statusCode).toBe(401);
  });

  it('④ GET /api/v1/ai/confirmations/pending：user role → 403（@CheckPolicies lambda 拒绝 + explanation）', async () => {
    const res = await request(govServer())
      .get('/api/v1/ai/confirmations/pending')
      .set(asUser())
      .expect(403);
    expect(res.body.statusCode).toBe(403);
    expect(res.body.explanation?.deniedBy).toBe('casl');
  });

  it('⑤ GET /api/v1/ai/confirmations/decided：admin 200 + 真库返回种子 approved 行', async () => {
    const res = await request(govServer())
      .get('/api/v1/ai/confirmations/decided')
      .set(asAdmin())
      .expect(200);
    const rows = res.body as Array<{ token: string; status: string }>;
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.find((r) => r.token === decidedToken)).toBeDefined();
  });

  it('⑥ GET /api/v1/ai/governance/policy：admin 200 + 默认策略形状（revision 12-hex 内容指纹）', async () => {
    const res = await request(govServer())
      .get('/api/v1/ai/governance/policy')
      .set(asAdmin())
      .expect(200);
    const body = res.body as { tools: object; audit: { granularity: string }; revision?: string; updatedAt?: unknown };
    expect(body.tools).toEqual({});
    expect(body.audit.granularity).toBe('all');
    expect(body.revision).toMatch(/^[0-9a-f]{12}$/);
    defaultPolicyRevision = body.revision;
  });

  it('⑦ GET /api/v1/ai/governance/policy/presets：admin 200 + 模板库数组（id/labelKey）', async () => {
    const res = await request(govServer())
      .get('/api/v1/ai/governance/policy/presets')
      .set(asAdmin())
      .expect(200);
    const presets = res.body as Array<{ id: string; labelKey: string; policy: object }>;
    expect(Array.isArray(presets)).toBe(true);
    expect(presets.length).toBeGreaterThanOrEqual(2);
    expect(presets[0].id).toBeTruthy();
    expect(presets[0].labelKey).toBeTruthy();
    expect(presets[0].policy).toBeDefined();
  });

  it('⑧ POST /api/v1/ai/governance/policy/apply-preset：admin 201 实时生效（写 ai_governance_policy）', async () => {
    const res = await request(govServer())
      .post('/api/v1/ai/governance/policy/apply-preset')
      .set(asAdmin())
      .send({ presetId: 'finance' })
      .expect(201);
    const body = res.body as { revision?: string; audit: { granularity: string }; tools: object };
    expect(body.audit.granularity).toBe('all');
    expect(Object.keys(body.tools ?? {}).length).toBeGreaterThan(0);
    expect(body.revision).toMatch(/^[0-9a-f]{12}$/);
    // 与⑥空库默认策略内容指纹不同（证明已真实写库、指纹随内容变更）
    expect(body.revision).not.toBe(defaultPolicyRevision);
  });

  it('⑨ POST /api/v1/ai/governance/policy/apply-preset：user role → 403（写端点同样过策略 lambda）', async () => {
    await request(govServer())
      .post('/api/v1/ai/governance/policy/apply-preset')
      .set(asUser())
      .send({ presetId: 'finance' })
      .expect(403);
  });

  it('⑩ POST /api/v1/ai/confirmations/:token/approve-by：admin + 未配 GOVERNANCE_TARGET_URL → 400（D2-4 契约）', async () => {
    const res = await request(govServer())
      .post('/api/v1/ai/confirmations/some-token/approve-by')
      .set(asAdmin())
      .send({ decision: 'approve' })
      .expect(400);
    expect(res.body.statusCode).toBe(400);
  });

  // ============ ExternalGovernanceController /api/v1/external/*（@UseGuards(GovernanceApiGuard) 服务身份） ============

  it('⑪ POST /api/v1/external/audit：缺 x-api-key → 401（GovernanceApiGuard）', async () => {
    const res = await request(govServer())
      .post('/api/v1/external/audit')
      .send({ action: 'chat', userId: '7' })
      .expect(401);
    expect(res.body.statusCode).toBe(401);
  });

  it('⑫ POST /api/v1/external/audit：x-api-key 不匹配 → 401', async () => {
    const res = await request(govServer())
      .post('/api/v1/external/audit')
      .set({ 'x-api-key': 'wrong-key' })
      .send({ action: 'chat', userId: '7' })
      .expect(401);
    expect(res.body.statusCode).toBe(401);
  });

  it('⑬ POST /api/v1/external/audit：正确 x-api-key → 201 {ok:true}（审计落治理库）', async () => {
    const res = await request(govServer())
      .post('/api/v1/external/audit')
      .set({ 'x-api-key': GOV_API_KEY })
      .send({ userId: '7', username: 'biz-user', action: 'tool_call', toolName: 'create_event', detail: 'governance e2e audit', source: 'external' })
      .expect(201);
    expect(res.body).toEqual({ ok: true });
  });

  it('⑭ GET /api/v1/external/governance/policy：正确 x-api-key → 200 默认策略（服务身份拉策略）', async () => {
    const res = await request(govServer())
      .get('/api/v1/external/governance/policy')
      .set({ 'x-api-key': GOV_API_KEY })
      .expect(200);
    expect((res.body as { audit: { granularity: string } }).audit.granularity).toBe('all');
  });

  it('⑮ GET /api/v1/external/governance/policy：Authorization: Bearer <key> 等价接受（guard 双头）', async () => {
    const res = await request(govServer())
      .get('/api/v1/external/governance/policy')
      .set('Authorization', `Bearer ${GOV_API_KEY}`)
      .expect(200);
    expect((res.body as { audit: { granularity: string } }).audit.granularity).toBe('all');
  });

  it('⑯ POST /api/v1/external/governance/sidecars/register：合法 http(s) → 201 注册成功', async () => {
    const res = await request(govServer())
      .post('/api/v1/external/governance/sidecars/register')
      .set({ 'x-api-key': GOV_API_KEY })
      .send({ callbackUrl: 'http://localhost:59999/sidecar' })
      .expect(201);
    expect(res.body).toMatchObject({ registered: true, total: 1 });
  });

  it('⑰ POST /api/v1/external/governance/sidecars/register：非法 callbackUrl → 400', async () => {
    const res = await request(govServer())
      .post('/api/v1/external/governance/sidecars/register')
      .set({ 'x-api-key': GOV_API_KEY })
      .send({ callbackUrl: 'not-a-url' })
      .expect(400);
    expect(res.body.statusCode).toBe(400);
  });

  it('⑱ POST /api/v1/external/effects：正确服务身份 → 201 登记副作用（返回 effectId）', async () => {
    const res = await request(govServer())
      .post('/api/v1/external/effects')
      .set({ 'x-api-key': GOV_API_KEY })
      .send({
        userId: '7',
        conversationId: 'governance-plane-e2e',
        toolName: 'external_side_effect',
        args: { label: 'governance e2e effect' },
        resultType: 'external',
        resultId: 4242,
      })
      .expect(201);
    expect(res.body.ok).toBe(true);
    expect(typeof res.body.effectId).toBe('number');
  });

  it('⑲ GET /api/v1/ai/tool-effects：admin 200 + 列表含上面登记的外部副作用（status=executed 归一）', async () => {
    const res = await request(govServer()).get('/api/v1/ai/tool-effects').set(asAdmin()).expect(200);
    const body = res.body as { total: number; items: Array<{ id: number; toolName: string; status: string; revocable: boolean }> };
    expect(body.total).toBeGreaterThanOrEqual(1);
    const row = body.items.find((i) => i.toolName === 'external_side_effect');
    expect(row).toBeDefined();
    expect(row!.status).toBe('executed');
    expect(row!.revocable).toBe(false);
  });

  it('⑳ DELETE /api/v1/ai/tool-effects/:id：admin + 未配回调 → 本地 revoker 兜底返回 revoked:false（无撤销接口）', async () => {
    // 先取回刚登记的副作用 id（⑲ 已断言存在，这里重查避免跨用例状态耦合）
    const list = await request(govServer()).get('/api/v1/ai/tool-effects').set(asAdmin()).expect(200);
    const effectId = (list.body as { items: Array<{ id: number; toolName: string }> }).items.find(
      (i) => i.toolName === 'external_side_effect',
    )!.id;
    const res = await request(govServer())
      .delete(`/api/v1/ai/tool-effects/${effectId}`)
      .set(asAdmin())
      .expect(200);
    const body = res.body as { revoked: boolean; effectId: number; message?: string };
    expect(body.effectId).toBe(effectId);
    // revokeClass=none（外部系统目标，无本地软删接口）→ 诚实 revoked:false
    expect(body.revoked).toBe(false);
  });

  it('㉑ DELETE /api/v1/ai/tool-effects/:id：user role → 403（撤销写端点同样过 @CheckPolicies）', async () => {
    await request(govServer()).delete('/api/v1/ai/tool-effects/1').set(asUser()).expect(403);
  });

  it('㉒ 治理策略 after preset：GET policy 现含 finance 预设内容（前序 apply-preset 已实时生效）', async () => {
    const res = await request(govServer()).get('/api/v1/ai/governance/policy').set(asAdmin()).expect(200);
    const body = res.body as { tools: Record<string, unknown> };
    expect(Object.keys(body.tools ?? {}).length).toBeGreaterThan(0);
  });
});
