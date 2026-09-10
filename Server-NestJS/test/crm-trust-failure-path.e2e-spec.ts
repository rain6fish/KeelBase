// SPDX-License-Identifier: Apache-2.0

import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { createTestApp, registerUser, authHeader } from './helpers';
import { AiService } from '../src/ai/ai.service';
import { AuthorizationDeniedError } from '../src/ai/interfaces/tool.interface';

/**
 * A2「AI CRM 作 Business Execution Trust 证明器——失败路径场景化」（Enterprise Proof 证据）。
 *
 * 确定性（无 LLM）：真实 app + 真实 REST/治理层，把 CRM「失败也安全」的承诺固化为常绿证据。
 * 与既有套件不重复——crm.e2e 只测越权「读」(403)；golden-application 只测 happy path（critical 风险）；
 * cross-entry 只测 MCP/直调 deny；revoke/confirmation 语义另有专测。本套件补 CRM 语境下的缺口：
 *   ① 越权「写」（子资源：订单/跟进/任务/风险/机会/联系人）→ 404 拒绝且零副作用（不产生任何行）
 *   ② 越权「写」（客户本体 PATCH/DELETE）→ 403（CASL 行级）且数据未被篡改/未被删
 *   ③ R5 危险动作（delete_customer 会级联删除）经治理层阻断 → 客户实体零变更（不级联删）
 *   ④ 风险分析边界：低数据客户 → 确定 low；单笔小额逾期 → medium（不崩、理由可解释）
 */
