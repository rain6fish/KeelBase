import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { createTestApp, registerUser, authHeader } from './helpers';
import { User } from '../src/common/entities/user.entity';

/**
 * 管理台脱敏字段级断言（security-verification-matrix §3 待补项 / CLAUDE.md §5.5 隐私红线）。
 *
 * 既有 e2e 只断言 email 含 `***`；本测试逐项核对 sanitizeForAdmin 的字段级输出：
 *   - email 掩码（不返回明文）
 *   - bio / dateOfBirth / firstName / lastName / avatarUrl / provider 不返回（管理页不出现用户填写的个人数据）
 *   - password / refreshTokenHash / loginAttempts / lockedUntil 不返回
 *   - username 保留用于识别
 * （phone 掩码实现同 maskEmail，走 bind-phone 需要 SMS 验证码，未在 e2e 中绑定）
 */
describe('Admin 用户详情脱敏（字段级断言）', () => {
  let app: INestApplication;
  let ds: DataSource;
  let adminToken: string;
  let targetId: number;
  let targetToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    ds = app.get(DataSource);

    const admin = await registerUser(app, {
      username: 'san_admin',
      email: 'san_admin@test.com',
      password: 'SanAdmin1',
      nickname: 'SanAdmin',
    });
    const adminEntity = await ds.getRepository(User).findOne({ where: { username: 'san_admin' } });
    await ds.getRepository(User).update(adminEntity!.id, { role: 'admin' });
    const adminLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: 'san_admin', password: 'SanAdmin1' })
      .expect(200);
    adminToken = adminLogin.body.data.accessToken;

    const target = await registerUser(app, {
      username: 'san_target',
      email: 'san_target@test.com',
      password: 'SanTgt12',
      nickname: 'SanTarget',
    });
    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set(authHeader(target.accessToken))
      .expect(200);
    targetId = me.body.data.id;
    targetToken = target.accessToken;

    // 用本人路径填充全部隐私字段（firstName/lastName/dateOfBirth/bio/avatarUrl）
    await request(app.getHttpServer())
      .put(`/api/v1/users/${targetId}`)
      .set(authHeader(targetToken))
      .send({
        firstName: '张三',
        lastName: '李四',
        dateOfBirth: '1990-01-01',
        bio: '私密个人简介',
        avatarUrl: 'https://example.com/avatar.png',
      })
      .expect(200);
  });

  afterAll(async () => {
    await app.close();
  });

  it('管理端用户详情：隐私字段不返回 + email/phone 掩码', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/admin/users/${targetId}/detail`)
      .set(authHeader(adminToken))
      .expect(200);
    const data = res.body.data;

    // 识别字段保留
    expect(data.username).toBe('san_target');
    // email 掩码（不返回明文）
    expect(data.email).toContain('***');
    expect(data.email).not.toBe('san_target@test.com');
    // 隐私字段不返回（管理页不出现用户填写的个人数据）
    expect(data.bio).toBeUndefined();
    expect(data.dateOfBirth).toBeUndefined();
    expect(data.firstName).toBeUndefined();
    expect(data.lastName).toBeUndefined();
    expect(data.avatarUrl).toBeUndefined();
    expect(data.provider).toBeUndefined();
    // 敏感内部字段不返回
    expect(data.password).toBeUndefined();
    expect(data.refreshTokenHash).toBeUndefined();
    expect(data.loginAttempts).toBeUndefined();
    expect(data.lockedUntil).toBeUndefined();
    // 聚合数据仍在（详情端点功能未被脱敏破坏）
    expect(data).toHaveProperty('sessions');
    expect(data).toHaveProperty('counts');
  });
});
