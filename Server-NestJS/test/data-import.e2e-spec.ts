import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { createTestApp, registerUser, loginAs, authHeader } from './helpers';
import { UserRole } from '../src/common/entities/user.entity';

/**
 * e2e coverage for Data Import (POV-2):
 * admin CSV bulk-import users / events / todos via POST /api/v1/admin/import/*
 *  - success / failed counters + CR-20 masked error reasons
 *  - permission: non-admin 403, missing file 400, empty CSV 400
 */
describe('Data import (POV-2, e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let adminToken: string;
  let targetUserId: number;
  let userToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    ds = app.get(DataSource);

    // 普通用户（导入事件/待办的归属目标）
    const target = await registerUser(app, {
      username: 'imp_target',
      email: 'imp_target@test.com',
      password: 'ImpTarget1',
      nickname: 'Target',
    });
    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set(authHeader(target.accessToken))
      .expect(200);
    targetUserId = me.body.data.id;

    // 普通用户（403 校验）
    userToken = (
      await registerUser(app, {
        username: 'imp_user',
        email: 'imp_user@test.com',
        password: 'ImpUser1',
        nickname: 'PlainUser',
      })
    ).accessToken;

    // 管理员：改 DB role 后重新登录（与 app.e2e-spec.ts 一致）
    const admin = await registerUser(app, {
      username: 'imp_admin',
      email: 'imp_admin@test.com',
      password: 'ImpAdmin1',
      nickname: 'ImportAdmin',
    });
    const ame = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set(authHeader(admin.accessToken))
      .expect(200);
    await ds.getRepository('users').update(ame.body.data.id, { role: UserRole.ADMIN });
    adminToken = (await loginAs(app, 'imp_admin', 'ImpAdmin1')).accessToken;
  });

  afterAll(async () => {
    await app.close();
  }, 90000);

  const postCsv = (path: string, csv: string) =>
    request(app.getHttpServer())
      .post(path)
      .set(authHeader(adminToken))
      .attach('file', Buffer.from(csv, 'utf8'), {
        filename: 'import.csv',
        contentType: 'text/csv',
      });

  describe('导入用户（POST /api/v1/admin/import/users）', () => {
    it('admin 批量导入用户 → success 计数', async () => {
      const csv = [
        'username,email,password,nickname',
        'imp_u1,imp_u1@test.com,ImpU1Pass,导入一',
        'imp_u2,imp_u2@test.com,ImpU2Pass,导入二',
      ].join('\n');

      const res = await postCsv('/api/v1/admin/import/users', csv).expect(200);

      expect(res.body.data).toMatchObject({ type: 'user', total: 2, success: 2, failed: 0 });
    });

    it('导入的用户可用 CSV 中的密码登录', async () => {
      const login = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ username: 'imp_u1', password: 'ImpU1Pass' })
        .expect(200);
      expect(login.body.data.accessToken).toBeDefined();
    });

    it('重复 email → failed + CR-20 掩码错误（不透传内部细节）', async () => {
      const csv = ['username,email,password,nickname', 'imp_u3,imp_u1@test.com,ImpU3Pass,dup'].join('\n');

      const res = await postCsv('/api/v1/admin/import/users', csv).expect(200);

      expect(res.body.data.failed).toBe(1);
      expect(res.body.data.errors).toHaveLength(1);
      expect(res.body.data.errors[0]).toMatchObject({ row: 2, reason: '导入失败' });
    });
  });

  describe('导入事件/待办（归属目标用户）', () => {
    it('admin 导入事件 → success', async () => {
      const csv = [
        'userId,title,startTime,endTime,location,description',
        `${targetUserId},导入会议,2026-09-01T10:00:00Z,2026-09-01T11:00:00Z,会议室,desc`,
      ].join('\n');

      const res = await postCsv('/api/v1/admin/import/events', csv).expect(200);

      expect(res.body.data).toMatchObject({ type: 'event', total: 1, success: 1, failed: 0 });
    });

    it('admin 导入待办 → success（归属目标用户）', async () => {
      const csv = [
        'userId,title,completed,dueDate',
        `${targetUserId},导入待办,false,2026-09-05`,
      ].join('\n');

      const res = await postCsv('/api/v1/admin/import/todos', csv).expect(200);

      expect(res.body.data).toMatchObject({ type: 'todo', total: 1, success: 1, failed: 0 });
    });

    it('无效 userId → failed + errors 明细', async () => {
      const csv = ['userId,title', '99999,无主事件'].join('\n');

      const res = await postCsv('/api/v1/admin/import/events', csv).expect(200);

      expect(res.body.data.failed).toBe(1);
      expect(res.body.data.errors[0].reason).toBe('导入失败');
    });
  });

  describe('权限与校验', () => {
    it('无文件 → 400', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/admin/import/users')
        .set(authHeader(adminToken))
        .expect(400);
    });

    it('空 CSV → 400', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/admin/import/users')
        .set(authHeader(adminToken))
        .attach('file', Buffer.from('', 'utf8'), {
          filename: 'empty.csv',
          contentType: 'text/csv',
        })
        .expect(400);
    });

    it('非 admin → 403（CASL manage-all）', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/admin/import/users')
        .set(authHeader(userToken))
        .attach('file', Buffer.from('username,email\nx,x@test.com', 'utf8'), {
          filename: 'import.csv',
          contentType: 'text/csv',
        })
        .expect(403);
    });
  });
});
