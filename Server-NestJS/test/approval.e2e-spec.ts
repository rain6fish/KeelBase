import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, registerUser, authHeader } from './helpers';

/** AI Approval 旗舰应用：提交请求 → AI 预审分级 → 人工复核 */
describe('AI Approval (e2e)', () => {
  let app: INestApplication;
  let userA: { accessToken: string };
  let userB: { accessToken: string };

  beforeAll(async () => {
    app = await createTestApp();
    userA = await registerUser(app, { username: 'ap_a', email: 'ap_a@test.com', password: 'ApA12345', nickname: 'ApA' });
    userB = await registerUser(app, { username: 'ap_b', email: 'ap_b@test.com', password: 'ApB12345', nickname: 'ApB' });
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

  it('AI 预审高风险 → 转人工复核 → 人工通过', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/approval/requests')
      .set(authHeader(userA.accessToken))
      .send({ title: '服务器采购', type: 'purchase', amount: 12000, reason: '扩容' })
      .expect(201);

    const reviewed = await request(app.getHttpServer())
      .post(`/api/v1/approval/requests/${created.body.data.id}/review`)
      .set(authHeader(userA.accessToken))
      .expect(200);
    expect(reviewed.body.data.status).toBe('needs_review');
    expect(reviewed.body.data.riskLevel).toBe('high');

    const decided = await request(app.getHttpServer())
      .post(`/api/v1/approval/requests/${created.body.data.id}/decide`)
      .set(authHeader(userA.accessToken))
      .send({ decision: 'approved' })
      .expect(200);
    expect(decided.body.data.status).toBe('approved');
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
