// SPDX-License-Identifier: Apache-2.0

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, registerUser, authHeader } from './helpers';

/**
 * A2「AI Approval = 第三证明（Policy/Evidence 各压一次基座）」（Enterprise Proof，§18.6）。
 *
 * 确定性（无 LLM）、真实 app + REST。与 CRM/PM 失败路径同构，聚焦 Approval 特有的 Policy/Evidence：
 *   ① 越权裁决：B 对 A 的请求 review/decide → 拒绝（按 userId 过滤 → 404）+ 请求状态未变（仍 pending）
 *   ② 策略阈值边界：amount == maxAmount 走自动通过（<=）；amount > maxAmount 转人工复核；无匹配政策 → 默认阈值
 *   ③ 状态机守卫：对 auto_approved 的请求 decide → 400；对已决定的请求再 decide → 400（不覆盖既有决策）
 *   ④ 决策留痕（Evidence）：auto_approved 落 reviewerId/decidedAt；decide 落 status/decidedAt；越权尝试零留痕
 */
describe('AI Approval 失败/拒绝路径（A2 第三证明）', () => {
  let app: INestApplication;
  let tokenA: string;
  let tokenB: string;
  let userAId: number;

  async function submit(token: string, body: Record<string, unknown>): Promise<{ id: number; status: string }> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/approval/requests')
      .set(authHeader(token))
      .send(body)
      .expect(201);
    return res.body.data as { id: number; status: string };
  }

  async function getRequest(token: string, id: number): Promise<Record<string, unknown>> {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/approval/requests/${id}`)
      .set(authHeader(token))
      .expect(200);
    return res.body.data as Record<string, unknown>;
  }

  beforeAll(async () => {
    app = await createTestApp();
    const a = await registerUser(app, { username: 'a2_ap_a', email: 'a2_ap_a@test.com', password: 'A2ApA1234', nickname: 'A2ApA' });
    const b = await registerUser(app, { username: 'a2_ap_b', email: 'a2_ap_b@test.com', password: 'A2ApB1234', nickname: 'A2ApB' });
    tokenA = a.accessToken;
    tokenB = b.accessToken;
    const meA = await request(app.getHttpServer()).get('/api/v1/auth/me').set(authHeader(tokenA)).expect(200);
    userAId = (meA.body.data as { id: number }).id;
    // A 的一条低额报销政策（后续边界用例以独立政策/默认阈值为准，避免相互干扰）
    await request(app.getHttpServer())
      .post('/api/v1/approval/policies')
      .set(authHeader(tokenA))
      .send({ title: '差旅报销自动通过', type: 'reimbursement', maxAmount: 1000 })
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
  });

  it('① 越权裁决：B review/decide A 的请求 → 拒绝且状态未变（仍 pending）', async () => {
    const req = await submit(tokenA, { title: '越权裁决目标', type: 'reimbursement', amount: 500, reason: 'test' });
    expect(req.status).toBe('pending');

    // 越权预审 / 越权决定：均按 userId 过滤 → 404（不暴露存在性）
    const review = await request(app.getHttpServer())
      .post(`/api/v1/approval/requests/${req.id}/review`)
      .set(authHeader(tokenB))
      .expect(404);
    expect(review.body.code).toBe(404);

    await request(app.getHttpServer())
      .post(`/api/v1/approval/requests/${req.id}/decide`)
      .set(authHeader(tokenB))
      .send({ decision: 'approved' })
      .expect(404);

    // 状态未变：本人复核仍可正常进行（证明越权未产生任何影响）
    const after = await getRequest(tokenA, req.id);
    expect(after.status).toBe('pending');
  });

  it('② 策略阈值边界：amount == maxAmount 自动通过（<=）；amount > maxAmount 转人工复核', async () => {
    // 边界内（== 阈值）
    const atThreshold = await submit(tokenA, { title: '恰好阈值', type: 'reimbursement', amount: 1000, reason: 'boundary' });
    const r1 = await request(app.getHttpServer())
      .post(`/api/v1/approval/requests/${atThreshold.id}/review`)
      .set(authHeader(tokenA))
      .expect(200);
    expect(r1.body.data.status).toBe('auto_approved');
    expect(r1.body.data.riskLevel).toBe('low');

    // 边界外（阈值 + 1）→ 转人工复核；未达 3× 阈值 → 中风险
    const overThreshold = await submit(tokenA, { title: '超阈值', type: 'reimbursement', amount: 1001, reason: 'boundary+' });
    const r2 = await request(app.getHttpServer())
      .post(`/api/v1/approval/requests/${overThreshold.id}/review`)
      .set(authHeader(tokenA))
      .expect(200);
    expect(r2.body.data.status).toBe('needs_review');
    expect(r2.body.data.riskLevel).toBe('medium');

    // 远超阈值（> 3× 阈值）→ 高风险
    const far = await submit(tokenA, { title: '远超阈值', type: 'reimbursement', amount: 3001, reason: '3x+' });
    const r2b = await request(app.getHttpServer())
      .post(`/api/v1/approval/requests/${far.id}/review`)
      .set(authHeader(tokenA))
      .expect(200);
    expect(r2b.body.data.status).toBe('needs_review');
    expect(r2b.body.data.riskLevel).toBe('high');

    // 无匹配政策类型（purchase 未建政策）→ 默认阈值 1000（同边界语义）
    const noPolicy = await submit(tokenA, { title: '无政策类型', type: 'purchase', amount: 1001, reason: 'default threshold' });
    const r3 = await request(app.getHttpServer())
      .post(`/api/v1/approval/requests/${noPolicy.id}/review`)
      .set(authHeader(tokenA))
      .expect(200);
    expect(r3.body.data.status).toBe('needs_review');
  });

  it('③ 状态机守卫：对非 pending 再预审 / 对非 needs_review 再决定 → 400（不覆盖既有决策）', async () => {
    const req = await submit(tokenA, { title: '状态机守卫', type: 'reimbursement', amount: 300, reason: 'guard' });
    await request(app.getHttpServer())
      .post(`/api/v1/approval/requests/${req.id}/review`)
      .set(authHeader(tokenA))
      .expect(200); // → auto_approved

    // 已 auto_approved：再预审 → 400；再 decide → 400（decide 仅 needs_review）
    await request(app.getHttpServer())
      .post(`/api/v1/approval/requests/${req.id}/review`)
      .set(authHeader(tokenA))
      .expect(400);
    await request(app.getHttpServer())
      .post(`/api/v1/approval/requests/${req.id}/decide`)
      .set(authHeader(tokenA))
      .send({ decision: 'rejected' })
      .expect(400);

    // 状态未被覆盖：仍 auto_approved（越权重决定未生效）
    expect((await getRequest(tokenA, req.id)).status).toBe('auto_approved');

    // needs_review → 人工决定一次后，再决定 → 400（不覆盖）
    const high = await submit(tokenA, { title: '高额采购', type: 'purchase', amount: 99999, reason: 'guard2' });
    await request(app.getHttpServer()).post(`/api/v1/approval/requests/${high.id}/review`).set(authHeader(tokenA)).expect(200);
    await request(app.getHttpServer())
      .post(`/api/v1/approval/requests/${high.id}/decide`)
      .set(authHeader(tokenA))
      .send({ decision: 'approved' })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/v1/approval/requests/${high.id}/decide`)
      .set(authHeader(tokenA))
      .send({ decision: 'rejected' })
      .expect(400);
    expect((await getRequest(tokenA, high.id)).status).toBe('approved');
  });

  it('④ 决策留痕（Evidence）：自动通过落 reviewerId/decidedAt；越权尝试零留痕', async () => {
    const req = await submit(tokenA, { title: '留痕用例', type: 'reimbursement', amount: 100, reason: 'evidence' });

    // 越权预审被拒后：仍无 reviewerId/decidedAt（零留痕）
    await request(app.getHttpServer())
      .post(`/api/v1/approval/requests/${req.id}/review`)
      .set(authHeader(tokenB))
      .expect(404);
    const before = await getRequest(tokenA, req.id);
    expect(before.reviewerId ?? null).toBeNull();
    expect(before.decidedAt ?? null).toBeNull();

    // 本人预审（auto_approved）→ 留痕：reviewerId = 本人，decidedAt 落
    await request(app.getHttpServer())
      .post(`/api/v1/approval/requests/${req.id}/review`)
      .set(authHeader(tokenA))
      .expect(200);
    const after = await getRequest(tokenA, req.id);
    expect(after.status).toBe('auto_approved');
    expect(after.reviewerId).toBe(userAId);
    expect(after.decidedAt).toBeTruthy();
  });
});
