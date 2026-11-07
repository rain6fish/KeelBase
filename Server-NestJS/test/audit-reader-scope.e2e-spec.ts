// SPDX-License-Identifier: Apache-2.0

/**
 * AW-2, the two remaining halves, against a real DI container and a real database:
 *  ① **field whitelist** — an audit reader's row is rebuilt from `AUDIT_READER_ROW_FIELDS`; columns
 *     outside it are absent from the wire even though they are present in the database.
 *  ② **organisation / period scope** — an audit reader's rows are narrowed to their account's
 *     organisation, and to the requested window. Admin keeps the full row and every organisation.
 *  ③ **aggregate surfaces** — `/audit/{stats,cost,coverage,action-report}` count only the reader's
 *     own organisation; admin still counts everything.
 *
 * All three run as reverse pairs: the in-scope row **is** visible, the out-of-scope row **is not**.
 *
 * AW-2 余下的两半，在真实 DI 容器与真实库上验证：
 *  ① **字段白名单** —— 审计读者的行由 `AUDIT_READER_ROW_FIELDS` 重建；清单外的列即使库里存在，
 *     也不出现在线上响应里。
 *  ② **组织 / 期间范围** —— 审计读者的行收窄到账号所属组织与请求窗口；管理员保留整行与全部组织。
 *  ③ **聚合面** —— `/audit/{stats,cost,coverage,action-report}` 只数读者自己的组织；管理员仍数全部。
 *
 * 三条都成对跑反向断言：范围内的行**看得到**，范围外的行**看不到**。
 */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp, registerUser, loginAs, authHeader } from './helpers';

