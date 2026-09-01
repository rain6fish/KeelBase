// SPDX-License-Identifier: Apache-2.0

/**
 * W5-⑦ Explainable Authz e2e：GET /auth/me/permissions + POST /auth/permissions/explain
 *
 * 验证「为何允许/为何阻止 + 依据」：普通用户 own-scoped 能力清单 + 资源级决策解释；
 * 管理员 manage all。2026-08-20（explainable-authz.spec.md §6 验证）。
 */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp, registerUser, loginAs, authHeader } from './helpers';
import { UserRole } from '../src/common/entities/user.entity';

describe('Explainable Authz (W5-⑦)', () => {
  let app: INestApplication;
  let userToken: string;
  let adminToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    await app.init();
    const user = await registerUser(app, {
      username: 'ea_user',
      email: 'ea@test.com',
      password: 'EaPass123',
      nickname: 'EA',
    });
    userToken = user.accessToken;
    // 测试 app 无演示 admin 账号：注册 ea_admin 后直连 DB 提升 role，再重登拿 admin token（app.e2e 模式）
    const adm = await registerUser(app, {
      username: 'ea_admin',
      email: 'eadmin@test.com',
      password: 'EaAdmin123',
      nickname: 'EAAdm',
    });
    const ds = app.get(DataSource);
    const admMe = await request(app.getHttpServer()).get('/api/v1/auth/me').set(authHeader(adm.accessToken));
    await ds.getRepository('users').update(admMe.body.data.id, { role: UserRole.ADMIN });
    adminToken = (await loginAs(app, 'ea_admin', 'EaAdmin123')).accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /auth/me/permissions — user: role + own-scoped resources with basis', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/auth/me/permissions')
      .set(authHeader(userToken))
      .expect(200);
    const data = res.body.data;
    expect(data.role).toBe(UserRole.USER);
    expect(data.basis).toContain('本人');
    const event = data.resources.find((r: { subject: string }) => r.subject === 'Event');
    expect(event?.scope).toBe('own');
    expect(event?.reason).toContain('自己的数据');
    expect(data.resources.some((r: { subject: string }) => r.subject === 'all')).toBe(false);
  });

  it('GET /auth/me/permissions — admin: manage all', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/auth/me/permissions')
      .set(authHeader(adminToken))
      .expect(200);
    const data = res.body.data;
    expect(data.role).toBe(UserRole.ADMIN);
    expect(data.basis).toContain('管理员');
    expect(data.resources.find((r: { subject: string }) => r.subject === 'all')?.scope).toBe('all');
  });

  it('POST /auth/permissions/explain — user: manage Event allowed, manage all denied with reason', async () => {
    const ok = await request(app.getHttpServer())
      .post('/api/v1/auth/permissions/explain')
      .set(authHeader(userToken))
      .send({ action: 'manage', subject: 'Event' })
      .expect(201);
    expect(ok.body.data.allowed).toBe(true);
    expect(ok.body.data.reason).toContain('本人所有权');

    const denied = await request(app.getHttpServer())
      .post('/api/v1/auth/permissions/explain')
      .set(authHeader(userToken))
      .send({ action: 'manage', subject: 'all' })
      .expect(201);
    expect(denied.body.data.allowed).toBe(false);
    expect(denied.body.data.deniedBy).toBe('casl');
    expect(denied.body.data.reason).toContain('管理员');
  });

  it('POST /auth/permissions/explain/target — admin explains decision for target user (B1)', async () => {
    const me = await request(app.getHttpServer()).get('/api/v1/auth/me').set(authHeader(userToken));
    const targetId = me.body.data.id;
    const ok = await request(app.getHttpServer())
      .post('/api/v1/auth/permissions/explain/target')
      .set(authHeader(adminToken))
      .send({ userId: targetId, action: 'manage', subject: 'Event' })
      .expect(201);
    expect(ok.body.data.userId).toBe(targetId);
    expect(ok.body.data.username).toBe('ea_user');
    expect(ok.body.data.allowed).toBe(true);
    expect(ok.body.data.reason).toContain('本人所有权');

    const denied = await request(app.getHttpServer())
      .post('/api/v1/auth/permissions/explain/target')
      .set(authHeader(adminToken))
      .send({ userId: targetId, action: 'manage', subject: 'all' })
      .expect(201);
    expect(denied.body.data.allowed).toBe(false);
    expect(denied.body.data.deniedBy).toBe('casl');
  });

  it('POST /auth/permissions/explain/target — non-admin 403', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/permissions/explain/target')
      .set(authHeader(userToken))
      .send({ userId: 1, action: 'manage', subject: 'Event' })
      .expect(403);
  });
});
