// SPDX-License-Identifier: Apache-2.0

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource, FindOptionsWhere } from 'typeorm';
import { createTestApp, registerUser, authHeader } from './helpers';
import { OperationAuditLog } from '../src/operation-audit/operation-audit-log.entity';

/** AI Approval 旗舰应用：提交请求 → AI 预审分级 → 人工复核 */
describe('AI Approval (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let userA: { accessToken: string };
  let userB: { accessToken: string };
  let userAId: number;

  /**
   * The operation-audit write is fire-and-forget (the interceptor deliberately does not await the
   * chain lock), so a row may land a few milliseconds after the response. Poll briefly instead of
   * reading once and calling the timing a defect.
   *
   * 操作审计是 fire-and-forget（拦截器有意不 await 链锁），行可能比响应晚几毫秒落库。
   * 此处短暂轮询，避免把时序读成缺陷。
   */
  const waitForAuditRow = async (
    where: FindOptionsWhere<OperationAuditLog>,
  ): Promise<OperationAuditLog | null> => {
    const repo = ds.getRepository(OperationAuditLog);
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      const row = await repo.findOne({ where, order: { id: 'DESC' } });
      if (row) return row;
      await new Promise((r) => setTimeout(r, 50));
    }
    return null;
  };

  beforeAll(async () => {
    app = await createTestApp();
    ds = app.get(DataSource);
    userA = await registerUser(app, { username: 'ap_a', email: 'ap_a@test.com', password: 'ApA12345', nickname: 'ApA' });
    userB = await registerUser(app, { username: 'ap_b', email: 'ap_b@test.com', password: 'ApB12345', nickname: 'ApB' });
    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set(authHeader(userA.accessToken))
      .expect(200);
    userAId = me.body.data.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('未认证 → 401', async () => {
    await request(app.getHttpServer()).get('/api/v1/approval/requests').expect(401);
  });

  it('提交请求 + 创建政策 + AI 预审低风险自动通过', async () => {
    // 政策：报销 ≤ 1000 自动通过
    await request(app.getHttpServer())
      .post('/api/v1/approval/policies')
      .set(authHeader(userA.accessToken))
      .send({ title: '报销自动通过', type: 'reimbursement', maxAmount: 1000 })
      .expect(201);

    const created = await request(app.getHttpServer())
      .post('/api/v1/approval/requests')
      .set(authHeader(userA.accessToken))
      .send({ title: '8 月差旅报销', type: 'reimbursement', amount: 800, reason: '客户拜访' })
      .expect(201);
    expect(created.body.data.status).toBe('pending');

    const reviewed = await request(app.getHttpServer())
      .post(`/api/v1/approval/requests/${created.body.data.id}/review`)
      .set(authHeader(userA.accessToken))
      .expect(200);
    expect(reviewed.body.data.status).toBe('auto_approved');
    expect(reviewed.body.data.riskLevel).toBe('low');
    expect(reviewed.body.data.aiRecommendation).toContain('自动通过');
  });

  it('AI 预审高风险 → 转人工复核 → 人工通过（操作审计成对读数）', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/approval/requests')
      .set(authHeader(userA.accessToken))
      .send({ title: '服务器采购', type: 'purchase', amount: 12000, reason: '扩容' })
      .expect(201);
    const requestId = created.body.data.id as number;

    const reviewed = await request(app.getHttpServer())
      .post(`/api/v1/approval/requests/${requestId}/review`)
      .set(authHeader(userA.accessToken))
      .expect(200);
    expect(reviewed.body.data.status).toBe('needs_review');
    expect(reviewed.body.data.riskLevel).toBe('high');

    // Pair reading, negative half: a request that has been reviewed but not decided has no DECIDE row.
    // 成对读数·反向：已预审、未裁决的请求**不产生** DECIDE 行。
    const beforeDecision = await ds
      .getRepository(OperationAuditLog)
      .findOne({ where: { action: 'DECIDE', targetId: String(requestId) } });
    expect(beforeDecision).toBeNull();

    const decided = await request(app.getHttpServer())
      .post(`/api/v1/approval/requests/${requestId}/decide`)
      .set(authHeader(userA.accessToken))
      .send({ decision: 'approved' })
      .expect(200);
    expect(decided.body.data.status).toBe('approved');

    // Pair reading, positive half: who decided what, against which target, with what result.
    // 成对读数·正向：谁对哪个目标做了什么决定、结果如何。
    const decisionRow = await waitForAuditRow({ action: 'DECIDE', targetId: String(requestId) });
    expect(decisionRow).not.toBeNull();
    expect(decisionRow).toMatchObject({
      action: 'DECIDE',
      featureKey: 'approval.decide',
      featureFallback: 'Approval · Decide',
      businessEvent: 'ApprovalRequestApproved',
      targetId: String(requestId),
      userId: userAId,
      statusCode: 200,
    });
    expect(JSON.parse(decisionRow!.requestBody!)).toEqual({ decision: 'approved' });

    // The review action is its own business event, not a resource create.
    // 预审动作记成自己的业务事件，而非资源创建。
    const reviewRow = await waitForAuditRow({ action: 'REVIEW', targetId: String(requestId) });
    expect(reviewRow).toMatchObject({
      action: 'REVIEW',
      featureKey: 'approval.review',
      businessEvent: 'ApprovalRequestReviewed',
      targetId: String(requestId),
      userId: userAId,
      statusCode: 200,
    });
  });

  it('人工驳回 → 操作审计 businessEvent = ApprovalRequestRejected', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/approval/requests')
      .set(authHeader(userA.accessToken))
      .send({ title: '办公家具采购', type: 'purchase', amount: 9000, reason: '更换' })
      .expect(201);
    const requestId = created.body.data.id as number;

    await request(app.getHttpServer())
      .post(`/api/v1/approval/requests/${requestId}/review`)
      .set(authHeader(userA.accessToken))
      .expect(200);

    const decided = await request(app.getHttpServer())
      .post(`/api/v1/approval/requests/${requestId}/decide`)
      .set(authHeader(userA.accessToken))
      .send({ decision: 'rejected' })
      .expect(200);
    expect(decided.body.data.status).toBe('rejected');

    const decisionRow = await waitForAuditRow({ action: 'DECIDE', targetId: String(requestId) });
    expect(decisionRow).toMatchObject({
      action: 'DECIDE',
      featureKey: 'approval.decide',
      businessEvent: 'ApprovalRequestRejected',
      targetId: String(requestId),
      userId: userAId,
      statusCode: 200,
    });
    expect(JSON.parse(decisionRow!.requestBody!)).toEqual({ decision: 'rejected' });
  });

  it('访问他人请求 → 403', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/approval/requests')
      .set(authHeader(userA.accessToken))
      .send({ title: '隔离测试', amount: 100, reason: 'test' })
      .expect(201);
    await request(app.getHttpServer())
      .get(`/api/v1/approval/requests/${created.body.data.id}`)
      .set(authHeader(userB.accessToken))
      .expect(403);
  });
});