describe('AI CRM 失败/拒绝路径（A2 Trust 证明器）', () => {
  let app: INestApplication;
  let ds: DataSource;
  let aiService: AiService;
  let tokenA: string;
  let tokenB: string;
  let userAId: number;

  async function createCustomer(
    token: string,
    name: string,
    extra: Record<string, unknown> = {},
  ): Promise<number> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/crm/customers')
      .set(authHeader(token))
      .send({ name, ...extra })
      .expect(201);
    return (res.body.data as { id: number }).id;
  }

  beforeAll(async () => {
    app = await createTestApp();
    ds = app.get(DataSource);
    aiService = app.get(AiService);

    const a = await registerUser(app, {
      username: 'a2_crm_a',
      email: 'a2_crm_a@test.com',
      password: 'A2CrmA1234',
      nickname: 'A2CrmA',
    });
    const b = await registerUser(app, {
      username: 'a2_crm_b',
      email: 'a2_crm_b@test.com',
      password: 'A2CrmB1234',
      nickname: 'A2CrmB',
    });
    tokenA = a.accessToken;
    tokenB = b.accessToken;

    const meA = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set(authHeader(tokenA))
      .expect(200);
    userAId = (meA.body.data as { id: number }).id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('① 越权写：B 对 A 的客户发起子资源写 → 404（拒绝且不暴露存在性）+ 零副作用', async () => {
    const id = await createCustomer(tokenA, '越权写目标客户');

    // 六类子资源写：均须被拒（`_assertCustomerOwner` 按 userId 归属校验 → 404，非 403，避免枚举他人客户）
    const writes = [
      { label: '订单', run: () => request(app.getHttpServer()).post(`/api/v1/crm/customers/${id}/orders`).set(authHeader(tokenB)).send({ amount: 9999 }) },
      { label: '跟进', run: () => request(app.getHttpServer()).post(`/api/v1/crm/customers/${id}/activities`).set(authHeader(tokenB)).send({ summary: '越权跟进' }) },
      { label: '任务', run: () => request(app.getHttpServer()).post('/api/v1/crm/tasks').set(authHeader(tokenB)).send({ customerId: id, title: '越权任务' }) },
      { label: '风险', run: () => request(app.getHttpServer()).post(`/api/v1/crm/customers/${id}/risks`).set(authHeader(tokenB)).send({ reason: '越权风险' }) },
      { label: '机会', run: () => request(app.getHttpServer()).post(`/api/v1/crm/customers/${id}/opportunities`).set(authHeader(tokenB)).send({ name: '越权机会', amount: 1000 }) },
      { label: '联系人', run: () => request(app.getHttpServer()).post(`/api/v1/crm/customers/${id}/contacts`).set(authHeader(tokenB)).send({ name: '越权联系人' }) },
    ];
    for (const w of writes) {
      const res = await w.run();
      // 断言形状含 label，失败信息可定位到具体子资源
      expect({ label: w.label, status: res.status }).toEqual({ label: w.label, status: 404 });
    }

    // 零副作用：A 详情聚合下全部子资源为空（越权写未产生任何记录）
    const detail = await request(app.getHttpServer())
      .get(`/api/v1/crm/customers/${id}`)
      .set(authHeader(tokenA))
      .expect(200);
    const d = detail.body.data as Record<string, unknown[]>;
    for (const key of ['orders', 'activities', 'tasks', 'risks', 'opportunities', 'contacts']) {
      expect({ key, len: d[key].length }).toEqual({ key, len: 0 });
    }
    // DB 直证：无订单/任务行落库
    expect(await ds.getRepository('CrmOrder').count({ where: { customerId: id } })).toBe(0);
    expect(await ds.getRepository('CrmTask').count({ where: { customerId: id } })).toBe(0);
  });

  it('② 越权写：B PATCH/DELETE A 的客户 → 403（CASL 行级）+ 数据未被篡改/未被删', async () => {
    const name = '越权改删目标客户';
    const id = await createCustomer(tokenA, name);

    await request(app.getHttpServer())
      .patch(`/api/v1/crm/customers/${id}`)
      .set(authHeader(tokenB))
      .send({ name: '被篡改' })
      .expect(403);
    await request(app.getHttpServer())
      .delete(`/api/v1/crm/customers/${id}`)
      .set(authHeader(tokenB))
      .expect(403);

    // 客户名未被篡改、未被软删（本人仍可读且内容不变）
    const detail = await request(app.getHttpServer())
      .get(`/api/v1/crm/customers/${id}`)
      .set(authHeader(tokenA))
      .expect(200);
    expect((detail.body.data as { customer: { name: string } }).customer.name).toBe(name);
  });

  it('③ R5 阻断：delete_customer 经治理层被拒 → 依据 risk_policy + 客户实体零变更（不级联删）', async () => {
    const id = await createCustomer(tokenA, 'R5 阻断目标客户');
    // 造一条订单：证明 R5 被阻断后连子资源也未受影响（本工具语义为级联删除）
    await request(app.getHttpServer())
      .post(`/api/v1/crm/customers/${id}/orders`)
      .set(authHeader(tokenA))
      .send({ amount: 500000 })
      .expect(201);

    let denied: AuthorizationDeniedError | undefined;
    try {
      await aiService.executeToolForExternal(
        'delete_customer',
        { customerId: id, reason: 'A2 演示' },
        String(userAId),
      );
    } catch (e) {
      denied = e as AuthorizationDeniedError;
    }
    // 拒绝确实发生 + 结构化依据为 risk_policy（R5 不可逆/外部动作 → 阻断）
    expect(denied).toBeDefined();
    expect(denied!.reasons[0]?.name).toBe('risk_policy');
    expect(denied!.reasons[0]?.ok).toBe(false);

    // 零变更：客户行仍在、订单未被级联删
    expect(await ds.getRepository('CrmCustomer').count({ where: { id } })).toBe(1);
    const detail = await request(app.getHttpServer())
      .get(`/api/v1/crm/customers/${id}`)
      .set(authHeader(tokenA))
      .expect(200);
    expect((detail.body.data as { orders: unknown[] }).orders).toHaveLength(1);
  });

  it('④ 风险分析边界：低数据客户 → low；单笔小额逾期 → medium（确定等级 + 理由，不崩）', async () => {
    // 低数据：无订单/任务/风险，默认 status=lead → 无外部风险信号，确定落到 low
    const lowId = await createCustomer(tokenA, '低数据客户');
    const low = await request(app.getHttpServer())
      .get(`/api/v1/crm/customers/${lowId}/analyze`)
      .set(authHeader(tokenA))
      .expect(200);
    const lowData = low.body.data as {
      level: string;
      reasons: string[];
      dataPoints: { orderCount: number; overdueOrders: number; openRisks: number; lateTasks: number };
    };
    expect(lowData.level).toBe('low');
    expect(Array.isArray(lowData.reasons)).toBe(true);
    expect(lowData.dataPoints.orderCount).toBe(0);
    expect(lowData.dataPoints.overdueOrders).toBe(0);
    expect(lowData.dataPoints.openRisks).toBe(0);
    expect(lowData.dataPoints.lateTasks).toBe(0);

    // 单笔小额逾期（≤100 万 → 权重 3）→ medium（≥3 且 <6），理由可解释
    const medId = await createCustomer(tokenA, '单笔逾期客户', { status: 'active' });
    await request(app.getHttpServer())
      .post(`/api/v1/crm/customers/${medId}/orders`)
      .set(authHeader(tokenA))
      .send({ amount: 50000, status: 'overdue' })
      .expect(201);
    const med = await request(app.getHttpServer())
      .get(`/api/v1/crm/customers/${medId}/analyze`)
      .set(authHeader(tokenA))
      .expect(200);
    const medData = med.body.data as {
      level: string;
      score: number;
      reasons: string[];
      dataPoints: { overdueOrders: number };
    };
    expect(medData.level).toBe('medium');
    expect(medData.score).toBe(3);
    expect(medData.dataPoints.overdueOrders).toBe(1);
    expect(medData.reasons.length).toBeGreaterThan(0);
  });
});
