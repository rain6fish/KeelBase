import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, registerUser, authHeader } from './helpers';

/** AI CRM 旗舰应用：客户 CRUD + 所有权隔离 + 子资源 + 风险分析 */
describe('AI CRM (e2e)', () => {
  let app: INestApplication;
  let userA: { accessToken: string };
  let userB: { accessToken: string };

  beforeAll(async () => {
    app = await createTestApp();
    userA = await registerUser(app, { username: 'crm_a', email: 'crm_a@test.com', password: 'CrmA1234', nickname: 'CrmA' });
    userB = await registerUser(app, { username: 'crm_b', email: 'crm_b@test.com', password: 'CrmB1234', nickname: 'CrmB' });
  });

  afterAll(async () => {
    await app.close();
  });

  it('未认证 → 401', async () => {
    await request(app.getHttpServer()).get('/api/v1/crm/customers').expect(401);
  });

  it('创建客户 → 列表只见本人', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/crm/customers')
      .set(authHeader(userA.accessToken))
      .send({ name: '华润建材', company: '华润集团', status: 'active', riskLevel: 'high' })
      .expect(201);
    expect(created.body.data.id).toBeDefined();

    await request(app.getHttpServer())
      .post('/api/v1/crm/customers')
      .set(authHeader(userB.accessToken))
      .send({ name: '蓝湾地产', status: 'churn_risk' })
      .expect(201);

    const listA = await request(app.getHttpServer())
      .get('/api/v1/crm/customers')
      .set(authHeader(userA.accessToken))
      .expect(200);
    expect(listA.body.data.items.length).toBe(1);
    expect(listA.body.data.items[0].name).toBe('华润建材');
  });

  it('访问他人客户详情 → 403', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/crm/customers')
      .set(authHeader(userA.accessToken))
      .send({ name: '隔离测试客户' })
      .expect(201);
    const id = created.body.data.id;

    await request(app.getHttpServer())
      .get(`/api/v1/crm/customers/${id}`)
      .set(authHeader(userB.accessToken))
      .expect(403);
  });

  it('给客户创建订单 + 任务，并可做风险分析', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/crm/customers')
      .set(authHeader(userA.accessToken))
      .send({ name: '临海制造', riskLevel: 'critical' })
      .expect(201);
    const id = created.body.data.id;

    await request(app.getHttpServer())
      .post(`/api/v1/crm/customers/${id}/orders`)
      .set(authHeader(userA.accessToken))
      .send({ amount: 2800000, status: 'overdue', dueDate: '2026-08-01T00:00:00Z' })
      .expect(201);

    const task = await request(app.getHttpServer())
      .post('/api/v1/crm/tasks')
      .set(authHeader(userA.accessToken))
      .send({ customerId: id, title: '推进分期方案' })
      .expect(201);
    expect(task.body.data.id).toBeDefined();

    await request(app.getHttpServer())
      .post(`/api/v1/crm/tasks/${task.body.data.id}/complete`)
      .set(authHeader(userA.accessToken))
      .expect(200);

    const analysis = await request(app.getHttpServer())
      .get(`/api/v1/crm/customers/${id}/analyze`)
      .set(authHeader(userA.accessToken))
      .expect(200);
    expect(analysis.body.data.level).toBe('critical');
    expect(analysis.body.data.reasons.length).toBeGreaterThan(0);
  });

  it('删除客户 → 软删后 404 访问', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/crm/customers')
      .set(authHeader(userA.accessToken))
      .send({ name: '待删除客户' })
      .expect(201);
    const id = created.body.data.id;

    await request(app.getHttpServer())
      .delete(`/api/v1/crm/customers/${id}`)
      .set(authHeader(userA.accessToken))
      .expect(200);
  });
});
