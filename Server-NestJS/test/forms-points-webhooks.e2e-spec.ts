import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { createTestApp, registerUser, loginAs, authHeader } from './helpers';
import { UserRole } from '../src/common/entities/user.entity';

/**
 * e2e coverage for previously untested modules:
 *  - PL-10 Dynamic Forms (form-builder): admin create schema → user read/submit → own + admin submission lists
 *  - GROWTH-3 Points check-in: checkin → 409 duplicate → /me overview → masked leaderboard
 *  - PL-14 Webhook subscriptions: create → list (no secret) → test delivery → delete
 *  - G-1 In-app feedback: submit → notify admins
 */
describe('Forms / Points / Webhooks / Feedback (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let userToken: string;
  let otherToken: string;
  let adminToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    ds = app.get(DataSource);

    // 普通用户 A（本人）
    const user = await registerUser(app, {
      username: 'frm_user_a',
      email: 'frm_a@test.com',
      password: 'FrmPass1',
      nickname: 'PointsUser',
    });
    userToken = user.accessToken;

    // 普通用户 B（他人，用于所有权校验）
    const other = await registerUser(app, {
      username: 'frm_user_b',
      email: 'frm_b@test.com',
      password: 'FrmPass2',
      nickname: 'OtherUser',
    });
    otherToken = other.accessToken;

    // 管理员：改 DB role 后重新登录拿 admin token（与 app.e2e-spec.ts 一致）
    const admin = await registerUser(app, {
      username: 'frm_admin',
      email: 'frm_admin@test.com',
      password: 'AdminPass1',
      nickname: 'FormsAdmin',
    });
    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set(authHeader(admin.accessToken))
      .expect(200);
    await ds.getRepository('users').update(me.body.data.id, { role: UserRole.ADMIN });
    adminToken = (await loginAs(app, 'frm_admin', 'AdminPass1')).accessToken;
  });

  afterAll(async () => {
    await app.close();
  }, 90000);

  // ── PL-10 动态表单 ──
  describe('Dynamic Forms (PL-10)', () => {
    const slug = 'event-registration';
    let schemaId: number;

    const schemaPayload = {
      title: '活动报名',
      fields: [
        { key: 'name', label: '姓名', type: 'text', required: true },
        { key: 'email', label: '邮箱', type: 'email', required: false },
        { key: 'level', label: '档位', type: 'select', options: ['标准', 'VIP'], required: false },
      ],
    };

    it('未认证读取表单 → 401', async () => {
      await request(app.getHttpServer()).get(`/api/v1/forms/${slug}`).expect(401);
    });

    it('非管理员创建表单 → 403', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/admin/forms')
        .set(authHeader(userToken))
        .send({ title: '越权', slug: 'forbidden-form', schema: schemaPayload })
        .expect(403);
    });

    it('管理员创建表单定义 → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/admin/forms')
        .set(authHeader(adminToken))
        .send({ title: '活动报名', slug, schema: schemaPayload, description: '线下活动报名表' })
        .expect(201);
      schemaId = res.body.data.id;
      expect(res.body.data.slug).toBe(slug);
      expect(res.body.data.title).toBe('活动报名');
    });

    it('普通用户按 slug 读取表单定义', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/forms/${slug}`)
        .set(authHeader(userToken))
        .expect(200);
      expect(res.body.data.id).toBe(schemaId);
      expect(res.body.data.schema.fields).toHaveLength(3);
      expect(res.body.data.schema.fields[0]).toMatchObject({ key: 'name', type: 'text', required: true });
    });

    it('不存在的 slug → 404', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/forms/no-such-slug')
        .set(authHeader(userToken))
        .expect(404);
    });

    it('用户提交表单数据 → 200，返回提交 id', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/forms/${slug}/submit`)
        .set(authHeader(userToken))
        .send({ name: '张三', email: 'zhang@example.com' })
        .expect(200);
      expect(res.body.data.id).toBeGreaterThan(0);
      expect(res.body.data.submittedAt).toBeDefined();
    });

    it('必填缺失 → 400 校验失败', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/forms/${slug}/submit`)
        .set(authHeader(userToken))
        .send({})
        .expect(400);
      // AllExceptionsFilter 只透传 message（errors 数组不入响应体，仅入日志）
      expect(res.body.message).toBe('表单校验失败');
      expect(res.body.data).toBeNull();
    });

    it('非法枚举（select 选项外）→ 400', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/forms/${slug}/submit`)
        .set(authHeader(userToken))
        .send({ name: '李四', level: '不存在的档位' })
        .expect(400);
    });

    it('用户查看自己的提交记录', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/forms/${slug}/submissions`)
        .set(authHeader(userToken))
        .expect(200);
      expect(res.body.data.total).toBeGreaterThanOrEqual(1);
      expect(res.body.data.items[0]).toMatchObject({ data: { name: '张三' } });
    });

    it('管理员查看全部提交（含 userId）', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/forms/${schemaId}/submissions`)
        .set(authHeader(adminToken))
        .expect(200);
      expect(res.body.data.total).toBeGreaterThanOrEqual(1);
      expect(res.body.data.items[0].userId).toBeDefined();
      expect(res.body.data.items[0].data).toHaveProperty('name');
    });

    it('管理员列出表单定义', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/forms')
        .set(authHeader(adminToken))
        .expect(200);
      expect(res.body.data.total).toBeGreaterThanOrEqual(1);
      expect(res.body.data.items.map((f: { slug: string }) => f.slug)).toContain(slug);
    });

    it('管理员删除表单定义 → 级联删除提交', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/admin/forms/${schemaId}`)
        .set(authHeader(adminToken))
        .expect(200);
      expect(res.body.data).toEqual({ deleted: true });
      // 删除后读取 → 404
      await request(app.getHttpServer())
        .get(`/api/v1/forms/${slug}`)
        .set(authHeader(userToken))
        .expect(404);
    });
  });

  // ── GROWTH-3 积分签到 ──
  describe('Points check-in (GROWTH-3)', () => {
    it('未签到前 /points/me 显示 0 积分未签到', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/points/me')
        .set(authHeader(userToken))
        .expect(200);
      expect(res.body.data).toMatchObject({ balance: 0, todayCheckedIn: false, streak: 0 });
    });

    it('签到 → 201，返回积分/余额/连签', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/points/checkin')
        .set(authHeader(userToken))
        .expect(201);
      expect(res.body.data.points).toBeGreaterThanOrEqual(10);
      expect(res.body.data.balance).toBeGreaterThanOrEqual(10);
      expect(res.body.data.streak).toBe(1);
    });

    it('当天重复签到 → 409', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/points/checkin')
        .set(authHeader(userToken))
        .expect(409);
      expect(res.body.message).toBe('今天已签到');
    });

    it('签到后 /points/me 反映已签到', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/points/me')
        .set(authHeader(userToken))
        .expect(200);
      expect(res.body.data.todayCheckedIn).toBe(true);
      expect(res.body.data.streak).toBe(1);
      expect(res.body.data.balance).toBeGreaterThanOrEqual(10);
    });

    it('排行榜脱敏返回：仅昵称/头像/积分，不含 userId', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/points/leaderboard')
        .set(authHeader(userToken))
        .expect(200);
      const rows = res.body.data as Array<Record<string, unknown>>;
      expect(Array.isArray(rows)).toBe(true);
      const mine = rows.find((r) => r.nickname === 'PointsUser');
      expect(mine).toBeDefined();
      expect(Number((mine as Record<string, unknown>).points)).toBeGreaterThanOrEqual(10);
      for (const row of rows) {
        expect(row).not.toHaveProperty('userId');
        expect(row).toHaveProperty('points');
        expect(row).toHaveProperty('nickname');
      }
    });
  });

  // ── PL-14 Webhook 订阅 ──
  describe('Webhooks (PL-14)', () => {
    let webhookId: number;

    it('创建订阅 → 201，响应不含 secret', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/webhooks')
        .set(authHeader(userToken))
        .send({ name: '事件回调', url: 'http://127.0.0.1:9/keelbase-hook', events: ['feedback.created', 'todo.created'] })
        .expect(201);
      webhookId = res.body.data.id;
      expect(res.body.data.name).toBe('事件回调');
      expect(res.body.data.events).toEqual(['feedback.created', 'todo.created']);
      expect(res.body.data.enabled).toBe(true);
      expect(res.body.data).not.toHaveProperty('secret');
    });

    it('非法 URL → 400', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/webhooks')
        .set(authHeader(userToken))
        .send({ name: '坏链接', url: 'not-a-url', events: [] })
        .expect(400);
    });

    it('列表返回本人订阅且不含 secret', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/webhooks')
        .set(authHeader(userToken))
        .expect(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      const mine = res.body.data.find((w: { id: number }) => w.id === webhookId);
      expect(mine).toBeDefined();
      expect(mine).not.toHaveProperty('secret');
    });

    it('他人列表看不到我的订阅', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/webhooks')
        .set(authHeader(otherToken))
        .expect(200);
      const mine = res.body.data.find((w: { id: number }) => w.id === webhookId);
      expect(mine).toBeUndefined();
    });

    it('测试投递 → 201（URL 不可达 → delivered:false + 签名）', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/webhooks/test/${webhookId}`)
        .set(authHeader(userToken))
        .expect(201);
      expect(res.body.data.delivered).toBe(false);
      expect(res.body.data.signature).toBeDefined();
      expect(res.body.data.error).toBeDefined();
    });

    it('停用订阅 → PATCH 返回 enabled=false', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/webhooks/${webhookId}`)
        .set(authHeader(userToken))
        .send({ enabled: false })
        .expect(200);
      expect(res.body.data.enabled).toBe(false);
    });

    it('他人删除我的订阅 → removed:false（本人权限隔离）', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/webhooks/${webhookId}`)
        .set(authHeader(otherToken))
        .expect(200);
      expect(res.body.data).toEqual({ removed: false });
    });

    it('本人删除订阅 → removed:true', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/webhooks/${webhookId}`)
        .set(authHeader(userToken))
        .expect(200);
      expect(res.body.data).toEqual({ removed: true });
      // 删除后列表为空
      const list = await request(app.getHttpServer())
        .get('/api/v1/webhooks')
        .set(authHeader(userToken))
        .expect(200);
      expect(list.body.data.find((w: { id: number }) => w.id === webhookId)).toBeUndefined();
    });
  });

  // ── G-1 应用内反馈 ──
  describe('Feedback (G-1)', () => {
    it('提交反馈 → 200，通知到管理员', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/feedback')
        .set(authHeader(userToken))
        .send({ type: 'suggestion', content: '希望增加夜间模式', contact: 'user@test.com' })
        .expect(200);
      expect(res.body.data.received).toBe(true);
      // beforeAll 创建了 1 个 admin → 至少通知 1 位管理员
      expect(res.body.data.notifiedAdmins).toBeGreaterThanOrEqual(1);
    });

    it('非法反馈类型 → 400', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/feedback')
        .set(authHeader(userToken))
        .send({ type: 'not-a-type', content: 'x' })
        .expect(400);
    });
  });
});
