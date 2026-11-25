// SPDX-License-Identifier: Apache-2.0

/**
 * R-4 (F-69 / F-103) — the stale-view release binding, on the real wire and against a real database.
 *
 * The acceptance, in its own order: **take the view** (the review screen's frozen reading), **move the
 * row underneath it** (the hourly sweep is enough — no second person is needed), **resubmit**, and
 * assert **both** the `stale_view` refusal and the row the refusal leaves behind. The reverse reading
 * is here too: a refreshed view releases the hold, and the chain then holds one refusal row and one
 * release row.
 *
 * Why the sweep is called through the service: it is exactly what the hourly maintenance pass calls,
 * so the move the case depends on is the production move, not a fabricated SQL update. Nothing here
 * writes the ledger by hand.
 *
 * Run it alone: `npx jest --config test/jest-e2e.json test/stale-view-release.e2e-spec.ts`
 *
 * R-4（F-69 / F-103）—— 陈旧视图的释放绑定，走真实 HTTP 与真实库。
 *
 * 验收按它自己的顺序：**取视图**（复核屏幕冻结的读数）、**把行在视图之下移走**（每小时清扫就够 ——
 * 不需要第二个人）、**重新提交**，并断言 **`stale_view` 拒绝**与**拒绝留下的那一行**。反向读数也在：
 * 刷新后的视图能释放成功，此时链上是一条拒绝行加一条释放行。
 *
 * 清扫走服务调用，因为它正是每小时维护任务调用的那一处 —— 用例依赖的那次移动是生产上的移动，不是
 * 手写的 SQL。这里不手工改写账本。
 *
 * 单独跑：`npx jest --config test/jest-e2e.json test/stale-view-release.e2e-spec.ts`
 */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp, registerUser, loginAs, authHeader } from './helpers';
import { WriteClaimDecisionService } from '../src/governance-shared/services/write-claim-decision.service';