describe('AW-2 audit reader: field whitelist + org/period scope', () => {
  let app: INestApplication;
  let ds: DataSource;
  let auditor: { token: string; id: number };
  let outsiderAuditor: { token: string; id: number };
  let admin: { token: string; id: number };
  let userA: { token: string; id: number };
  let userB: { token: string; id: number };
  let org1Id: number;
  let org2Id: number;

  const IN_PERIOD = new Date('2026-08-10T12:00:00Z');
  const OUT_OF_PERIOD = new Date('2026-07-01T12:00:00Z');
  let inScopeId: number;
  let otherOrgId: number;
  let outOfPeriodId: number;

  const password = 'AudPass123';

  async function makeUser(username: string, role?: 'auditor' | 'admin') {
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
    if (!role) return { token: reg.accessToken, id };
    // Role changes take effect in the next token, so log in again rather than reuse the old one.
    // 角色变更在下一次签发令牌时生效，故重新登录，而不是沿用旧令牌。
    await ds.getRepository('users').update(id, { role });
    const relogin = await loginAs(app, username, password);
    return { token: relogin.accessToken, id };
  }

  async function insertAuditRow(opts: {
    userId: number;
    username: string;
    createdAt: Date;
  }): Promise<number> {
    const repo = ds.getRepository('ai_audit_logs');
    const saved = await repo.save({
      userId: String(opts.userId),
      username: opts.username,
      action: 'tool_call',
      detail: 'create_todo({})',
      isError: false,
      // Attribution columns that must NOT reach an audit reader.
      // 不得到达审计读者的归因列。
      ip: '10.0.0.1',
      guestId: `guest-${opts.username}`,
      deviceId: `device-${opts.username}`,
      conversationId: `conv-${opts.username}`,
    });
    const id = (saved as unknown as { id: number }).id;
    await repo.update(id, { createdAt: opts.createdAt });
    return id;
  }

  beforeAll(async () => {
    app = await createTestApp();
    await app.init();
    ds = app.get(DataSource);

    auditor = await makeUser('aw2_auditor', 'auditor');
    outsiderAuditor = await makeUser('aw2_auditor_noorg', 'auditor');
    admin = await makeUser('aw2_admin', 'admin');
    userA = await makeUser('aw2_user_a');
    userB = await makeUser('aw2_user_b');

    const orgRepo = ds.getRepository('organizations');
    const org1 = await orgRepo.save({ name: `AW2-ORG-1-${Date.now()}` });
    const org2 = await orgRepo.save({ name: `AW2-ORG-2-${Date.now()}` });
    org1Id = org1.id;
    org2Id = org2.id;

    // The auditor and user A share org 1; user B lives in org 2; `outsiderAuditor` has no org at all.
    // 审计读者与 user A 同属组织 1；user B 在组织 2；`outsiderAuditor` 不属于任何组织。
    const members = ds.getRepository('org_members');
    await members.save([
      { orgId: org1Id, userId: auditor.id, deptId: null, role: 'member' },
      { orgId: org1Id, userId: userA.id, deptId: null, role: 'member' },
      { orgId: org2Id, userId: userB.id, deptId: null, role: 'member' },
    ]);

    inScopeId = await insertAuditRow({
      userId: userA.id,
      username: 'aw2_user_a',
      createdAt: IN_PERIOD,
    });
    otherOrgId = await insertAuditRow({
      userId: userB.id,
      username: 'aw2_user_b',
      createdAt: IN_PERIOD,
    });
    outOfPeriodId = await insertAuditRow({
      userId: userA.id,
      username: 'aw2_user_a',
      createdAt: OUT_OF_PERIOD,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  const ids = (body: { data?: Array<{ id: number }> }) =>
    (body.data ?? []).map((row) => row.id);

  it('organisation: the reader sees their own org rows and not another org’s', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/audit/logs')
      .set(authHeader(auditor.token))
      .expect(200);

    expect(ids(res.body)).toContain(inScopeId);
    expect(ids(res.body)).not.toContain(otherOrgId);
  });

  it('organisation reverse: admin still sees both orgs', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/audit/logs')
      .set(authHeader(admin.token))
      .expect(200);

    expect(ids(res.body)).toContain(inScopeId);
    expect(ids(res.body)).toContain(otherOrgId);
  });

  it('organisation cannot be widened by a request parameter', async () => {
    // Asking for org 2, which the reader does not belong to, must not return org 2's rows.
    // 请求组织 2（读者并不属于它）不得返回组织 2 的行。
    const res = await request(app.getHttpServer())
      .get(`/api/v1/audit/logs?orgId=${org2Id}`)
      .set(authHeader(auditor.token))
      .expect(200);

    expect(ids(res.body)).not.toContain(otherOrgId);
  });

  it('an auditor with no organisation falls back to their own rows only', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/audit/logs')
      .set(authHeader(outsiderAuditor.token))
      .expect(200);

    expect(ids(res.body)).not.toContain(inScopeId);
    expect(ids(res.body)).not.toContain(otherOrgId);
  });

  it('period: rows outside the requested window are not returned', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/audit/logs?since=2026-08-01T00:00:00Z&until=2026-08-31T23:59:59Z')
      .set(authHeader(auditor.token))
      .expect(200);

    expect(ids(res.body)).toContain(inScopeId);
    expect(ids(res.body)).not.toContain(outOfPeriodId);
  });

  it('period reverse: without the window, the same in-org row is visible', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/audit/logs')
      .set(authHeader(auditor.token))
      .expect(200);

    expect(ids(res.body)).toContain(outOfPeriodId);
  });

  it('field whitelist: the reader’s row has no attribution / conversation columns', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/audit/logs')
      .set(authHeader(auditor.token))
      .expect(200);

    const row = (res.body.data as Array<Record<string, unknown>>).find((r) => r.id === inScopeId);
    expect(row).toBeDefined();
    expect(row).toMatchObject({ username: 'aw2_user_a', action: 'tool_call' });
    for (const hidden of ['ip', 'guestId', 'deviceId', 'conversationId']) {
      expect(row).not.toHaveProperty(hidden);
    }
  });

  it('by-id reads are scoped too: an out-of-org row answers 404, not another org’s data', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/audit/logs/${inScopeId}/interpretation`)
      .set(authHeader(auditor.token))
      .expect(200);

    await request(app.getHttpServer())
      .get(`/api/v1/audit/logs/${otherOrgId}/interpretation`)
      .set(authHeader(auditor.token))
      .expect(404);

    // Reverse: admin reaches the same row.
    // 反向：管理员读得到同一行。
    await request(app.getHttpServer())
      .get(`/api/v1/audit/logs/${otherOrgId}/interpretation`)
      .set(authHeader(admin.token))
      .expect(200);
  });

  // ── Aggregate surfaces (AW-2, the remaining half) ─────────────────────────────────────────────
  // The four counts below are reverse pairs too: under the same data, the reader's number is the
  // org-only expectation and the admin's number is strictly larger.
  // ── 聚合面（AW-2 余下的那一半）────────────────────────────────────────────────────────────────
  // 下面四个计数同样是成对反向：同一份数据下，读者的数是「只算其组织」的预期，管理员的数严格更大。

  it('aggregate /stats: the reader counts only their own org, admin counts all', async () => {
    const readerRes = await request(app.getHttpServer())
      .get('/api/v1/audit/stats')
      .set(authHeader(auditor.token))
      .expect(200);
    const adminRes = await request(app.getHttpServer())
      .get('/api/v1/audit/stats')
      .set(authHeader(admin.token))
      .expect(200);

    // Org 1 owns `inScopeId` and `outOfPeriodId`; `otherOrgId` belongs to org 2.
    // 组织 1 拥有 `inScopeId` 与 `outOfPeriodId`；`otherOrgId` 属于组织 2。
    expect(readerRes.body.data.totalMessages).toBe(2);
    expect(adminRes.body.data.totalMessages).toBe(3);
    expect(readerRes.body.data.totalMessages).toBeLessThan(adminRes.body.data.totalMessages);
  });

  it('aggregate /cost: the reader counts only their own org, admin counts all', async () => {
    const readerRes = await request(app.getHttpServer())
      .get('/api/v1/audit/cost')
      .set(authHeader(auditor.token))
      .expect(200);
    const adminRes = await request(app.getHttpServer())
      .get('/api/v1/audit/cost')
      .set(authHeader(admin.token))
      .expect(200);

    expect(readerRes.body.data.summary.totalCalls).toBe(2);
    expect(adminRes.body.data.summary.totalCalls).toBe(3);
  });

  it('aggregate /coverage: the statement’s row counts follow the reader’s org', async () => {
    const window = 'since=2026-01-01T00:00:00Z&until=2026-12-31T23:59:59Z';
    const readerRes = await request(app.getHttpServer())
      .get(`/api/v1/audit/coverage?${window}`)
      .set(authHeader(auditor.token))
      .expect(200);
    const adminRes = await request(app.getHttpServer())
      .get(`/api/v1/audit/coverage?${window}`)
      .set(authHeader(admin.token))
      .expect(200);

    const rows = (body: { data?: { sources?: Array<{ id: string; rows: number | null }> } }) =>
      body.data?.sources?.find((s) => s.id === 'ai_audit_chain')?.rows;
    expect(rows(readerRes.body)).toBe(2);
    expect(rows(adminRes.body)).toBe(3);
  });

  it('aggregate /action-report: samples/counts come from the reader’s org only', async () => {
    const readerRes = await request(app.getHttpServer())
      .get('/api/v1/audit/action-report')
      .set(authHeader(auditor.token))
      .expect(200);
    const adminRes = await request(app.getHttpServer())
      .get('/api/v1/audit/action-report')
      .set(authHeader(admin.token))
      .expect(200);

    const sampleIds = (body: { data?: { samples?: Array<{ id: number }> } }) =>
      (body.data?.samples ?? []).map((s) => s.id);
    expect(sampleIds(readerRes.body)).toEqual(expect.arrayContaining([inScopeId, outOfPeriodId]));
    expect(sampleIds(readerRes.body)).not.toContain(otherOrgId);
    expect(sampleIds(adminRes.body)).toEqual(
      expect.arrayContaining([inScopeId, outOfPeriodId, otherOrgId]),
    );
  });

  it('aggregate fallback: an auditor with no organisation counts their own rows only', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/audit/stats')
      .set(authHeader(outsiderAuditor.token))
      .expect(200);

    expect(res.body.data.totalMessages).toBe(0);
  });

  it('field whitelist reverse: admin still receives those columns', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/audit/logs')
      .set(authHeader(admin.token))
      .expect(200);

    const row = (res.body.data as Array<Record<string, unknown>>).find((r) => r.id === inScopeId);
    expect(row).toBeDefined();
    expect(row).toMatchObject({
      ip: '10.0.0.1',
      guestId: 'guest-aw2_user_a',
      deviceId: 'device-aw2_user_a',
      conversationId: 'conv-aw2_user_a',
    });
  });

  /**
   * AW-16 against the real wire: the in-flight claim read is open to an audit reader (200) and closed
   * to an ordinary user (403), the reader's row scope is the same organisation rule as the audit log,
   * the row carries the tool name and the argument digest only, and the list is a statement about the
   * current `claimed` state — settling the claim removes it.
   *
   * AW-16 走真实 HTTP：在途占位查询对审计读者开放（200）、对普通用户关闭（403）；读者的行范围与
   * 审计日志同一套组织规则；行里只有工具名与参数摘要；清单只陈述当下的 `claimed` 状态 —— 落定后即消失。
   */
  describe('AW-16 in-flight claims read', () => {
    const claimsRepo = () => ds.getRepository('ai_write_claims');
    const makeClaim = async (userId: string, key: string): Promise<{ id: number }> => {
      const repo = claimsRepo();
      const saved = await repo.save({
        idempotencyKey: key,
        userId,
        toolName: 'send_email',
        argsHash: 'deadbeefdeadbeef',
        status: 'claimed',
        claimedAt: new Date(),
        attempts: 1,
      });
      return { id: (saved as unknown as { id: number }).id };
    };
    const readAs = (token: string) =>
      request(app.getHttpServer())
        .get('/api/v1/ai/tool-effects/claims')
        .set(authHeader(token));

    it('ordinary user 403; auditor 200 and sees their org only — tool name + args_hash, no arguments', async () => {
      const mine = await makeClaim(String(userA.id), `aw16-${Date.now()}-a`);
      const other = await makeClaim(String(userB.id), `aw16-${Date.now()}-b`);
      try {
        await readAs(userA.token).expect(403);

        const res = await readAs(auditor.token).expect(200);
        const body = res.body.data as {
          items: Array<Record<string, unknown>>;
          scope: string;
          thresholdMinutes: number;
        };
        expect(body.scope).toBe('org');
        const ids = body.items.map((r) => r.id);
        expect(ids).toContain(mine.id);
        expect(ids).not.toContain(other.id);

        const row = body.items.find((r) => r.id === mine.id)!;
        expect(row.toolName).toBe('send_email');
        expect(row.argsHash).toBe('deadbeefdeadbeef');
        expect(row.stale).toBe(false);
        // The projection's whole field set — an argument column could not hide in it.
        // 投影的完整字段集 —— 参数列无处可藏。
        expect(Object.keys(row).sort()).toEqual(
          ['ageMinutes', 'agentId', 'argsHash', 'attempts', 'authorizationRef', 'claimedAt', 'conversationId', 'decidedRole', 'decisionState', 'id', 'lastLookup', 'policyRevision', 'reconcilable', 'runId', 'stale', 'status', 'toolName', 'userId'].sort(),
        );
        // AW-17: no lookup was ever recorded ⇒ the reading is "not looked up", never "executed"; and a
        // tool with no status query is reported as **not reconcilable** rather than offered as if it were.
        // AW-17：从没查过 ⇒ 读数是「未查询」，绝不是「已执行」；没有状态查询的工具报**不可对账**，
        // 而不是装作可以。
        expect(row.lastLookup).toBeNull();
        expect(row.reconcilable).toBe(false);
      } finally {
        await claimsRepo().delete(mine.id);
        await claimsRepo().delete(other.id);
      }
    });

    it('settling the claim removes it from the list (the list is about what is still claimed)', async () => {
      const row = await makeClaim(String(userA.id), `aw16-${Date.now()}-c`);
      try {
        const before = await readAs(auditor.token).expect(200);
        expect((before.body.data.items as Array<{ id: number }>).map((r) => r.id)).toContain(row.id);

        await claimsRepo().update(row.id, { status: 'settled', settledAt: new Date() });

        const after = await readAs(auditor.token).expect(200);
        expect((after.body.data.items as Array<{ id: number }>).map((r) => r.id)).not.toContain(row.id);
      } finally {
        await claimsRepo().delete(row.id);
      }
    });

    /**
     * AW-16 F-63 on the real wire: releasing is an admin decision (the auditor reads the queue but
     * does not rule on it), the evidence is required, the conclusion stays unknown (`status` remains
     * `claimed`) and the row leaves the in-flight reading. The audit row is the record of the act.
     *
     * AW-16 F-63 走真实 HTTP：释放是管理员的决定（审计读者读队列、不裁决队列），证据必填，结论保持
     * 未知（`status` 仍是 `claimed`），行离开在途读数。审计行就是这次动作的记录。
     */
    it('release: user/auditor 403, short note 400, admin closes the hold as unknown and it leaves the list', async () => {
      const repo = claimsRepo();
      const stale = (await repo.save({
        idempotencyKey: `aw16-release-${Date.now()}`,
        userId: String(userA.id),
        toolName: 'send_email',
        argsHash: 'deadbeefdeadbeef',
        status: 'claimed',
        claimedAt: new Date(Date.now() - 90 * 60_000),
        attempts: 1,
      })) as unknown as { id: number };

      const releaseAs = (token: string, note: string) =>
        request(app.getHttpServer())
          .post(`/api/v1/ai/tool-effects/claims/${stale.id}/release`)
          .set(authHeader(token))
          .send({ note });

      try {
        await releaseAs(userA.token, 'e2e-release-user').expect(403);
        await releaseAs(auditor.token, 'e2e-release-auditor').expect(403);
        await releaseAs(admin.token, 'short').expect(400);

        const res = await releaseAs(admin.token, 'e2e: target has no record for this request').expect(200);
        expect(res.body.data).toMatchObject({
          outcome: 'released_unknown',
          status: 'claimed',
          decisionState: 'closed_unknown',
        });
        expect(res.body.data.auditRowId).toBeGreaterThan(0);

        const stored = (await repo.findOne({
          where: { id: stale.id },
        })) as unknown as { status: string; decisionState: string; releaseReason: string };
        expect(stored.status).toBe('claimed');
        expect(stored.decisionState).toBe('closed_unknown');
        expect(stored.releaseReason).toBe('manual_release_unknown');

        const auditRow = await ds.getRepository('ai_audit_logs').findOne({
          where: { action: 'claim_release' } as never,
        });
        expect(auditRow).toBeTruthy();
        expect((auditRow as unknown as { detail: string }).detail).toContain(
          'target has no record',
        );

        // 默认在途视图里消失；只有显式查「已关闭」才看得到
        const live = await readAs(admin.token).expect(200);
        expect((live.body.data.items as Array<{ id: number }>).map((r) => r.id)).not.toContain(
          stale.id,
        );
        const closed = await request(app.getHttpServer())
          .get('/api/v1/ai/tool-effects/claims?decisionState=closed_unknown')
          .set(authHeader(admin.token))
          .expect(200);
        expect((closed.body.data.items as Array<{ id: number }>).map((r) => r.id)).toContain(
          stale.id,
        );
      } finally {
        await repo.delete(stale.id);
      }
    });
  });

  /**
   * AW-17 read side, against the real wire: the lookup history (evidence that a person asked the
   * target) is readable by an audit reader and closed to an ordinary user; scope is the same
   * organisation rule as the audit log; the rows carry the conclusion and cause, never argument
   * plaintext. The in-flight list gains two **additive** readings: whether the target can be asked at
   * all, and the most recent answer — with "never asked" remaining `null`.
   *
   * AW-17 读侧，走真实 HTTP：查询历史（「有人问过目标」的证据）审计读者可读、普通用户不可读；
   * 范围与审计日志同一套组织规则；行里带结论与成因，绝无参数明文。在途清单加两个**加性**读数：
   * 目标能不能问、最近一次的答案 —— 「从没问过」保持 `null`。
   */
  describe('AW-17 target-status lookup read', () => {
    const claimsRepo = () => ds.getRepository('ai_write_claims');
    const lookupsRepo = () => ds.getRepository('ai_target_status_lookups');

    const makeClaim = async (userId: string, key: string): Promise<{ id: number }> => {
      const saved = await claimsRepo().save({
        idempotencyKey: key,
        userId,
        toolName: 'send_email',
        argsHash: 'deadbeefdeadbeef',
        status: 'claimed',
        claimedAt: new Date(),
        attempts: 1,
      });
      return { id: (saved as unknown as { id: number }).id };
    };

    const addLookup = async (key: string, userId: string, over: Record<string, unknown> = {}) =>
      lookupsRepo().save({
        idempotencyKey: key,
        toolName: 'send_email',
        lookedUpBy: String(admin.id),
        asUserId: userId,
        queryMethod: 'GET',
        queryPath: `/status/${key}`,
        conclusion: 'unknown',
        reason: 'timeout',
        ...over,
      });

    it('ordinary user 403; auditor 200 sees the in-scope claim history; another org’s claim is 404', async () => {
      const stamp = Date.now();
      const keyMine = `aw17-${stamp}-mine`;
      const keyOther = `aw17-${stamp}-other`;
      const mine = await makeClaim(String(userA.id), keyMine);
      const other = await makeClaim(String(userB.id), keyOther);
      const first = await addLookup(keyMine, String(userA.id), {
        conclusion: 'unknown',
        reason: 'non_2xx',
      });
      const second = await addLookup(keyMine, String(userA.id), {
        conclusion: 'executed',
        reason: null,
        queryPath: `/status/${keyMine}?again=1`,
      });
      // Deterministic order: the second query is the most recent one.
      // 顺序确定：第二次查询就是最近一次。
      await lookupsRepo().update(first.id, { at: new Date('2026-11-01T00:00:00Z') });
      await lookupsRepo().update(second.id, { at: new Date('2026-11-02T00:00:00Z') });

      try {
        await request(app.getHttpServer())
          .get(`/api/v1/ai/tool-effects/claims/${mine.id}/lookups`)
          .set(authHeader(userA.token))
          .expect(403);

        const res = await request(app.getHttpServer())
          .get(`/api/v1/ai/tool-effects/claims/${mine.id}/lookups`)
          .set(authHeader(auditor.token))
          .expect(200);
        const body = res.body.data as {
          claimStatus: string;
          total: number;
          items: Array<Record<string, unknown>>;
        };
        expect(body.claimStatus).toBe('claimed');
        expect(body.total).toBe(2);
        expect(body.items[0]).toMatchObject({
          conclusion: 'executed',
          reason: null,
          asUserId: String(userA.id),
          queryMethod: 'GET',
        });
        expect(body.items[1]).toMatchObject({ conclusion: 'unknown', reason: 'non_2xx' });
        // 不回显参数：这张面只有结论、成因与查询身份。
        expect(Object.keys(body.items[0]).sort()).toEqual(
          ['asUserId', 'at', 'conclusion', 'id', 'lookedUpBy', 'queryMethod', 'queryPath', 'reason'].sort(),
        );

        // 范围外的 claim：不存在于读者的范围里 —— 404，而不是 403（不泄露行的存在）。
        await request(app.getHttpServer())
          .get(`/api/v1/ai/tool-effects/claims/${other.id}/lookups`)
          .set(authHeader(auditor.token))
          .expect(404);

        // 管理员看得到任何一条。
        await request(app.getHttpServer())
          .get(`/api/v1/ai/tool-effects/claims/${other.id}/lookups`)
          .set(authHeader(admin.token))
          .expect(200);
      } finally {
        await lookupsRepo().delete({ idempotencyKey: keyMine });
        await claimsRepo().delete([mine.id, other.id]);
      }
    });

    it('在途清单：有查询记录 ⇒ 最近一次结论与成因；无记录保持 null', async () => {
      const stamp = Date.now();
      const keyAsked = `aw17-${stamp}-asked`;
      const keyNever = `aw17-${stamp}-never`;
      const asked = await makeClaim(String(userA.id), keyAsked);
      const never = await makeClaim(String(userA.id), keyNever);
      await addLookup(keyAsked, String(userA.id));

      try {
        const res = await request(app.getHttpServer())
          .get('/api/v1/ai/tool-effects/claims')
          .set(authHeader(auditor.token))
          .expect(200);
        const items = (res.body.data as { items: Array<Record<string, unknown>> }).items;
        const askedRow = items.find((r) => r.id === asked.id)!;
        const neverRow = items.find((r) => r.id === never.id)!;
        expect(askedRow.lastLookup).toMatchObject({ conclusion: 'unknown', reason: 'timeout' });
        expect(neverRow.lastLookup).toBeNull();
      } finally {
        await lookupsRepo().delete({ idempotencyKey: keyAsked });
        await claimsRepo().delete([asked.id, never.id]);
      }
    });
  });
});
