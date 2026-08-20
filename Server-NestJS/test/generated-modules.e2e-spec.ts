import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { createTestApp, registerUser, authHeader } from './helpers';
import { User } from '../src/common/entities/user.entity';

/**
 * 第 11-12 周验收加固：keelbase init 生成模块（suppliers）的 HTTP 层验证——
 * CRUD 本人数据 + admin 端点权限（admin/all 200 / user 403）+ 未认证 401。
 */
describe('Generated modules (keelbase init, e2e)', () => {
  let app: INestApplication;
  let user: { accessToken: string };
  let admin: { accessToken: string };

  const makeSupplier = (over: Record<string, unknown> = {}) => ({
    name: '测试供应商',
    contact: '张三',
    status: 'active',
    riskLevel: 'low',
    annualSpend: 100000,
    ...over,
  });

  beforeAll(async () => {
    app = await createTestApp();
    const dataSource = app.get(DataSource);
    user = await registerUser(app, { username: 'gm_user', email: 'gm_user@test.com', password: 'GmUser123', nickname: 'GM' });
    const adminUser = await registerUser(app, { username: 'gm_admin', email: 'gm_admin@test.com', password: 'GmAdmin123', nickname: 'GMA' });
    const adminEntity = await dataSource.getRepository(User).findOne({ where: { username: 'gm_admin' } });
    await dataSource.getRepository(User).update(adminEntity!.id, { role: 'admin' });
    // role 变更后旧 accessToken 仍是 user——重新登录签发带 admin role 的新 token
    const adminLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: 'gm_admin', password: 'GmAdmin123' })
      .expect(200);
    admin = { accessToken: adminLogin.body.data.accessToken };
  });

  afterAll(async () => {
    await app.close();
  });

  it('未认证 → 401', async () => {
    await request(app.getHttpServer()).get('/api/v1/suppliers').expect(401);
  });

  it('用户创建/列表/更新/删除 supplier（本人数据）', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/suppliers')
      .set(authHeader(user.accessToken))
      .send(makeSupplier())
      .expect(201);
    const id = created.body.data.id;
    expect(created.body.data.userId).toBeDefined();

    const list = await request(app.getHttpServer()).get('/api/v1/suppliers').set(authHeader(user.accessToken)).expect(200);
    expect(list.body.data.some((s: any) => s.id === id)).toBe(true);

    const updated = await request(app.getHttpServer())
      .patch(`/api/v1/suppliers/${id}`)
      .set(authHeader(user.accessToken))
      .send({ status: 'inactive' })
      .expect(200);
    expect(updated.body.data.status).toBe('inactive');

    await request(app.getHttpServer()).delete(`/api/v1/suppliers/${id}`).set(authHeader(user.accessToken)).expect(200);
  });

  it('admin 端点：admin 200 / 普通用户 403', async () => {
    await request(app.getHttpServer()).get('/api/v1/suppliers/admin/all').set(authHeader(user.accessToken)).expect(403);
    await request(app.getHttpServer()).get('/api/v1/suppliers/admin/all').set(authHeader(admin.accessToken)).expect(200);

    const created = await request(app.getHttpServer())
      .post('/api/v1/suppliers')
      .set(authHeader(user.accessToken))
      .send(makeSupplier())
      .expect(201);
    await request(app.getHttpServer())
      .delete(`/api/v1/suppliers/admin/${created.body.data.id}`)
      .set(authHeader(user.accessToken))
      .expect(403);
    await request(app.getHttpServer())
      .delete(`/api/v1/suppliers/admin/${created.body.data.id}`)
      .set(authHeader(admin.accessToken))
      .expect(200);
  });

  // contracts：协议生成模块（enum status + amount），验证模板通用性 + enum 校验 + 所有权隔离
  describe('contracts（协议生成模块：enum 字段 + 所有权隔离）', () => {
    const makeContract = (over: Record<string, unknown> = {}) => ({
      name: '采购合同',
      counterparty: '乙方公司',
      status: 'draft',
      amount: 10000,
      ...over,
    });

    it('创建 contract（enum status 合法）→ 列表本人可见', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/contracts')
        .set(authHeader(user.accessToken))
        .send(makeContract())
        .expect(201);
      const id = created.body.data.id;
      expect(created.body.data.status).toBe('draft');

      const list = await request(app.getHttpServer())
        .get('/api/v1/contracts')
        .set(authHeader(user.accessToken))
        .expect(200);
      expect(list.body.data.some((c: any) => c.id === id)).toBe(true);
    });

    it('enum 非法值 → 400（class-validator @IsIn）', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/contracts')
        .set(authHeader(user.accessToken))
        .send(makeContract({ status: 'not-a-status' }))
        .expect(400);
    });

    it('所有权隔离：他人无法更新/删除我的合同（CASL 403）', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/contracts')
        .set(authHeader(user.accessToken))
        .send(makeContract())
        .expect(201);
      const id = created.body.data.id;
      const otherUser = await registerUser(app, {
        username: 'gm_other',
        email: 'gm_other@test.com',
        password: 'GmOther1',
        nickname: 'Other',
      });

      // 生成器模板 controller 无 GET /:id 端点（404 是路由不存在）；所有权校验经 update/remove 的 findOne
      await request(app.getHttpServer())
        .patch(`/api/v1/contracts/${id}`)
        .set(authHeader(otherUser.accessToken))
        .send({ name: 'hack' })
        .expect(403);
      await request(app.getHttpServer())
        .delete(`/api/v1/contracts/${id}`)
        .set(authHeader(otherUser.accessToken))
        .expect(403);
    });

    it('admin 端点：user 403 / admin 200', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/contracts/admin/all')
        .set(authHeader(user.accessToken))
        .expect(403);
      await request(app.getHttpServer())
        .get('/api/v1/contracts/admin/all')
        .set(authHeader(admin.accessToken))
        .expect(200);
    });
  });
});
