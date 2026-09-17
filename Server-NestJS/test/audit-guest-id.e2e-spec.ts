// SPDX-License-Identifier: Apache-2.0

import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { createTestApp, registerUser, loginAs, authHeader } from './helpers';
import { User, UserRole } from '../src/common/entities/user.entity';
import { OperationAuditLog } from '../src/operation-audit/operation-audit-log.entity';
import { GUEST_COOKIE } from '../src/common/guest-id';

/**
 * AU-3（§22.19 归因层）验收：演示端访客共享同一账号（alex）时，审计仍能区分不同访客。
 *
 * 契约判据（roadmap §22.19 AU-3）：**N 个访客 → 审计可见 N 个不同来源**。
 * 本套件用真实链路证明两件事：
 *   ① 无标识的请求 → 服务端签发访客标识（Set-Cookie）；已有标识 → 不重复签发；
 *   ② 两个不同访客标识的写请求 → 操作审计落**两个不同** guestId（不再塌缩成同一账号）。
 * 并守住护栏③：guestId 是**链外列**，入链 payload 里不含它（故不影响哈希链校验）。
 */
describe('AU-3 访客标识归因（§22.19）', () => {
  let app: INestApplication;
  let ds: DataSource;
  let token: string;
  let adminToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    ds = app.get(DataSource);

    const user = await registerUser(app, {
      username: 'guest_owner',
      email: 'guestowner@test.com',
      password: 'GuestOwner1',
      nickname: 'GuestOwner',
    });
    token = user.accessToken;

    await registerUser(app, {
      username: 'guest_admin',
      email: 'guestadmin@test.com',
      password: 'GuestAdmin1',
      nickname: 'GuestAdmin',
    });
    await ds.getRepository(User).update(
      (await ds.getRepository(User).findOne({ where: { username: 'guest_admin' } }))!.id,
      { role: UserRole.ADMIN },
    );
    adminToken = (await loginAs(app, 'guest_admin', 'GuestAdmin1')).accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('无标识的请求 → 服务端签发访客标识（Set-Cookie），且 cookie 为 httpOnly', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/todos')
      .set(authHeader(token))
      .send({ title: `访客签发-${Date.now()}` })
      .expect(201);

    const setCookie = (res.headers['set-cookie'] as unknown as string[] | undefined) ?? [];
    const guestCookie = setCookie.find((c) => c.startsWith(`${GUEST_COOKIE}=`));
    expect(guestCookie).toBeDefined();
    expect(guestCookie).toContain('HttpOnly');
  });

  it('请求头已带标识 → 沿用该标识，不再重复签发', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/todos')
      .set(authHeader(token))
      .set('X-Guest-Id', 'guest-e2e-keep')
      .send({ title: `访客沿用-${Date.now()}` })
      .expect(201);

    const setCookie = (res.headers['set-cookie'] as unknown as string[] | undefined) ?? [];
    expect(setCookie.some((c) => c.startsWith(`${GUEST_COOKIE}=`))).toBe(false);
  });

  it('两个不同访客 → 审计落两个不同 guestId（这正是 AU-3 要修的「身份塌缩」）', async () => {
    const marker = `/api/v1/todos`;
    await request(app.getHttpServer())
      .post(marker)
      .set(authHeader(token))
      .set('X-Guest-Id', 'guest-e2e-alice')
      .send({ title: `访客A-${Date.now()}` })
      .expect(201);
    await request(app.getHttpServer())
      .post(marker)
      .set(authHeader(token))
      .set('X-Guest-Id', 'guest-e2e-bob')
      .send({ title: `访客B-${Date.now()}` })
      .expect(201);

    // 操作审计是 tap 内异步落库 → 轮询等两行到位（最多 3s）
    const repo = ds.getRepository(OperationAuditLog);
    const deadline = Date.now() + 3000;
    let rows: OperationAuditLog[] = [];
    while (Date.now() < deadline) {
      rows = await repo.find({
        where: { path: marker },
        order: { id: 'DESC' },
        take: 2,
      });
      const ids = rows.map((r) => r.guestId);
      if (ids.includes('guest-e2e-alice') && ids.includes('guest-e2e-bob')) break;
      await new Promise((r) => setTimeout(r, 50));
    }

    const guestIds = rows.map((r) => r.guestId);
    expect(guestIds).toContain('guest-e2e-alice');
    expect(guestIds).toContain('guest-e2e-bob');
    // 同一账号（token 相同）却有两个不同访客标识 —— 归因不再塌缩
    expect(new Set(guestIds).size).toBeGreaterThan(1);
    // 两行 user_id 相同（共享账号）—— 证明区分完全来自 guestId 这一归因维度
    expect(new Set(rows.map((r) => r.userId)).size).toBe(1);
  });

  it('护栏③：guestId 是链外列——不入链 payload，哈希链仍完整', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/audit/operations/verify')
      .set(authHeader(adminToken))
      .expect(200);

    expect((res.body.data as { valid: boolean }).valid).toBe(true);
  });
});
