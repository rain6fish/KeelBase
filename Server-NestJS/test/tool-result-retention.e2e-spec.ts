// SPDX-License-Identifier: Apache-2.0

/**
 * 0-B retention end to end: the body kept behind a `tool_call` row is readable through the API by
 * whoever may read audit rows, and **only** by them. The rows are paired so each assertion has a
 * negative twin: an admin reads another user's body, a plain user is refused, an auditor reaches
 * their own row but not someone else's, an expired body answers with a tombstone instead of text, and
 * a call that retained nothing is a 404 rather than an empty body.
 *
 * 0-B 留存的端到端：`tool_call` 行背后的正文，有审计读权的人读得到，**且只有**他们读得到。每个断言
 * 都配一条反向：管理员能读别人的正文、普通用户被拒、审计读者读得到自己的行但读不到别人的、过期正文
 * 答墓碑而不是文本、从未留存的行是 404 而不是空正文。
 */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp, registerUser, loginAs, authHeader } from './helpers';

describe('0-B tool-result retention (off-chain body)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let admin: { token: string; id: number };
  let auditor: { token: string; id: number };
  let user: { token: string; id: number };

  const password = 'RetainPass123';
  const MASKED = '[REDACTED]';

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
    await ds.getRepository('users').update(id, { role });
    const relogin = await loginAs(app, username, password);
    return { token: relogin.accessToken, id };
  }

  async function insertAuditRow(userId: number, action = 'tool_call'): Promise<number> {
    const repo = ds.getRepository('ai_audit_logs');
    const saved = await repo.save({
      userId: String(userId),
      action,
      detail: 'query_customers({})',
      isError: false,
      tool: 'query_customers',
      outcome: 'executed',
    });
    return (saved as unknown as { id: number }).id;
  }

  async function insertBody(
    auditRowId: number,
    userId: number,
    overrides: Record<string, unknown> = {},
  ): Promise<void> {
    await ds.getRepository('ai_tool_result_bodies').save({
      auditRowId,
      userId: String(userId),
      toolName: 'query_customers',
      outcome: 'executed',
      bodyState: 'stored',
      bodyText: '{"success":true,"data":{"email":"[REDACTED]"}}',
      bodyBytes: 48,
      storedBytes: 48,
      bodySha256: 'b'.repeat(64),
      originalSha256: 'a'.repeat(64),
      modelText: '{"success":true,"data":{"email":"[REDACTED]"}}',
      modelChars: 48,
      modelSha256: 'c'.repeat(64),
      wasTruncated: true,
      expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
      ...overrides,
    });
  }

  beforeAll(async () => {
    app = await createTestApp();
    await app.init();
    ds = app.get(DataSource);

    admin = await makeUser('retain_admin', 'admin');
    auditor = await makeUser('retain_auditor', 'auditor');
    user = await makeUser('retain_user');
  });

  afterAll(async () => {
    await app.close();
  });

  it('管理员读得到别人的正文；正文已脱敏、模型实收那份也在', async () => {
    const rowId = await insertAuditRow(user.id);
    await insertBody(rowId, user.id);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/audit/logs/${rowId}/tool-result`)
      .set(authHeader(admin.token))
      .expect(200);

    expect(res.body.data).toMatchObject({
      auditRowId: rowId,
      toolName: 'query_customers',
      bodyState: 'stored',
      wasTruncated: true,
      modelText: expect.stringContaining(MASKED),
    });
    expect(res.body.data.body).toContain(MASKED);
    expect(res.body.data.body).not.toContain('alice@example.com');
    expect(res.body.data.bodySha256).toHaveLength(64);
    expect(res.body.data.expiresAt).toBeTruthy();
  });

  it('普通用户没有 read AuditLog → 403', async () => {
    const rowId = await insertAuditRow(user.id);
    await insertBody(rowId, user.id);
    await request(app.getHttpServer())
      .get(`/api/v1/audit/logs/${rowId}/tool-result`)
      .set(authHeader(user.token))
      .expect(403);
  });

  it('审计读者读得到自己范围内的行，读不到别人的行（同为 404）', async () => {
    const ownRow = await insertAuditRow(auditor.id);
    await insertBody(ownRow, auditor.id);
    const otherRow = await insertAuditRow(user.id);
    await insertBody(otherRow, user.id);

    await request(app.getHttpServer())
      .get(`/api/v1/audit/logs/${ownRow}/tool-result`)
      .set(authHeader(auditor.token))
      .expect(200);

    await request(app.getHttpServer())
      .get(`/api/v1/audit/logs/${otherRow}/tool-result`)
      .set(authHeader(auditor.token))
      .expect(404);
  });

  it('过期正文：200 + bodyState=expired + 文本为空，哈希与大小仍在', async () => {
    const rowId = await insertAuditRow(user.id);
    await insertBody(rowId, user.id, {
      bodyState: 'expired',
      bodyText: null,
      modelText: null,
      storedBytes: null,
      bodySha256: 'd'.repeat(64),
      expiresAt: new Date(Date.now() - 1000),
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/audit/logs/${rowId}/tool-result`)
      .set(authHeader(admin.token))
      .expect(200);

    expect(res.body.data.bodyState).toBe('expired');
    expect(res.body.data.body).toBeNull();
    expect(res.body.data.modelText).toBeNull();
    expect(res.body.data.bodySha256).toHaveLength(64);
    expect(res.body.data.bodyBytes).toBe(48);
  });

  it('未留存正文 → 404；非工具行 → 404', async () => {
    const noBody = await insertAuditRow(user.id);
    await request(app.getHttpServer())
      .get(`/api/v1/audit/logs/${noBody}/tool-result`)
      .set(authHeader(admin.token))
      .expect(404);

    const chatRow = await insertAuditRow(user.id, 'chat');
    await insertBody(chatRow, user.id);
    await request(app.getHttpServer())
      .get(`/api/v1/audit/logs/${chatRow}/tool-result`)
      .set(authHeader(admin.token))
      .expect(404);
  });
});
