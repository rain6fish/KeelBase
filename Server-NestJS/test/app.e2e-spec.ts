import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import sharp from 'sharp';
import { createTestApp, registerUser, loginAs, authHeader } from './helpers';
import { UserRole } from '../src/common/entities/user.entity';
import { ConfirmationStore } from '../src/ai/confirmation/confirmation.store';
import { AiToolEffectsService } from '../src/ai/tool-effects/ai-tool-effects.service';

describe('App (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Health', () => {
    it('GET /api/v1/health should return ok', () => {
      return request(app.getHttpServer())
        .get('/api/v1/health')
        .expect(200)
        .expect((res) => {
          expect(res.body.data).toHaveProperty('status', 'ok');
        });
    });

    it('GET /api/v1/health?detail=true should include dependency statuses (D.9)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/health')
        .query({ detail: 'true' })
        .expect(200);
      expect(res.body.data).toHaveProperty('dependencies');
      expect(res.body.data.dependencies).toHaveProperty('database');
      expect(res.body.data.dependencies).toHaveProperty('redis');
      expect(res.body.data.dependencies).toHaveProperty('storage');
    });

    it('GET /api/v1/health without detail stays lightweight', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/health')
        .expect(200);
      expect(res.body.data).not.toHaveProperty('dependencies');
    });
  });

  describe('App Version', () => {
    it('GET /api/v1/app/version should return version metadata without auth', () => {
      return request(app.getHttpServer())
        .get('/api/v1/app/version')
        .expect(200)
        .expect((res) => {
          expect(res.body.data).toHaveProperty('latestVersion');
          expect(res.body.data).toHaveProperty('minRequiredVersion');
          expect(res.body.data).toHaveProperty('updateUrl');
          expect(Array.isArray(res.body.data.changelog)).toBe(true);
        });
    });
  });

  describe('Auth — Full Flow', () => {
    const testUser = {
      username: 'e2e_test_user',
      email: 'e2e@test.com',
      password: 'TestPass123',
      nickname: 'E2E Tester',
    };
    let accessToken: string;
    let refreshToken: string;

    it('POST /api/v1/auth/register should create a new user', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send(testUser)
        .expect(201);

      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
      expect(res.body.data.user.username).toBe(testUser.username);
      // Password must never be exposed
      expect(res.body.data.user.password).toBeUndefined();
      accessToken = res.body.data.accessToken;
      refreshToken = res.body.data.refreshToken;

      // 该流程后续有 logout 等写操作，视为已验证邮箱
      const ds = app.get(DataSource);
      await ds.getRepository('users').update(res.body.data.user.id, { emailVerified: true });
    });

    it('should store phone encrypted in DB (S.2 static encryption)', async () => {
      const phone = '+8613800138000';
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ ...testUser, username: 'enc_phone_user', email: 'enc_phone@test.com', phone })
        .expect(201);

      const ds = app.get(DataSource);
      const repo = ds.getRepository('users');
      const saved = await repo.findOne({ where: { username: 'enc_phone_user' } });
      // 明文手机号不应出现在 DB
      expect(saved.phone).toBeDefined();
      expect(saved.phone).not.toContain('13800138000');
      expect(saved.phone).not.toBe(phone);
      // 密文格式：iv:tag:ciphertext（base64 冒号分隔）
      expect(saved.phone.split(':')).toHaveLength(3);
    });

    it('POST /api/v1/auth/register should reject duplicate username', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send(testUser)
        .expect(401);

      expect(res.body.message).toMatch(/already exists/i);
    });

    it('POST /api/v1/auth/register should reject weak password', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ ...testUser, username: 'other_user', email: 'other@test.com', password: 'short' })
        .expect(400);
    });

    it('GET /api/v1/auth/me should return current user profile', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set(authHeader(accessToken))
        .expect(200);

      expect(res.body.data.username).toBe(testUser.username);
    });

    it('GET /api/v1/auth/me should reject unauthenticated request', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .expect(401);
    });

    it('POST /api/v1/auth/refresh should issue new tokens', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
      // Old refresh token should be invalidated (rotation)
      refreshToken = res.body.data.refreshToken;
      accessToken = res.body.data.accessToken;
    });

    it('POST /api/v1/auth/refresh should reject a used refresh token (rotation)', async () => {
      // The old refresh token from registration was rotated in the test above
      const { refreshToken: oldRefreshToken } = await registerUser(app, {
        username: 'rotation_test',
        email: 'rotation@test.com',
        password: 'Rotation1',
        nickname: 'Rotation',
      });

      // Use it once — succeeds
      const firstUse = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: oldRefreshToken })
        .expect(200);
      const newToken = firstUse.body.data.refreshToken;

      // Try the same old token again — should fail (rotation)
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: oldRefreshToken })
        .expect(401);

      // Per spec: "refresh token 不匹配时清除所有会话" — when a rotated
      // old token is presented, ALL sessions are revoked, so the new
      // token is also invalidated.
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: newToken })
        .expect(401);
    });

    it('POST /api/v1/auth/logout should revoke refresh token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set(authHeader(accessToken))
        .expect(200);

      // After logout, the refresh token should be invalid
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken })
        .expect(401);
    });

    it('POST /api/v1/auth/login should succeed with valid credentials', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ username: testUser.username, password: testUser.password })
        .expect(200);

      expect(res.body.data.accessToken).toBeDefined();
      accessToken = res.body.data.accessToken;
      refreshToken = res.body.data.refreshToken;
    });

    it('POST /api/v1/auth/login should return same error for wrong password and nonexistent user', async () => {
      const wrongPass = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ username: testUser.username, password: 'WrongPass123' })
        .expect(401);

      const noUser = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ username: 'nonexistent_user_xyz', password: 'SomePass123' })
        .expect(401);

      // Both error messages should be identical (no user enumeration)
      expect(wrongPass.body.message).toBe(noUser.body.message);
    });

    it('POST /api/v1/auth/forgot-password returns uniform response for unknown email', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'not_registered@example.com' })
        .expect(200);
      expect(res.body.data.message).toContain('reset link');
    });

    it('POST /api/v1/auth/forgot-password returns uniform response for known email', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/forgot-password')
        .send({ email: testUser.email })
        .expect(200);
      expect(res.body.data.message).toContain('reset link');
    });

    it('POST /api/v1/auth/reset-password rejects invalid token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send({ token: 'not-a-real-token', newPassword: 'NewPass123' })
        .expect(401);
    });

    it('POST /api/v1/auth/verify-email rejects wrong code', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/verify-email')
        .send({ email: 'e2e@test.com', code: '000000' })
        .expect(401);
    });

    it('POST /api/v1/auth/resend-verification returns uniform response', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/resend-verification')
        .send({ email: 'not_registered@example.com' })
        .expect(200);
      expect(res.body.data.message).toContain('verification code');
    });
  });

  describe('Sessions — multi-device management', () => {
    let userToken: string;
    let userId: number;

    beforeAll(async () => {
      const tokens = await registerUser(app, {
        username: 'session_user',
        email: 'session@test.com',
        password: 'Session1',
        nickname: 'Session',
      });
      userToken = tokens.accessToken;
      const me = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set(authHeader(userToken))
        .expect(200);
      userId = me.body.data.id;
    });

    it('login creates a session row, GET /auth/sessions lists it with isCurrent', async () => {
      // 登录时带 x-device-id → 登记会话
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('x-device-id', 'dev-e2e-001')
        .send({ username: 'session_user', password: 'Session1' })
        .expect(200);

      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/sessions')
        .set(authHeader(userToken))
        .set('x-device-id', 'dev-e2e-001')
        .expect(200);

      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      const current = res.body.data.find((s: any) => s.isCurrent === true);
      expect(current).toBeDefined();
      expect(current.deviceId).toBe('dev-e2e-001');
    });

    it('DELETE /auth/sessions/:id revokes own session (remote logout)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/sessions')
        .set(authHeader(userToken))
        .expect(200);
      const target = res.body.data[0];

      await request(app.getHttpServer())
        .delete(`/api/v1/auth/sessions/${target.id}`)
        .set(authHeader(userToken))
        .expect(200);

      // 会话已删
      const after = await request(app.getHttpServer())
        .get('/api/v1/auth/sessions')
        .set(authHeader(userToken))
        .expect(200);
      expect(after.body.data.find((s: any) => s.id === target.id)).toBeUndefined();
    });

    it('DELETE /auth/sessions/:id rejects other user session (403)', async () => {
      const other = await registerUser(app, {
        username: 'session_other',
        email: 'session_other@test.com',
        password: 'Other123',
        nickname: 'Other',
      });
      const otherSessions = await request(app.getHttpServer())
        .get('/api/v1/auth/sessions')
        .set(authHeader(other.accessToken))
        .expect(200);

      // userToken 尝试删 other 的会话 → 403/401
      await request(app.getHttpServer())
        .delete(`/api/v1/auth/sessions/${otherSessions.body.data[0].id}`)
        .set(authHeader(userToken))
        .expect(401);
    });
  });

  describe('Users — CRUD', () => {
    let userA: { accessToken: string; refreshToken: string };
    let userB: { accessToken: string; refreshToken: string };

    beforeAll(async () => {
      userA = await registerUser(app, {
        username: 'user_a_crud',
        email: 'usera@test.com',
        password: 'UserAPass1',
        nickname: 'UserA',
      });
      userB = await registerUser(app, {
        username: 'user_b_crud',
        email: 'userb@test.com',
        password: 'UserBPass1',
        nickname: 'UserB',
      });
    });

    it('GET /api/v1/users/:id should return own profile', async () => {
      const me = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set(authHeader(userA.accessToken))
        .expect(200);
      const myId = me.body.data.id;

      const res = await request(app.getHttpServer())
        .get(`/api/v1/users/${myId}`)
        .set(authHeader(userA.accessToken))
        .expect(200);

      expect(res.body.data.username).toBe('user_a_crud');
      // Sensitive fields should never be exposed
      expect(res.body.data.password).toBeUndefined();
    });

    it('GET /api/v1/users/:id should reject access to other user', async () => {
      // Get user B's id by hitting /auth/me as user B
      const bProfile = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set(authHeader(userB.accessToken))
        .expect(200);
      const bId = bProfile.body.data.id;

      await request(app.getHttpServer())
        .get(`/api/v1/users/${bId}`)
        .set(authHeader(userA.accessToken))
        .expect(403);
    });

    it('PUT /api/v1/users/:id should update own profile', async () => {
      const me = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set(authHeader(userA.accessToken))
        .expect(200);
      const myId = me.body.data.id;

      const res = await request(app.getHttpServer())
        .put(`/api/v1/users/${myId}`)
        .set(authHeader(userA.accessToken))
        .send({ nickname: 'UpdatedNickname' })
        .expect(200);

      expect(res.body.data.nickname).toBe('UpdatedNickname');
    });

    it('PUT /api/v1/users/:id should reject updating other user', async () => {
      const bProfile = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set(authHeader(userB.accessToken))
        .expect(200);
      const bId = bProfile.body.data.id;

      await request(app.getHttpServer())
        .put(`/api/v1/users/${bId}`)
        .set(authHeader(userA.accessToken))
        .send({ nickname: 'Hacked' })
        .expect(403);
    });

    it('DELETE /api/v1/users/:id should reject deleting other user', async () => {
      const bProfile = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set(authHeader(userB.accessToken))
        .expect(200);
      const bId = bProfile.body.data.id;

      await request(app.getHttpServer())
        .delete(`/api/v1/users/${bId}`)
        .set(authHeader(userA.accessToken))
        .expect(403);
    });
  });

  describe('Events — CRUD + Ownership', () => {
    let userA: { accessToken: string };
    let userB: { accessToken: string };
    let eventId: number;

    beforeAll(async () => {
      userA = await registerUser(app, {
        username: 'user_a_evt',
        email: 'usera_evt@test.com',
        password: 'UserAEvt1',
        nickname: 'UserAEvt',
      });
      userB = await registerUser(app, {
        username: 'user_b_evt',
        email: 'userb_evt@test.com',
        password: 'UserBEvt1',
        nickname: 'UserBEvt',
      });
    });

    it('GET /events rejects unauthenticated (T.4 401)', async () => {
      await request(app.getHttpServer()).get('/api/v1/events').expect(401);
    });

    it('POST /events rejects unauthenticated (T.4 401)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/events')
        .send({ title: 'x', startTime: new Date().toISOString(), endTime: new Date().toISOString() })
        .expect(401);
    });

    it('POST /api/v1/events should create an event', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/events')
        .set(authHeader(userA.accessToken))
        .send({
          title: 'Test Event',
          description: 'An event for e2e testing',
          startTime: '2026-08-01T09:00:00Z',
          endTime: '2026-08-01T10:00:00Z',
        })
        .expect(201);

      expect(res.body.data.title).toBe('Test Event');
      expect(res.body.data.userId).toBeDefined();
      eventId = res.body.data.id;
    });

    it('GET /api/v1/events with date range should return events', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/events')
        .set(authHeader(userA.accessToken))
        .query({ start: '2026-08-01', end: '2026-08-31' })
        .expect(200);

      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.some((e: any) => e.id === eventId)).toBe(true);
    });

    it('GET /api/v1/events/:id should return event detail', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/events/${eventId}`)
        .set(authHeader(userA.accessToken))
        .expect(200);

      expect(res.body.data.title).toBe('Test Event');
    });

    it('GET /api/v1/events/:id should reject access from other user', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/events/${eventId}`)
        .set(authHeader(userB.accessToken))
        .expect(403);
    });

    it('PUT /api/v1/events/:id should update own event', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/v1/events/${eventId}`)
        .set(authHeader(userA.accessToken))
        .send({ title: 'Updated Event Title' })
        .expect(200);

      expect(res.body.data.title).toBe('Updated Event Title');
    });

    it('PUT /api/v1/events/:id should reject updating other user event', async () => {
      await request(app.getHttpServer())
        .put(`/api/v1/events/${eventId}`)
        .set(authHeader(userB.accessToken))
        .send({ title: 'Hacked Event' })
        .expect(403);
    });

    it('DELETE /api/v1/events/:id should reject deleting other user event', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/events/${eventId}`)
        .set(authHeader(userB.accessToken))
        .expect(403);
    });

    it('DELETE /api/v1/events/:id should delete own event', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/events/${eventId}`)
        .set(authHeader(userA.accessToken))
        .expect(200);

      // Verify it's gone
      await request(app.getHttpServer())
        .get(`/api/v1/events/${eventId}`)
        .set(authHeader(userA.accessToken))
        .expect(404);
    });

    it('POST /api/v1/events should validate input', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/events')
        .set(authHeader(userA.accessToken))
        .send({ title: '' })
        .expect(400);
    });

    it('GET /api/v1/events/search should support keyword search', async () => {
      // Create an event with unique keyword
      await request(app.getHttpServer())
        .post('/api/v1/events')
        .set(authHeader(userA.accessToken))
        .send({
          title: 'UniqueKeywordMeeting',
          description: 'Search test event',
          startTime: '2026-09-01T09:00:00Z',
          endTime: '2026-09-01T10:00:00Z',
        })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/api/v1/events/search')
        .set(authHeader(userA.accessToken))
        .query({ keyword: 'UniqueKeyword' })
        .expect(200);

      expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.items[0].title).toContain('UniqueKeyword');
    });
  });

  describe('RBAC — Admin-only endpoints', () => {
    let userToken: string;

    beforeAll(async () => {
      const tokens = await registerUser(app, {
        username: 'rbac_user',
        email: 'rbac@test.com',
        password: 'RbacUser1',
        nickname: 'RbacUser',
      });
      userToken = tokens.accessToken;
    });

    it('GET /api/v1/users should be forbidden for regular users', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/users')
        .set(authHeader(userToken))
        .expect(403);
    });

    it('POST /api/v1/users should be forbidden for regular users', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/users')
        .set(authHeader(userToken))
        .send({
          username: 'admin_created',
          email: 'admin@test.com',
          password: 'AdminPass1',
          nickname: 'AdminCreated',
        })
        .expect(403);
    });

    it('GET /api/v1/users should require authentication', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/users')
        .expect(401);
    });
  });

  describe('Admin — management endpoints', () => {
    let adminToken: string;
    let regularToken: string;
    let regularId: number;
    let eventId: number;

    beforeAll(async () => {
      // 注册普通用户，并提升为 admin（直接改 DB 后再登录拿到 admin token）
      const regular = await registerUser(app, {
        username: 'admin_user',
        email: 'admin@test.com',
        password: 'AdminPass1',
        nickname: 'AdminUser',
      });
      regularToken = regular.accessToken;

      const ds = app.get(DataSource);
      const repo = ds.getRepository('users');
      const meRes = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set(authHeader(regularToken))
        .expect(200);
      regularId = meRes.body.data.id;
      await repo.update(regularId, { role: UserRole.ADMIN });

      // 重新登录获得含 admin 角色的 token
      adminToken = (
        await loginAs(app, 'admin_user', 'AdminPass1')
      ).accessToken;
    });

    it('PATCH /api/v1/users/:id/role should be admin-only', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/users/${regularId}/role`)
        .set(authHeader(regularToken)) // 旧 token 仍是 user 角色
        .send({ role: UserRole.USER })
        .expect(403);
    });

    it('PATCH /api/v1/users/:id/role should update role (admin)', async () => {
      const victim = await registerUser(app, {
        username: 'role_victim',
        email: 'role@test.com',
        password: 'RolePass1',
        nickname: 'RoleVictim',
      });
      const vMe = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set(authHeader(victim.accessToken))
        .expect(200);
      const victimId = vMe.body.data.id;

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/users/${victimId}/role`)
        .set(authHeader(adminToken))
        .send({ role: UserRole.ADMIN })
        .expect(200);
      expect(res.body.data.role).toBe(UserRole.ADMIN);
    });

    it('GET /api/v1/events/admin/all should list all events (admin)', async () => {
      // 普通用户建一个事件
      const ev = await request(app.getHttpServer())
        .post('/api/v1/events')
        .set(authHeader(regularToken))
        .send({
          title: 'AdminListEvent',
          startTime: '2026-10-01T09:00:00Z',
          endTime: '2026-10-01T10:00:00Z',
        })
        .expect(201);
      eventId = ev.body.data.id;

      const res = await request(app.getHttpServer())
        .get('/api/v1/events/admin/all')
        .set(authHeader(adminToken))
        .expect(200);
      expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
    });

    it('GET /api/v1/events/admin/all should be forbidden for regular users', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/events/admin/all')
        .set(authHeader(regularToken))
        .expect(403);
    });

    it('DELETE /api/v1/events/admin/:id should delete any event (admin)', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/events/admin/${eventId}`)
        .set(authHeader(adminToken))
        .expect(200);

      // 事件已被删
      await request(app.getHttpServer())
        .get(`/api/v1/events/${eventId}`)
        .set(authHeader(regularToken))
        .expect(404);
    });

    it('GET /api/v1/audit/stats should be admin-only', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/audit/stats')
        .set(authHeader(adminToken))
        .expect(200);
      expect(res.body.data).toHaveProperty('totalMessages');
    });
  });

  describe('Admin — aggregation endpoints', () => {
    let adminToken: string;
    let regularToken: string;
    let regularId: number;

    beforeAll(async () => {
      const regular = await registerUser(app, {
        username: 'agg_user',
        email: 'agg@test.com',
        password: 'AggPass1',
        nickname: 'AggUser',
      });
      regularToken = regular.accessToken;

      const ds = app.get(DataSource);
      const meRes = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set(authHeader(regularToken))
        .expect(200);
      regularId = meRes.body.data.id;
      await ds.getRepository('users').update(regularId, { role: UserRole.ADMIN });
      adminToken = (await loginAs(app, 'agg_user', 'AggPass1')).accessToken;
    });

    it('GET /api/v1/admin/monitor/summary should return health + counts (admin)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/monitor/summary')
        .set(authHeader(adminToken))
        .expect(200);
      expect(res.body.data.health).toHaveProperty('status', 'ok');
      expect(res.body.data.dependencies).toHaveProperty('database');
      expect(res.body.data.counts).toHaveProperty('users');
      expect(res.body.data.counts).toHaveProperty('sessions');
      expect(res.body.data.metrics).toHaveProperty('inFlight');
    });

    it('GET /api/v1/admin/overview should return counts + trend (admin)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/overview?days=7')
        .set(authHeader(adminToken))
        .expect(200);
      expect(res.body.data.counts).toHaveProperty('users');
      expect(res.body.data.counts).toHaveProperty('events');
      expect(res.body.data).toHaveProperty('storage');
      expect(Array.isArray(res.body.data.trend)).toBe(true);
    });

    it('GET /api/v1/admin/sessions should list sessions with username (admin)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/sessions')
        .set(authHeader(adminToken))
        .expect(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data[0]).toHaveProperty('userId');
    });

    it('DELETE /api/v1/admin/sessions/:id should revoke a session (admin)', async () => {
      const victim = await registerUser(app, {
        username: 'session_victim',
        email: 'sess@test.com',
        password: 'SessPass1',
        nickname: 'SessVictim',
      });
      // 登录产生一条会话
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set(authHeader(victim.accessToken))
        .expect(200);

      const list = await request(app.getHttpServer())
        .get('/api/v1/admin/sessions')
        .set(authHeader(adminToken))
        .expect(200);
      const victimSession = list.body.data.find(
        (s: { username: string }) => s.username === 'session_victim',
      );
      expect(victimSession).toBeDefined();

      await request(app.getHttpServer())
        .delete(`/api/v1/admin/sessions/${victimSession.id}`)
        .set(authHeader(adminToken))
        .expect(200);

      const after = await request(app.getHttpServer())
        .get('/api/v1/admin/sessions')
        .set(authHeader(adminToken))
        .expect(200);
      expect(
        after.body.data.find((s: { id: number }) => s.id === victimSession.id),
      ).toBeUndefined();
    });

    it('POST /api/v1/admin/notifications/broadcast should send to selected users', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/admin/notifications/broadcast')
        .set(authHeader(adminToken))
        .send({ title: 'BroadcastTest', body: 'hello', userIds: [regularId] })
        .expect(201);
      expect(res.body.data.sent).toBe(1);

      const list = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set(authHeader(regularToken))
        .expect(200);
      const titles = list.body.data.items.map((n: { title: string }) => n.title);
      expect(titles).toContain('BroadcastTest');
    });

    it('admin aggregation endpoints should be forbidden for regular users', async () => {
      const regular = await registerUser(app, {
        username: 'agg_regular',
        email: 'aggreg@test.com',
        password: 'AggReg1x',
        nickname: 'AggRegular',
      });
      await request(app.getHttpServer())
        .get('/api/v1/admin/monitor/summary')
        .set(authHeader(regular.accessToken))
        .expect(403);
      await request(app.getHttpServer())
        .get('/api/v1/admin/overview')
        .set(authHeader(regular.accessToken))
        .expect(403);
      await request(app.getHttpServer())
        .get('/api/v1/admin/sessions')
        .set(authHeader(regular.accessToken))
        .expect(403);
      await request(app.getHttpServer())
        .post('/api/v1/admin/notifications/broadcast')
        .set(authHeader(regular.accessToken))
        .send({ title: 'x', userIds: [1] })
        .expect(403);
    });

    it('GET /api/v1/admin/users/:id/detail should return masked user + stats', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/users/${regularId}/detail`)
        .set(authHeader(adminToken))
        .expect(200);
      expect(res.body.data.username).toBe('agg_user');
      expect(res.body.data.email).toContain('***'); // 掩码
      expect(res.body.data).toHaveProperty('sessions');
      expect(res.body.data).toHaveProperty('notifications');
      expect(res.body.data.counts).toHaveProperty('events');
      expect(res.body.data.counts).toHaveProperty('totalTokens');
    });

    it('GET /api/v1/events/admin/all should filter by keyword and status', async () => {
      // 建一个已取消事件
      await request(app.getHttpServer())
        .post('/api/v1/events')
        .set(authHeader(regularToken))
        .send({
          title: 'FilterTargetEvent',
          startTime: '2026-11-01T09:00:00Z',
          endTime: '2026-11-01T10:00:00Z',
        })
        .expect(201);
      const cancelRes = await request(app.getHttpServer())
        .post('/api/v1/events')
        .set(authHeader(regularToken))
        .send({
          title: 'FilterCancelledEvent',
          startTime: '2026-11-02T09:00:00Z',
          endTime: '2026-11-02T10:00:00Z',
        })
        .expect(201);
      await request(app.getHttpServer())
        .put(`/api/v1/events/${cancelRes.body.data.id}`)
        .set(authHeader(regularToken))
        .send({
          title: 'FilterCancelledEvent',
          startTime: '2026-11-02T09:00:00Z',
          endTime: '2026-11-02T10:00:00Z',
          isCancelled: true,
        })
        .expect(200);

      const byKeyword = await request(app.getHttpServer())
        .get('/api/v1/events/admin/all')
        .query({ keyword: 'FilterTarget' })
        .set(authHeader(adminToken))
        .expect(200);
      expect(byKeyword.body.data.items.length).toBe(1);
      expect(byKeyword.body.data.items[0].title).toBe('FilterTargetEvent');

      const byStatus = await request(app.getHttpServer())
        .get('/api/v1/events/admin/all')
        .query({ isCancelled: 'true' })
        .set(authHeader(adminToken))
        .expect(200);
      expect(byStatus.body.data.items.some((e: { title: string }) => e.title === 'FilterCancelledEvent')).toBe(true);
    });
  });

  describe('Security — S.3', () => {
    let userToken: string;

    beforeAll(async () => {
      const tokens = await registerUser(app, {
        username: 'sec_user',
        email: 'sec@test.com',
        password: 'SecPass1x',
        nickname: 'SecUser',
      });
      userToken = tokens.accessToken;
    });

    it('SQL injection payload in search keyword is treated as literal (no crash/leak)', async () => {
      const payload = "x' OR '1'='1";
      const res = await request(app.getHttpServer())
        .get('/api/v1/events/admin/all')
        .query({ keyword: payload })
        .set(authHeader(userToken))
        .expect(403); // 非 admin 直接被拒，证明权限优先于查询
      // admin 视角：注入串作为字面量 LIKE，不报错、不泄全部
      const ds = app.get(DataSource);
      const adminUser = await ds.getRepository('users').findOne({ where: { username: 'agg_user' } });
      if (adminUser) {
        const me = await request(app.getHttpServer())
          .get('/api/v1/auth/me')
          .set(authHeader(userToken))
          .expect(200);
        await ds.getRepository('users').update(me.body.data.id, { role: UserRole.ADMIN });
        const adminToken = (await loginAs(app, 'sec_user', 'SecPass1x')).accessToken;
        const adminRes = await request(app.getHttpServer())
          .get('/api/v1/events/admin/all')
          .query({ keyword: payload })
          .set(authHeader(adminToken))
          .expect(200);
        // LIKE %x' OR '1'='1% 匹配 0 个标题，不返回全部（防注入泄全表）
        expect(adminRes.body.data.items.length).toBeLessThan(100);
      }
    });

    it('sort injection attempts fall back to whitelist default', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/users')
        .query({ sort: 'id; DROP TABLE users; --' })
        .set(authHeader(userToken))
        .expect(403); // 非 admin 被拒
      // admin 视角：非法 sort 落到白名单默认 createdAt，不报错
      const me = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set(authHeader(userToken))
        .expect(200);
      const ds = app.get(DataSource);
      await ds.getRepository('users').update(me.body.data.id, { role: UserRole.ADMIN });
      const adminToken = (await loginAs(app, 'sec_user', 'SecPass1x')).accessToken;
      await request(app.getHttpServer())
        .get('/api/v1/users')
        .query({ sort: 'id; DROP TABLE users; --', order: 'desc' })
        .set(authHeader(adminToken))
        .expect(200);
    });

    it('extra fields are rejected by validation whitelist (forbidNonWhitelisted)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/events')
        .set(authHeader(userToken))
        .send({
          title: 'WhitelistEvent',
          startTime: '2026-12-01T09:00:00Z',
          endTime: '2026-12-01T10:00:00Z',
          role: 'admin', // 多余字段（越权字段）应被拒绝
        })
        .expect(400);
    });
  });

  describe('Validation', () => {
    it('POST /api/v1/auth/register should reject empty body', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({})
        .expect(400);
    });

    it('POST /api/v1/auth/login should reject missing fields', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({})
        .expect(400);
    });

    it('should reject requests with malformed IDs', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/users/abc')
        .set(authHeader('some_token'))
        .expect(401); // Auth check before param validation
    });
  });

  describe('Metrics', () => {
    it('GET /api/v1/metrics should return prometheus metrics without auth', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/metrics')
        .expect(200);

      expect(res.headers['content-type']).toContain('text/plain');
      // Counter + default node metrics registered
      expect(res.text).toContain('http_requests_total');
      expect(res.text).toContain('process_cpu_');
    });

    it('GET /api/v1/metrics should be skipped by throttler (no 429 on repeated access)', async () => {
      // 顺序多次访问，验证 /metrics 跳过限流（CI 环境并发连接不可靠，用串行）
      for (let i = 0; i < 5; i++) {
        const res = await request(app.getHttpServer())
          .get('/api/v1/metrics')
          .expect(200);
        expect(res.text).toContain('http_requests_total');
      }
    });
  });

  describe('Notifications', () => {
    let token: string;
    let userId: number;
    let notifId: number;

    beforeAll(async () => {
      const tokens = await registerUser(app, {
        username: 'notif_user',
        email: 'notif@test.com',
        password: 'NotifPass1',
        nickname: 'NotifUser',
      });
      token = tokens.accessToken;
      const me = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set(authHeader(token))
        .expect(200);
      userId = me.body.data.id;

      // 直接插 DB 造通知
      const ds = app.get(DataSource);
      const repo = ds.getRepository('notifications');
      const created = await repo.save({
        userId,
        title: '系统通知',
        body: '欢迎使用',
        type: 'system',
        isRead: false,
      });
      notifId = created.id;
    });

    it('GET /api/v1/notifications should list own notifications', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set(authHeader(token))
        .expect(200);
      expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.items[0].title).toBe('系统通知');
    });

    it('GET /api/v1/notifications/unread-count should return count', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/notifications/unread-count')
        .set(authHeader(token))
        .expect(200);
      expect(res.body.data.count).toBeGreaterThanOrEqual(1);
    });

    it('PATCH /api/v1/notifications/:id/read should mark read', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/notifications/${notifId}/read`)
        .set(authHeader(token))
        .expect(200);
    });

    it('PATCH /api/v1/notifications/read-all should mark all read', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/notifications/read-all')
        .set(authHeader(token))
        .expect(200);
      const res = await request(app.getHttpServer())
        .get('/api/v1/notifications/unread-count')
        .set(authHeader(token))
        .expect(200);
      expect(res.body.data.count).toBe(0);
    });

    it('DELETE /api/v1/notifications/:id should delete', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/notifications/${notifId}`)
        .set(authHeader(token))
        .expect(200);
      const res = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set(authHeader(token))
        .expect(200);
      expect(res.body.data.items.length).toBe(0);
    });
  });

  describe('AI Conversations', () => {
    let token: string;
    let convId: string;

    beforeAll(async () => {
      const tokens = await registerUser(app, {
        username: 'ai_conv_user',
        email: 'aiconv@test.com',
        password: 'AiConv123',
        nickname: 'AiConv',
      });
      token = tokens.accessToken;

      // 直插 DB 造对话（chat 端点需真实 AI key，测试环境不可用）
      const ds = app.get(DataSource);
      const convRepo = ds.getRepository('ai_conversations');
      const msgRepo = ds.getRepository('ai_messages');
      const created = await convRepo.save({
        id: 'e2e-conv-1',
        userId: 'ai-conv-user-id',
        provider: 'deepseek',
        model: 'deepseek-v4-flash',
        messageCount: 1,
        lastActivityAt: new Date(),
        isDeleted: false,
      });
      convId = created.id;
      await msgRepo.save({
        conversationId: convId,
        role: 'user',
        content: '你好',
      });
    });

    it('GET /api/v1/ai/conversations should return conversations', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/ai/conversations')
        .set(authHeader(token))
        .expect(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('POST /ai/chat rejects unauthenticated (T.4 401)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/ai/chat')
        .send({ message: 'hello' })
        .expect(401);
    });

    it('DELETE /api/v1/ai/conversations/:id should reject other user conversation (403)', async () => {
      // 对话 userId 是 'ai-conv-user-id'（字符串），当前用户是数字 id → 越权
      await request(app.getHttpServer())
        .delete(`/api/v1/ai/conversations/${convId}`)
        .set(authHeader(token))
        .expect(403);
    });

    it('DELETE /api/v1/ai/conversations should clear (不报错)', async () => {
      await request(app.getHttpServer())
        .delete('/api/v1/ai/conversations')
        .set(authHeader(token))
        .expect(200);
    });
  });

  describe('AI Insights', () => {
    let token: string;

    beforeAll(async () => {
      const tokens = await registerUser(app, {
        username: 'insight_user',
        email: 'insight@test.com',
        password: 'Insight123',
        nickname: 'Insight',
      });
      token = tokens.accessToken;
    });

    it('POST /api/v1/ai/insights should return structured stats', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/ai/insights')
        .set(authHeader(token))
        .send({ days: 30 })
        .expect(201);

      expect(res.body.data.stats).toBeDefined();
      expect(res.body.data.stats.totalEvents).toBe(0);
      expect(res.body.data.stats.activeEvents).toBe(0);
      expect(Array.isArray(res.body.data.stats.monthlyBreakdown)).toBe(true);
      expect(res.body.data.summary).toBeDefined();
    });
  });

  describe('Knowledge — admin CRUD', () => {
    let adminToken: string;
    let regularToken: string;
    let articleId: number;

    beforeAll(async () => {
      // 注册普通用户，提升为 admin 后重新登录
      const regular = await registerUser(app, {
        username: 'kb_admin',
        email: 'kb@test.com',
        password: 'KbAdmin1',
        nickname: 'KbAdmin',
      });
      regularToken = regular.accessToken;

      const ds = app.get(DataSource);
      const repo = ds.getRepository('users');
      const meRes = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set(authHeader(regularToken))
        .expect(200);
      await repo.update(meRes.body.data.id, { role: UserRole.ADMIN });
      adminToken = (
        await loginAs(app, 'kb_admin', 'KbAdmin1')
      ).accessToken;
    });

    it('POST /api/v1/ai/knowledge should create article (admin)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/ai/knowledge')
        .set(authHeader(adminToken))
        .send({
          title: '休假政策',
          content: '员工每年可享受 5 天年假。',
          category: '人力资源',
        })
        .expect(201);
      expect(res.body.data.title).toBe('休假政策');
      expect(res.body.data.id).toBeDefined();
      articleId = res.body.data.id;
    });

    it('POST /api/v1/ai/knowledge should be forbidden for regular users', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/ai/knowledge')
        .set(authHeader(regularToken))
        .send({ title: '越权', content: '不应创建' })
        .expect(403);
    });

    it('GET /api/v1/ai/knowledge should list with search (admin)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/ai/knowledge?q=${encodeURIComponent('年假')}`)
        .set(authHeader(adminToken))
        .expect(200);
      expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.items[0].title).toBe('休假政策');
    });

    it('GET /api/v1/ai/knowledge/:id should return detail (admin)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/ai/knowledge/${articleId}`)
        .set(authHeader(adminToken))
        .expect(200);
      expect(res.body.data.content).toContain('5 天年假');
    });

    it('PATCH /api/v1/ai/knowledge/:id should update article (admin)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/ai/knowledge/${articleId}`)
        .set(authHeader(adminToken))
        .send({ title: '休假政策（更新）' })
        .expect(200);
      expect(res.body.data.title).toBe('休假政策（更新）');
    });

    it('DELETE /api/v1/ai/knowledge/:id should delete article (admin)', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/ai/knowledge/${articleId}`)
        .set(authHeader(adminToken))
        .expect(200);
      await request(app.getHttpServer())
        .get(`/api/v1/ai/knowledge/${articleId}`)
        .set(authHeader(adminToken))
        .expect(404);
    });
  });

  describe('Global Search', () => {
    let token: string;

    beforeAll(async () => {
      const tokens = await registerUser(app, {
        username: 'search_user',
        email: 'search@test.com',
        password: 'Search123',
        nickname: 'SearchNick',
      });
      token = tokens.accessToken;

      // 建一个可搜索的事件
      await request(app.getHttpServer())
        .post('/api/v1/events')
        .set(authHeader(token))
        .send({
          title: 'GlobalSearchMeeting',
          startTime: '2026-11-01T09:00:00Z',
          endTime: '2026-11-01T10:00:00Z',
        })
        .expect(201);
    });

    it('GET /api/v1/search should find own events', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/search?q=${encodeURIComponent('GlobalSearch')}`)
        .set(authHeader(token))
        .expect(200);

      expect(res.body.data.events.items.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.events.items[0].title).toBe('GlobalSearchMeeting');
      expect(res.body.data.users).toBeDefined();
    });

    it('GET /api/v1/search should return only public user fields', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/search?q=${encodeURIComponent('search_user')}`)
        .set(authHeader(token))
        .expect(200);

      expect(res.body.data.users.items.length).toBeGreaterThanOrEqual(1);
      const u = res.body.data.users.items[0];
      expect(u.username).toBe('search_user');
      // 私有字段不泄露
      expect(u.email).toBeUndefined();
      expect(u.phone).toBeUndefined();
      expect(u.role).toBeUndefined();
    });

    it('GET /api/v1/search should require auth', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/search?q=GlobalSearch')
        .expect(401);
    });
  });

  describe('Operation Audit', () => {
    let adminToken: string;
    let regularToken: string;
    let userId: number;

    beforeAll(async () => {
      const regular = await registerUser(app, {
        username: 'audit_user',
        email: 'audit@test.com',
        password: 'Audit123',
        nickname: 'AuditUser',
      });
      regularToken = regular.accessToken;
      const meRes = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set(authHeader(regularToken))
        .expect(200);
      userId = meRes.body.data.id;

      const ds = app.get(DataSource);
      const repo = ds.getRepository('users');
      await repo.update(userId, { role: UserRole.ADMIN });
      adminToken = (await loginAs(app, 'audit_user', 'Audit123')).accessToken;
    });

    it('POST /api/v1/audit/operations/logs should be admin-only (403 for regular)', async () => {
      const regular = await registerUser(app, {
        username: 'audit_reg',
        email: 'audit_reg@test.com',
        password: 'Reg12345',
        nickname: 'Reg',
      });
      await request(app.getHttpServer())
        .get('/api/v1/audit/operations/logs')
        .set(authHeader(regular.accessToken))
        .expect(403);
    });

    it('write operation creates an audit log visible to admin', async () => {
      // 触发一次写操作
      await request(app.getHttpServer())
        .post('/api/v1/events')
        .set(authHeader(adminToken))
        .send({
          title: 'AuditTestEvent',
          startTime: '2026-12-01T09:00:00Z',
          endTime: '2026-12-01T10:00:00Z',
        })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/audit/operations/logs?userId=${userId}`)
        .set(authHeader(adminToken))
        .expect(200);

      const matches = res.body.data.items.filter(
        (l: any) => l.action === 'CREATE' && l.path.includes('/events'),
      );
      expect(matches.length).toBeGreaterThanOrEqual(1);
      expect(matches[0].userId).toBe(userId);
    });

    it('GET /api/v1/audit/operations/stats returns grouped counts', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/audit/operations/stats')
        .set(authHeader(adminToken))
        .expect(200);

      expect(res.body.data).toBeDefined();
      expect(typeof res.body.data).toBe('object');
    });
  });

  describe('Upload', () => {
    let token: string;

    beforeAll(async () => {
      const tokens = await registerUser(app, {
        username: 'upload_user',
        email: 'upload@test.com',
        password: 'Upload123',
        nickname: 'Uploader',
      });
      token = tokens.accessToken;
    });

    it('POST /api/v1/upload returns url for a valid PNG', async () => {
      // 用 sharp 构造真实可解码的 10x10 PNG
      const png = await sharp({
        create: {
          width: 10,
          height: 10,
          channels: 3,
          background: { r: 200, g: 50, b: 50 },
        },
      })
        .png()
        .toBuffer();

      const res = await request(app.getHttpServer())
        .post('/api/v1/upload')
        .set(authHeader(token))
        .attach('file', png, 'test.png')
        .expect(201);

      // 图片被转成 webp（CR-21 起上传返回签名 URL，带 ?e=&s= 查询参数）
      expect(res.body.data.url).toMatch(/^\/uploads\/.+\.webp(?:\?e=\d+&s=[a-f0-9]+)?$/);
      expect(res.body.data.originalName).toBe('test.png');
      expect(res.body.data.mimeType).toBe('image/webp');
    });

    it('POST /api/v1/upload rejects file whose magic bytes do not match MIME', async () => {
      const fake = Buffer.from('this is not a real png');

      await request(app.getHttpServer())
        .post('/api/v1/upload')
        .set(authHeader(token))
        .attach('file', fake, 'fake.png')
        .expect(400);
    });
  });

  describe('Push Tokens', () => {
    let token: string;

    beforeAll(async () => {
      const tokens = await registerUser(app, {
        username: 'push_user',
        email: 'push@test.com',
        password: 'Push12345',
        nickname: 'PushUser',
      });
      token = tokens.accessToken;
    });

    it('POST /api/v1/push/tokens registers a device token', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/push/tokens')
        .set(authHeader(token))
        .send({ platform: 'android', token: 'registration-id-001', deviceId: 'dev-1' })
        .expect(201);

      expect(res.body.data.userId).toBeDefined();
      expect(res.body.data.token).toBe('registration-id-001');
    });

    it('POST /api/v1/push/tokens upserts same token (idempotent)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/push/tokens')
        .set(authHeader(token))
        .send({ platform: 'ios', token: 'registration-id-001' })
        .expect(201);
    });

    it('DELETE /api/v1/push/tokens/:token unregisters', async () => {
      await request(app.getHttpServer())
        .delete('/api/v1/push/tokens/registration-id-001')
        .set(authHeader(token))
        .expect(200);
    });
  });

  describe('Email Verification Guard', () => {
    let token: string;
    let userId: number;

    beforeAll(async () => {
      const tokens = await registerUser(app, {
        username: 'unverified_user',
        email: 'unverified@test.com',
        password: 'Unverif1',
        nickname: 'Unverified',
      });
      token = tokens.accessToken;
      const me = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set(authHeader(token))
        .expect(200);
      userId = me.body.data.id;
    });

    it('blocks write operation for unverified email (403)', async () => {
      const ds = app.get(DataSource);
      const repo = ds.getRepository('users');
      await repo.update(userId, { emailVerified: false });

      await request(app.getHttpServer())
        .post('/api/v1/events')
        .set(authHeader(token))
        .send({
          title: 'BlockedEvent',
          startTime: '2026-12-01T09:00:00Z',
          endTime: '2026-12-01T10:00:00Z',
        })
        .expect(403);
    });

    it('allows write operation after email verified', async () => {
      const ds = app.get(DataSource);
      const repo = ds.getRepository('users');
      await repo.update(userId, { emailVerified: true });

      await request(app.getHttpServer())
        .post('/api/v1/events')
        .set(authHeader(token))
        .send({
          title: 'AllowedEvent',
          startTime: '2026-12-02T09:00:00Z',
          endTime: '2026-12-02T10:00:00Z',
        })
        .expect(201);
    });
  });

  describe('Todos — CRUD', () => {
    let token: string;

    beforeAll(async () => {
      const tokens = await registerUser(app, {
        username: 'todo_user',
        email: 'todo@test.com',
        password: 'Todo12345',
        nickname: 'TodoUser',
      });
      token = tokens.accessToken;
    });

    it('creates and lists todos', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/todos')
        .set(authHeader(token))
        .send({ title: '买牛奶', completed: false })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/api/v1/todos')
        .set(authHeader(token))
        .expect(200);

      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data[0].title).toBe('买牛奶');
    });

    it('toggles complete and deletes', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/todos')
        .set(authHeader(token))
        .send({ title: '临时' })
        .expect(201);
      const id = created.body.data.id;

      await request(app.getHttpServer())
        .patch(`/api/v1/todos/${id}/complete`)
        .set(authHeader(token))
        .expect(200);

      const after = await request(app.getHttpServer())
        .get('/api/v1/todos')
        .set(authHeader(token))
        .expect(200);
      const target = after.body.data.find((t: any) => t.id === id);
      expect(target.completed).toBe(true);

      await request(app.getHttpServer())
        .delete(`/api/v1/todos/${id}`)
        .set(authHeader(token))
        .expect(200);
    });

    it('blocks deleting another user todo (403)', async () => {
      const other = await registerUser(app, {
        username: 'todo_other',
        email: 'todo_other@test.com',
        password: 'Todo6789',
        nickname: 'Other',
      });
      const created = await request(app.getHttpServer())
        .post('/api/v1/todos')
        .set(authHeader(token))
        .send({ title: '他人' })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/api/v1/todos/${created.body.data.id}`)
        .set(authHeader(other.accessToken))
        .expect(403);
    });

    it('GET /todos rejects unauthenticated (T.4 401)', async () => {
      await request(app.getHttpServer()).get('/api/v1/todos').expect(401);
    });

    it('blocks updating another user todo (T.4 403)', async () => {
      const other = await registerUser(app, {
        username: 'todo_other_upd',
        email: 'todo_other_upd@test.com',
        password: 'Todo6789',
        nickname: 'OtherUpd',
      });
      const created = await request(app.getHttpServer())
        .post('/api/v1/todos')
        .set(authHeader(token))
        .send({ title: '他人更新' })
        .expect(201);
      await request(app.getHttpServer())
        .patch(`/api/v1/todos/${created.body.data.id}`)
        .set(authHeader(other.accessToken))
        .send({ title: '篡改' })
        .expect(403);
    });

    it('blocks completing another user todo (T.4 403)', async () => {
      const other = await registerUser(app, {
        username: 'todo_other_cmp',
        email: 'todo_other_cmp@test.com',
        password: 'Todo6789',
        nickname: 'OtherCmp',
      });
      const created = await request(app.getHttpServer())
        .post('/api/v1/todos')
        .set(authHeader(token))
        .send({ title: '他人完成' })
        .expect(201);
      await request(app.getHttpServer())
        .patch(`/api/v1/todos/${created.body.data.id}/complete`)
        .set(authHeader(other.accessToken))
        .expect(403);
    });
  });

  describe('Account Compliance — SMS / deactivate / export', () => {
    let userToken: string;
    const phone = '+8613800138000';

    beforeAll(async () => {
      const tokens = await registerUser(app, {
        username: 'compliance_user',
        email: 'compliance@test.com',
        password: 'CompPass1x',
        nickname: 'CompUser',
      });
      userToken = tokens.accessToken;
    });

    it('POST /auth/send-sms-code returns uniform success', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/send-sms-code')
        .send({ phone })
        .expect(200);
      expect(res.body.data.sent).toBe(true);
    });

    it('POST /auth/bind-phone rejects wrong code (400)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/bind-phone')
        .set(authHeader(userToken))
        .send({ phone, code: '000000' })
        .expect(400);
    });

    it('POST /auth/login-phone rejects wrong code (code checked before phone lookup)', async () => {
      // 发码（未注册手机也统一成功，防枚举）
      await request(app.getHttpServer())
        .post('/api/v1/auth/send-sms-code')
        .send({ phone: '+8613900000000' })
        .expect(200);
      await request(app.getHttpServer())
        .post('/api/v1/auth/login-phone')
        .send({ phone: '+8613900000000', code: '000000' })
        .expect(400); // 验证码错误优先于未注册判定（安全）
    });

    it('GET /auth/export-data returns own full data', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/export-data')
        .set(authHeader(userToken))
        .expect(200);
      expect(res.body.data.profile.username).toBe('compliance_user');
      expect(res.body.data).toHaveProperty('exportedAt');
      expect(res.body.data).toHaveProperty('events');
    });

    it('POST /auth/deactivate removes account and revokes tokens', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/deactivate')
        .set(authHeader(userToken))
        .send({ password: 'CompPass1x' })
        .expect(200);

      // 注销后 token 失效
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set(authHeader(userToken))
        .expect(401);
    });

    it('POST /auth/deactivate rejects wrong password', async () => {
      const tokens = await registerUser(app, {
        username: 'compliance_keep',
        email: 'compliance_keep@test.com',
        password: 'CompKeep1',
        nickname: 'CompKeep',
      });
      await request(app.getHttpServer())
        .post('/api/v1/auth/deactivate')
        .set(authHeader(tokens.accessToken))
        .send({ password: 'wrongpass' })
        .expect(401);
    });
  });

  describe('T.7 — AI write-confirmation flow', () => {
    let userToken: string;
    let userId: number;
    let confirmationStore: ConfirmationStore;

    beforeAll(async () => {
      const tokens = await registerUser(app, {
        username: 't7_ai_user',
        email: 't7ai@test.com',
        password: 'T7AiPass1',
        nickname: 'T7Ai',
      });
      userToken = tokens.accessToken;
      confirmationStore = app.get(ConfirmationStore);
      const me = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set(authHeader(userToken))
        .expect(200);
      userId = me.body.data.id;
    });

    it('POST /ai/confirmations/:token approve resolves pending (确认→批准)', async () => {
      // 直接注入 pending confirmation（真实流式 chat 需 LLM，测试直连 store）
      const { token } = confirmationStore.create(String(userId), 'create_event', {
        title: 'AI 确认流测试事件',
        startTime: new Date().toISOString(),
        endTime: new Date(Date.now() + 3600_000).toISOString(),
      });
      const res = await request(app.getHttpServer())
        .post(`/api/v1/ai/confirmations/${token}`)
        .set(authHeader(userToken))
        .send({ decision: 'approve' })
        .expect(200);
      expect(res.body.data.ok).toBe(true);
      // pending 已消费
      expect(confirmationStore.pendingCount).toBe(0);
    });

    it('POST /ai/confirmations/:token rejects other user token (越权 404)', async () => {
      const other = await registerUser(app, {
        username: 't7_other',
        email: 't7other@test.com',
        password: 'T7Other1',
        nickname: 'T7Other',
      });
      const { token } = confirmationStore.create(String(userId), 'create_todo', {
        title: '他人不可确认',
      });
      // 另一用户拿 token 确认 → 404（token 属于他人）
      await request(app.getHttpServer())
        .post(`/api/v1/ai/confirmations/${token}`)
        .set(authHeader(other.accessToken))
        .send({ decision: 'approve' })
        .expect(404);
      // 未知 token → 404
      await request(app.getHttpServer())
        .post('/api/v1/ai/confirmations/unknown-token')
        .set(authHeader(userToken))
        .send({ decision: 'approve' })
        .expect(404);
    });

    it('POST /ai/confirmations/:token reject (拒绝→decline)', async () => {
      const { token } = confirmationStore.create(String(userId), 'create_event', {
        title: '拒绝测试',
      });
      const res = await request(app.getHttpServer())
        .post(`/api/v1/ai/confirmations/${token}`)
        .set(authHeader(userToken))
        .send({ decision: 'reject' })
        .expect(200);
      expect(res.body.data.ok).toBe(true);
    });
  });

  describe('T.7 — write-tool idempotency + revoke (HS-3)', () => {
    let userToken: string;
    let adminToken: string;
    let effectsService: AiToolEffectsService;
    let ds: DataSource;

    beforeAll(async () => {
      const user = await registerUser(app, {
        username: 't7_effect_user',
        email: 't7effect@test.com',
        password: 'T7EffPass1',
        nickname: 'T7Eff',
      });
      userToken = user.accessToken;
      // 提升为 admin（测试库无 seed admin，直接改 DB 角色后重新登录）
      ds = app.get(DataSource);
      const me = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set(authHeader(userToken))
        .expect(200);
      await ds.getRepository('users').update(me.body.data.id, { role: UserRole.ADMIN });
      adminToken = (await loginAs(app, 't7_effect_user', 'T7EffPass1')).accessToken;
      effectsService = app.get(AiToolEffectsService);
    });

    it('record 同参数两次 → 幂等键唯一，只有一条副作用', async () => {
      // 先建一个真实 event（副作用指向真实目标，list 的 _loadTarget 才能正常）
      const me = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set(authHeader(userToken))
        .expect(200);
      const eventRepo = ds.getRepository('Event');
      const evt = await eventRepo.save({
        title: '幂等测试事件',
        startTime: new Date(),
        endTime: new Date(Date.now() + 3600_000),
        userId: me.body.data.id,
      });
      const ctx = {
        userId: String(me.body.data.id),
        conversationId: 'conv-t7-1',
        toolName: 'create_event',
        args: { title: '幂等测试事件', startTime: '2026-09-01T10:00:00Z' },
      };
      const first = await effectsService.record(ctx, 'event', evt.id);
      const second = await effectsService.record(ctx, 'event', evt.id); // 同参数再记
      // 幂等：返回同一效果记录（冲突跳过）
      expect(first.id).toBe(second.id);
      // DB 中只有一条
      const count = await ds
        .getRepository('ai_tool_side_effects')
        .count({ where: { idempotencyKey: first.idempotencyKey } });
      expect(count).toBe(1);
    });

    it('GET /ai/tool-effects 普通用户 403（越权，admin 可见）', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/ai/tool-effects')
        .set(authHeader(userToken))
        .expect(403);
      const res = await request(app.getHttpServer())
        .get('/api/v1/ai/tool-effects')
        .set(authHeader(adminToken))
        .expect(200);
      expect(Array.isArray(res.body.data.items)).toBe(true);
    });

    it('P0-14 GET /ai/conversations/:id/trace 本人可见执行轨迹，他人 403', async () => {
      const owner = await registerUser(app, { username: 'trace_owner', email: 'traceowner@test.com', password: 'TracePw123', nickname: 'TraceOwner' });
      const other = await registerUser(app, { username: 'trace_other', email: 'traceother@test.com', password: 'TracePw123', nickname: 'TraceOther' });
      const uid = (await request(app.getHttpServer()).get('/api/v1/auth/me').set(authHeader(owner.accessToken)).expect(200)).body.data.id;

      // 直插会话 + 审计（tool_call/confirmation）+ 副作用，构造「创建事件」轨迹
      const convId = 'trace-e2e-1';
      const convRepo = ds.getRepository('ai_conversations');
      await convRepo.save({
        id: convId, userId: String(uid), provider: 'deepseek', model: 'deepseek-v4-flash',
        messageCount: 2, lastActivityAt: new Date(),
      });
      const base = new Date('2026-08-18T02:00:00.000Z');
      const auditRepo = ds.getRepository('ai_audit_logs');
      await auditRepo.save([
        { userId: String(uid), conversationId: convId, action: 'tool_call', detail: 'create_event({"title":"e2e 事件"})', isError: false, createdAt: base },
        { userId: String(uid), conversationId: convId, action: 'tool_confirmation', detail: 'create_event({"title":"e2e 事件"}) → approve', isError: false, createdAt: new Date(base.getTime() + 1000) },
      ]);
      const evt = await ds.getRepository('Event').save({
        title: 'e2e 事件', startTime: new Date(), endTime: new Date(Date.now() + 3600_000), userId: uid,
      });
      await effectsService.record(
        { userId: String(uid), conversationId: convId, toolName: 'create_event', args: { title: 'e2e 事件' } },
        'event',
        evt.id,
      );

      // 本人可见
      const res = await request(app.getHttpServer())
        .get(`/api/v1/ai/conversations/${convId}/trace`)
        .set(authHeader(owner.accessToken))
        .expect(200);
      const types = res.body.data.steps.map((s: any) => s.type) as string[];
      expect(types).toContain('tool_call');
      expect(types).toContain('confirmation');
      expect(types).toContain('effect');
      const effectStep = res.body.data.steps.find((s: any) => s.type === 'effect');
      expect(effectStep.effect.resultType).toBe('event');
      expect(effectStep.effect.revocable).toBe(true);

      // 他人越权 → 403
      await request(app.getHttpServer())
        .get(`/api/v1/ai/conversations/${convId}/trace`)
        .set(authHeader(other.accessToken))
        .expect(403);
    });

    it('DELETE /ai/tool-effects/:id revoke 软删目标 event（可经回收站恢复）', async () => {
      // 直插一个 event + 副作用记录
      const me = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set(authHeader(userToken))
        .expect(200);
      const eventRepo = ds.getRepository('Event');
      const evt = await eventRepo.save({
        title: '可撤销 AI 事件',
        startTime: new Date(),
        endTime: new Date(Date.now() + 3600_000),
        userId: me.body.data.id,
      });
      const effect = await effectsService.record(
        { userId: String(me.body.data.id), toolName: 'create_event', args: { title: '可撤销 AI 事件' } },
        'event',
        evt.id,
      );
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/ai/tool-effects/${effect.id}`)
        .set(authHeader(adminToken))
        .expect(200);
      expect(res.body.data.revoked).toBe(true);
      // 目标 event 软删（默认查询不可见，回收站可见）
      const after = await eventRepo.findOne({ where: { id: evt.id } });
      expect(after).toBeNull();
      const softDeleted = await eventRepo.findOne({ where: { id: evt.id }, withDeleted: true });
      expect(softDeleted?.deletedAt).toBeTruthy();
    });
  });

  describe('T.7 — headless API auth (HS-4)', () => {
    it('POST /headless/chat 无 API Key → 401', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/headless/chat')
        .send({ message: 'hello' })
        .expect(401);
    });

    it('POST /headless/chat 错误 API Key → 401', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/headless/chat')
        .set('x-api-key', 'wrong-key-123')
        .send({ message: 'hello' })
        .expect(401);
    });
  });
});
