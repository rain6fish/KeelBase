// SPDX-License-Identifier: Apache-2.0

/**
 * GA 待我确认中心 e2e（docs/ai-action-center.spec.md §5.4）。
 *
 * 覆盖的场景是「用户离开对话之后」：AI 发起写操作时他在别处，事后回到工作台仍能看到这条待确认，
 * 并**在对话之外**裁决——批准的话工具**真的执行**、副作用真的登记，且重复裁决绝不二次执行。
 *
 * 造数走 `ConfirmationStore.create`（与对话流发起确认是同一个入口），但**不去点它**——
 * 这正是要覆盖的形态；对话内确认路径由既有套件覆盖，本文件不重复。
 */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, registerUser, authHeader } from './helpers';
import { ConfirmationStore } from '../src/ai/confirmation/confirmation.store';

describe('GA 待我确认中心（离线裁决）', () => {
  let app: INestApplication;
  let userA: { accessToken: string };
  let userB: { accessToken: string };
  let store: ConfirmationStore;

  beforeAll(async () => {
    app = await createTestApp();
    userA = await registerUser(app, {
      username: 'ga_owner',
      email: 'ga_owner@test.dev',
      password: 'Passw0rd!a',
      nickname: 'GA Owner',
    });
    userB = await registerUser(app, {
      username: 'ga_other',
      email: 'ga_other@test.dev',
      password: 'Passw0rd!b',
      nickname: 'GA Other',
    });
    store = app.get(ConfirmationStore);
  });

  afterAll(async () => {
    await app.close();
  });

  /** 造一条「已发起但没人点」的 R3 确认（与对话流同一入口），返回 token。 */
  async function seedPending(user: { accessToken: string }, title: string): Promise<string> {
    const me = await request(app.getHttpServer()).get('/api/v1/auth/me').set(authHeader(user.accessToken)).expect(200);
    const created = await store.create(String(me.body.data.id), 'create_todo', { title });
    return created.token;
  }

  const listPending = async (user: { accessToken: string }): Promise<Array<Record<string, unknown>>> => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/ai/my/confirmations?status=pending')
      .set(authHeader(user.accessToken))
      .expect(200);
    return res.body.data as Array<Record<string, unknown>>;
  };

  const todoTitles = async (user: { accessToken: string }): Promise<string[]> => {
    const res = await request(app.getHttpServer()).get('/api/v1/todos').set(authHeader(user.accessToken)).expect(200);
    const body = res.body.data;
    const rows = (Array.isArray(body) ? body : (body?.items ?? [])) as Array<{ title?: string }>;
    return rows.map((r) => r.title ?? '');
  };

  it('① 本人可见待确认（含离线窗口截止），离线批准 → 工具真执行 + 落库', async () => {
    const title = `GA 离线裁决 ${Date.now()}`;
    const token = await seedPending(userA, title);

    const items = await listPending(userA);
    const item = items.find((i) => i.token === token);
    expect(item).toBeDefined();
    expect(item).toMatchObject({ mode: 'immediate', status: 'pending', toolName: 'create_todo' });
    expect(typeof item!.expiresAt).toBe('string');

    const decided = await request(app.getHttpServer())
      .post(`/api/v1/ai/my/confirmations/${token}/decide`)
      .set(authHeader(userA.accessToken))
      .send({ decision: 'approve' })
      .expect(200);
    expect(decided.body.data).toMatchObject({ ok: true, success: true });

    // 端到端证据：不是只看返回值，而是业务对象真的出现了
    expect(await todoTitles(userA)).toContain(title);

    // 已不再待确认
    expect((await listPending(userA)).map((i) => i.token)).not.toContain(token);
  });

  it('② 幂等：重复裁决 → 404，且**绝不**二次执行', async () => {
    const title = `GA 重复裁决 ${Date.now()}`;
    const token = await seedPending(userA, title);

    await request(app.getHttpServer())
      .post(`/api/v1/ai/my/confirmations/${token}/decide`)
      .set(authHeader(userA.accessToken))
      .send({ decision: 'approve' })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/api/v1/ai/my/confirmations/${token}/decide`)
      .set(authHeader(userA.accessToken))
      .send({ decision: 'approve' })
      .expect(404);

    expect((await todoTitles(userA)).filter((t) => t === title)).toHaveLength(1);
  });

  it('③ 越权：他人 token → 404，且状态不变（本人仍可裁决）', async () => {
    const title = `GA 越权 ${Date.now()}`;
    const token = await seedPending(userA, title);

    await request(app.getHttpServer())
      .post(`/api/v1/ai/my/confirmations/${token}/decide`)
      .set(authHeader(userB.accessToken))
      .send({ decision: 'approve' })
      .expect(404);

    // 越权未生效：仍是本A 的待确认，也未被 B 执行
    expect((await listPending(userA)).map((i) => i.token)).toContain(token);
    expect(await todoTitles(userB)).not.toContain(title);
  });

  it('④ 拒绝：decline → 转 declined，工具不执行', async () => {
    const title = `GA 拒绝 ${Date.now()}`;
    const token = await seedPending(userA, title);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/ai/my/confirmations/${token}/decide`)
      .set(authHeader(userA.accessToken))
      .send({ decision: 'decline' })
      .expect(200);
    expect(res.body.data).toMatchObject({ ok: true });

    expect(await todoTitles(userA)).not.toContain(title);
  });

  it('⑤ 本人列表不看他人：B 的确认不出现在 A 的列表里', async () => {
    const title = `GA 隔离 ${Date.now()}`;
    const tokenB = await seedPending(userB, title);

    expect((await listPending(userA)).map((i) => i.token)).not.toContain(tokenB);
    expect((await listPending(userB)).map((i) => i.token)).toContain(tokenB);
  });
});
