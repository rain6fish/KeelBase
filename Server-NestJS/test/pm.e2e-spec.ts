// SPDX-License-Identifier: Apache-2.0

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, registerUser, authHeader } from './helpers';

/** AI Project Management 旗舰应用：项目 CRUD + 所有权隔离 + 子资源 + 风险分析 */
describe('AI Project Management (e2e)', () => {
  let app: INestApplication;
  let userA: { accessToken: string };
  let userB: { accessToken: string };

  beforeAll(async () => {
    app = await createTestApp();
    userA = await registerUser(app, { username: 'pm_a', email: 'pm_a@test.com', password: 'PmA12345', nickname: 'PmA' });
    userB = await registerUser(app, { username: 'pm_b', email: 'pm_b@test.com', password: 'PmB12345', nickname: 'PmB' });
  });

  afterAll(async () => {
    await app.close();
  });

  it('未认证 → 401', async () => {
    await request(app.getHttpServer()).get('/api/v1/pm/projects').expect(401);
  });

  it('创建项目 → 列表只见本人', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/pm/projects')
      .set(authHeader(userA.accessToken))
      .send({ name: '电商平台重构', status: 'active', riskLevel: 'high' })
      .expect(201);
    expect(created.body.data.id).toBeDefined();

    await request(app.getHttpServer())
      .post('/api/v1/pm/projects')
      .set(authHeader(userB.accessToken))
      .send({ name: '他人项目', status: 'planned' })
      .expect(201);

    const listA = await request(app.getHttpServer())
      .get('/api/v1/pm/projects')
      .set(authHeader(userA.accessToken))
      .expect(200);
    expect(listA.body.data.items.length).toBe(1);
    expect(listA.body.data.items[0].name).toBe('电商平台重构');
  });

  it('访问他人项目 → 403', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/pm/projects')
      .set(authHeader(userA.accessToken))
      .send({ name: '隔离测试项目' })
      .expect(201);
    const id = created.body.data.id;
    await request(app.getHttpServer())
      .get(`/api/v1/pm/projects/${id}`)
      .set(authHeader(userB.accessToken))
      .expect(403);
  });

  it('创建里程碑 + 任务 + 风险，并可做风险分析', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/pm/projects')
      .set(authHeader(userA.accessToken))
      .send({ name: '移动端发布', riskLevel: 'medium' })
      .expect(201);
    const id = created.body.data.id;

    await request(app.getHttpServer())
      .post(`/api/v1/pm/projects/${id}/milestones`)
      .set(authHeader(userA.accessToken))
      .send({ title: '提审包', dueDate: '2020-01-01T00:00:00Z' })
      .expect(201);

    const task = await request(app.getHttpServer())
      .post('/api/v1/pm/tasks')
      .set(authHeader(userA.accessToken))
      .send({ projectId: id, title: '修复阻塞缺陷', dueDate: '2020-01-01T00:00:00Z' })
      .expect(201);
    expect(task.body.data.id).toBeDefined();

    await request(app.getHttpServer())
      .post(`/api/v1/pm/projects/${id}/risks`)
      .set(authHeader(userA.accessToken))
      .send({ level: 'high', reason: '里程碑延期' })
      .expect(201);

    const analysis = await request(app.getHttpServer())
      .get(`/api/v1/pm/projects/${id}/analyze`)
      .set(authHeader(userA.accessToken))
      .expect(200);
    expect(analysis.body.data.level).toBe('high');
  });

  it('完成任务', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/pm/projects')
      .set(authHeader(userA.accessToken))
      .send({ name: '任务测试项目' })
      .expect(201);
    const task = await request(app.getHttpServer())
      .post('/api/v1/pm/tasks')
      .set(authHeader(userA.accessToken))
      .send({ projectId: created.body.data.id, title: '待完成' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/pm/tasks/${task.body.data.id}/complete`)
      .set(authHeader(userA.accessToken))
      .expect(200);
  });
});
