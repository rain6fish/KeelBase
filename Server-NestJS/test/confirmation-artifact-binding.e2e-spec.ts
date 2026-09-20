// SPDX-License-Identifier: Apache-2.0

/**
 * 确认凭证的**绑定**性质（外部评审提出的对抗组合）。
 *
 * 外部评审给的四组攻击，现有覆盖已吃掉两组，本文件**只补没覆盖的两种**，不重复：
 *
 * | 组合 | 现状 |
 * |---|---|
 * | ① approve(资源 A) → 复用到资源 B | **本文件**：裁决请求体改写 → 拒 |
 * | ② approve(值 X) → 改成会改变语义的值 | **本文件**：同上（同一绑定性质） |
 * | ③ 过期 approval → 应拒 | **本文件**：离线窗口外裁决 → 404 且无副作用 |
 * | ④ Agent-A 批准 → Agent-B 重放 | 已覆盖：`my-confirmations.e2e-spec.ts` ③（越权 404）+ ②（幂等，绝不二次执行）；委托链路见 `agent-delegation-attribution.e2e-spec.ts` |
 *
 * **实测发现的防御是两层的**（这一点原以为只有一层，被测试纠正）：
 *   1. **结构层**——`ConfirmDecisionDto` 只有 `decision` / `trustTool`，**根本没有**能指认另一个凭证的字段；
 *   2. **强制层**——全局 `ValidationPipe{ whitelist, forbidNonWhitelisted }` 让**多带字段直接 400**，
 *      而不是静默忽略。故「另传 args / toolName」这种攻击**到不了绑定逻辑**就被拒。
 *
 * **为什么写在 e2e 而不是单测**：这两组攻击的落点是**请求体**。单测层面「调用方改不了参数」是结构性事实，
 * 断言它等于空转（本仓 JV-14 的教训）。只有在真实 HTTP 上带着篡改过的 body 打过去，断言才有内容。
 */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, registerUser, authHeader } from './helpers';
import { ConfirmationStore } from '../src/ai/confirmation/confirmation.store';

describe('确认凭证绑定（外部评审对抗组合）', () => {
  let app: INestApplication;
  let userA: { accessToken: string };
  let store: ConfirmationStore;

  beforeAll(async () => {
    app = await createTestApp();
    userA = await registerUser(app, {
      username: 'bind_owner',
      email: 'bind_owner@test.dev',
      password: 'Passw0rd!a',
      nickname: 'Bind Owner',
    });
    store = app.get(ConfirmationStore);
  });

  afterAll(async () => {
    await app.close();
  });

  /** 造一条「已发起但没人点」的 R3 确认（与对话流同一入口）。 */
  async function seedPending(user: { accessToken: string }, title: string): Promise<string> {
    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set(authHeader(user.accessToken))
      .expect(200);
    const created = await store.create(String(me.body.data.id), 'create_todo', { title });
    return created.token;
  }

  const todoTitles = async (user: { accessToken: string }): Promise<string[]> => {
    const res = await request(app.getHttpServer()).get('/api/v1/todos').set(authHeader(user.accessToken)).expect(200);
    const body = res.body.data;
    const rows = (Array.isArray(body) ? body : (body?.items ?? [])) as Array<{ title?: string }>;
    return rows.map((r) => r.title ?? '');
  };

  const decide = (token: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post(`/api/v1/ai/my/confirmations/${token}/decide`)
      .set(authHeader(userA.accessToken))
      .send(body);

  it('① 凭证改写：裁决请求里另带 args / toolName → **被拒**，且凭证仍只执行自己那组', async () => {
    const bound = `BOUND-${Date.now()}`;
    const tampered = `TAMPERED-${Date.now()}`;
    const token = await seedPending(userA, bound);

    // 攻击形态：带着**另一个** title 与**另一个** toolName 去批准 → 多带字段即 400，攻击到不了绑定逻辑
    await decide(token, {
      decision: 'approve',
      args: { title: tampered },
      toolName: 'delete_customer',
    }).expect(400);

    // 攻击被拒后，凭证本身没坏：正常批准仍执行**发起时存下的**那组
    await decide(token, { decision: 'approve' }).expect(200);
    const titles = await todoTitles(userA);
    expect(titles).toContain(bound);
    expect(titles).not.toContain(tampered);
  });

  it('② 凭证不串号：对 A 的改写尝试，不得影响另一条待确认 B', async () => {
    const first = `BIND-FIRST-${Date.now()}`;
    const second = `BIND-SECOND-${Date.now()}`;
    const tokenA = await seedPending(userA, first);
    const tokenB = await seedPending(userA, second);

    await decide(tokenA, { decision: 'approve', args: { title: 'HIJACK' }, toolName: 'delete_customer' }).expect(400);

    // 两条各自正常裁决 → 两个业务对象各自出现，说明没有互相顶替
    await decide(tokenA, { decision: 'approve' }).expect(200);
    await decide(tokenB, { decision: 'approve' }).expect(200);

    const titles = await todoTitles(userA);
    expect(titles).toContain(first);
    expect(titles).toContain(second);
    expect(titles).not.toContain('HIJACK');
  });

  it('③ 过期裁决：离线窗口外 → 拒，且**业务对象一个都没产生**', async () => {
    const title = `EXPIRED-${Date.now()}`;
    const token = await seedPending(userA, title);

    // 把待确认行按离线窗口判 timeout（offlineTtlMs=0 → 所有早于此刻的行）
    const expired = await store.expireStale(0);
    expect(expired).toBeGreaterThan(0);

    await decide(token, { decision: 'approve' }).expect(404);
    expect(await todoTitles(userA)).not.toContain(title);
  });
});
