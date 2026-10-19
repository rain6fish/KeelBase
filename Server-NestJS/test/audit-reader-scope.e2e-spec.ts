// SPDX-License-Identifier: Apache-2.0

/**
 * AW-2, the two remaining halves, against a real DI container and a real database:
 *  ① **field whitelist** — an audit reader's row is rebuilt from `AUDIT_READER_ROW_FIELDS`; columns
 *     outside it are absent from the wire even though they are present in the database.
 *  ② **organisation / period scope** — an audit reader's rows are narrowed to their account's
 *     organisation, and to the requested window. Admin keeps the full row and every organisation.
 *
 * Both run as reverse pairs: the in-scope row **is** visible, the out-of-scope row **is not**.
 *
 * AW-2 余下的两半，在真实 DI 容器与真实库上验证：
 *  ① **字段白名单** —— 审计读者的行由 `AUDIT_READER_ROW_FIELDS` 重建；清单外的列即使库里存在，
 *     也不出现在线上响应里。
 *  ② **组织 / 期间范围** —— 审计读者的行收窄到账号所属组织与请求窗口；管理员保留整行与全部组织。
 *
 * 两条都成对跑反向断言：范围内的行**看得到**，范围外的行**看不到**。
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
});