describe('R-4 stale-view release binding', () => {
  let app: INestApplication;
  let ds: DataSource;
  let admin: { token: string; id: number };

  /**
   * A tool name unique to **each case**, so both the list read and the audit-row assertions see only
   * that case's rows — the cases share one database for the whole file.
   *
   * 每个用例一个**独立的**工具名：列表读与审计行断言因此只看得到本用例的行 —— 整个文件共用一个库。
   */
  let toolName: string;
  let seq = 0;
  const password = 'R4StaleView123';

  const claimsRepo = () => ds.getRepository('ai_write_claims');
  const auditRepo = () => ds.getRepository('ai_audit_logs');

  /** A stale, releasable hold: claimed 90 minutes ago, still `open`, never asked about. */
  async function seedStaleHold(): Promise<number> {
    const saved = await claimsRepo().save({
      idempotencyKey: `r4-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      userId: String(admin.id),
      toolName,
      argsHash: '0123456789abcdef',
      status: 'claimed',
      decisionState: 'open',
      claimedAt: new Date(Date.now() - 90 * 60_000),
      attempts: 1,
    });
    return (saved as unknown as { id: number }).id;
  }

  /**
   * The review screen's read: what the operator sees when the screen opens. The view is taken from
   * **the read surface**, not rebuilt here — the same two values the console freezes.
   *
   * 复核屏幕的读：屏幕打开时操作者看到的东西。视图取自**读面**，不在这里重新拼 —— 与控制台冻结的
   * 就是同样两个值。
   */
  async function readView(claimId: number): Promise<{ decisionState: string; lastLookupId: number | null }> {
    const res = await request(app.getHttpServer())
      .get('/api/v1/ai/tool-effects/claims')
      .query({ toolName, decisionState: 'all', limit: 100 })
      .set(authHeader(admin.token))
      .expect(200);
    const row = (res.body.data.items as Array<{
      id: number;
      decisionState: string;
      lastLookup: { id: number } | null;
    }>).find((r) => r.id === claimId);
    expect(row).toBeTruthy();
    return { decisionState: row!.decisionState, lastLookupId: row!.lastLookup?.id ?? null };
  }

  const release = (claimId: number, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post(`/api/v1/ai/tool-effects/claims/${claimId}/release`)
      .set(authHeader(admin.token))
      .send(body);

  beforeAll(async () => {
    app = await createTestApp();
    await app.init();
    ds = app.get(DataSource);

    const username = `r4_admin_${Date.now()}`;
    const reg = await registerUser(app, {
      username,
      email: `${username}@test.com`,
      password,
      nickname: username,
    });
    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set(authHeader(reg.accessToken))
      .expect(200);
    const id = me.body.data.id as number;
    await ds.getRepository('users').update(id, { role: 'admin' });
    const relogin = await loginAs(app, username, password);
    admin = { token: relogin.accessToken, id };
  }, 120_000);

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    seq += 1;
    toolName = `r4-stale-view-${Date.now()}-${seq}`;
  });

  it('取视图 → 清扫把行移走 → 重交：stale_view，且拒绝本身是一行，账本不动', async () => {
    const claimId = await seedStaleHold();

    // ① 取视图：屏幕看到的是一个在途（open）的占位，从没人问过目标。
    const view = await readView(claimId);
    expect(view).toEqual({ decisionState: 'open', lastLookupId: null });

    // ② 把行在视图之下移走 —— 正是每小时维护任务做的那次搬迁。
    const swept = await app.get(WriteClaimDecisionService).sweepOverdue(60);
    expect(swept.moved).toBeGreaterThan(0);
    const moved = (await claimsRepo().findOne({ where: { id: claimId } })) as unknown as {
      status: string;
      decisionState: string;
    };
    expect(moved.status).toBe('claimed');
    expect(moved.decisionState).toBe('awaiting_decision');

    // ③ 重交同一块屏幕的视图。
    const res = await release(claimId, { note: '按屏幕上看到的在途行释放（视图已过期）', view }).expect(200);

    expect(res.body.data).toMatchObject({
      outcome: 'stale_view',
      status: 'claimed',
      decisionState: 'awaiting_decision',
    });
    expect(res.body.data.auditRowId).toBeGreaterThan(0);

    // 账本一字未动：没有释放、没有理由、处置仍是待裁。
    const after = (await claimsRepo().findOne({ where: { id: claimId } })) as unknown as {
      status: string;
      decisionState: string;
      releaseReason: string | null;
    };
    expect(after.status).toBe('claimed');
    expect(after.decisionState).toBe('awaiting_decision');
    expect(after.releaseReason ?? null).toBeNull();

    // 拒绝本身是一行：同一条 AI 审计链、同一个动作，detail 开头就说它没有释放。
    const rows = await auditRepo().find({
      where: { action: 'claim_release', tool: toolName } as never,
    });
    expect(rows).toHaveLength(1);
    const row = rows[0] as unknown as { id: number; detail: string; outcome: string | null; releaseLookups: string | null };
    expect(row.id).toBe(res.body.data.auditRowId);
    expect(row.detail).toContain('release refused (stale_view)');
    expect(row.detail).toContain('changed: decisionState');
    expect(row.detail).toContain('view: decisionState=open');
    expect(row.detail).toContain('ledger now: decisionState=awaiting_decision');
    expect(row.detail).not.toContain('→ closed_unknown');
    expect(row.outcome ?? null).toBeNull();
    // 契约：非释放行不带释放证据列。
    expect(row.releaseLookups ?? null).toBeNull();
  });

  it('刷新后的视图与账本一致 ⇒ 释放成功（一行拒绝 + 一行释放）', async () => {
    const claimId = await seedStaleHold();
    const staleView = await readView(claimId);
    await app.get(WriteClaimDecisionService).sweepOverdue(60);

    const refused = await release(claimId, { note: '第一次提交用的是过期视图', view: staleView }).expect(200);
    expect(refused.body.data.outcome).toBe('stale_view');

    // 屏幕刷新后读到的就是账本现在的处置。
    const freshView = await readView(claimId);
    expect(freshView.decisionState).toBe('awaiting_decision');

    const released = await release(claimId, { note: '刷新之后用新的视图再次提交', view: freshView }).expect(200);
    expect(released.body.data.outcome).toBe('released_unknown');

    const rows = (await auditRepo().find({
      where: { action: 'claim_release', tool: toolName } as never,
      order: { id: 'ASC' },
    })) as unknown as Array<{ detail: string }>;
    expect(rows).toHaveLength(2);
    expect(rows[0].detail).toContain('release refused (stale_view)');
    expect(rows[1].detail).toContain('→ closed_unknown');
  });

  it('视图必填：缺席的视图是 400，不是「不检查」的静默默认', async () => {
    const claimId = await seedStaleHold();
    await release(claimId, { note: '没有带视图的释放请求' }).expect(400);
    // 什么都没写：既没有释放行，也没有拒绝行。
    expect(
      await auditRepo().count({ where: { action: 'claim_release', tool: toolName } as never }),
    ).toBe(0);
  });

  it('视图不完整（缺少 lastLookupId 键）同样是 400 —— null 必须显式给出', async () => {
    const claimId = await seedStaleHold();
    await release(claimId, {
      note: '视图只给了一半',
      view: { decisionState: 'open' },
    }).expect(400);
  });
});
