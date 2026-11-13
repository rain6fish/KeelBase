// SPDX-License-Identifier: Apache-2.0

/**
 * U1 against a real DI container and a real database: search by business object + closed period,
 * and export the six answers.
 *
 * The acceptance is the minute's own:
 *   - an `audit_reader` fills only "Customer #9005 + a period" and gets **every** linked row;
 *   - the export has **six columns** and **zero internal names**;
 *   - a query with no match says "no match" in words;
 *   - `common` (a plain user) gets **403** on export.
 *
 * The object is reached the only identity-based way: effect → claim → audit row. A blocked row that
 * never produced a claim is still in the period, and its Object cell answers "Not recorded" — the
 * answer the minute recorded for exactly that case.
 *
 * U1 在真实 DI 容器与真实库上：按业务对象 + 闭合期间检索，并导出六问。
 *
 * 验收就是纪要自己的那几条：审计读者只填「客户 #9005 + 时间区间」即得**全部**相连的行；导出**六列**且
 * **0 处内部名**；无匹配用话说「无匹配」；`common`（普通用户）导出 **403**。
 *
 * 对象只按唯一按身份搭的那条路到达：副作用 → 占位行 → 审计行。一笔从未产生占位行的被拦动作仍在期间
 * 内，其「对象」列答「未记录」—— 正是纪要为这一格记下的答案。
 */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp, registerUser, loginAs, authHeader } from './helpers';
import { scanForInternalNames } from './answer-vocabulary-scan';

interface AnswerMatrix {
  headers: string[];
  rows: string[][];
  match: {
    objectType: string | null;
    objectId: number | null;
    since: string | null;
    until: string | null;
    count: number;
    found: boolean;
    truncated: boolean;
    statement: string;
  };
}

describe('U1: search by business object + export the six answers', () => {
  let app: INestApplication;
  let ds: DataSource;
  let auditor: { token: string; id: number };
  let admin: { token: string; id: number };
  let userA: { token: string; id: number };

  const password = 'AudPass123';
  const SINCE = '2026-11-05T10:00:00Z';
  const UNTIL = '2026-11-05T11:00:00Z';

  let inObjectId: number;
  let secondApprovalId: number;
  let otherObjectId: number;
  let outOfPeriodId: number;
  let blockedNoClaimId: number;

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

  async function insertAuditRow(opts: {
    userId: number;
    username: string;
    createdAt: Date;
    tool: string;
    outcome: string;
    isError?: boolean;
    authorization?: string | null;
    action?: string;
    conversationId?: string;
  }): Promise<number> {
    const repo = ds.getRepository('ai_audit_logs');
    const saved = await repo.save({
      userId: String(opts.userId),
      username: opts.username,
      action: opts.action ?? 'tool_call',
      tool: opts.tool,
      outcome: opts.outcome,
      detail: `${opts.tool}({})`,
      isError: opts.isError ?? false,
      authorization: opts.authorization ?? null,
      conversationId: opts.conversationId ?? `conv-${opts.username}-${opts.tool}`,
    });
    const id = (saved as unknown as { id: number }).id;
    await repo.update(id, { createdAt: opts.createdAt });
    return id;
  }

  async function insertEffect(over: {
    key: string;
    userId: number;
    tool: string;
    resultType: string;
    resultId: number;
  }): Promise<number> {
    const saved = await ds.getRepository('ai_tool_side_effects').save({
      idempotencyKey: over.key,
      userId: String(over.userId),
      conversationId: `conv-${over.key}`,
      toolName: over.tool,
      argsHash: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
      resultType: over.resultType,
      resultId: over.resultId,
    });
    return (saved as unknown as { id: number }).id;
  }

  async function insertClaim(over: {
    key: string;
    userId: number;
    tool: string;
    effectId: number;
    auditRowId: number;
    authorizationRef?: string;
  }): Promise<void> {
    await ds.getRepository('ai_write_claims').save({
      idempotencyKey: over.key,
      userId: String(over.userId),
      conversationId: `conv-${over.key}`,
      toolName: over.tool,
      argsHash: 'deadbeefdeadbeef',
      status: 'settled',
      claimedAt: new Date('2026-11-05T10:30:00Z'),
      settledAt: new Date('2026-11-05T10:30:01Z'),
      attempts: 1,
      effectId: over.effectId,
      auditRowId: over.auditRowId,
      authorizationRef: over.authorizationRef ?? null,
    });
  }

  async function insertConfirmation(over: {
    token: string;
    operatorId: number;
    approverId?: string | null;
    status: string;
    decidedAt?: Date | null;
  }): Promise<void> {
    await ds.getRepository('ai_confirmation_requests').save({
      token: over.token,
      toolName: 'create_followup_task',
      args: '{}',
      operatorId: String(over.operatorId),
      conversationId: `conv-${over.token}`,
      riskLevel: 'R4',
      status: over.status,
      approverId: over.approverId ?? null,
      decidedAt: over.decidedAt ?? null,
    });
  }

  beforeAll(async () => {
    app = await createTestApp();
    ds = app.get(DataSource);

    auditor = await makeUser('u1_auditor', 'auditor');
    admin = await makeUser('u1_admin', 'admin');
    userA = await makeUser('u1_user');

    const org = await ds
      .getRepository('organizations')
      .save({ name: `U1-ORG-${Date.now()}` });
    await ds.getRepository('org_members').save([
      { orgId: org.id, userId: auditor.id, deptId: null, role: 'member' },
      { orgId: org.id, userId: userA.id, deptId: null, role: 'member' },
    ]);

    // Customer #9005, executed and self-confirmed by the operator.
    // 客户 #9005：已执行，由操作人本人确认。
    inObjectId = await insertAuditRow({
      userId: userA.id,
      username: 'u1_user',
      createdAt: new Date('2026-11-05T10:30:00Z'),
      tool: 'create_event',
      outcome: 'executed',
    });
    const effect1 = await insertEffect({
      key: `u1-effect-${Date.now()}-1`,
      userId: userA.id,
      tool: 'create_event',
      resultType: 'crm_customer',
      resultId: 9005,
    });
    await insertClaim({
      key: `u1-claim-${Date.now()}-1`,
      userId: userA.id,
      tool: 'create_event',
      effectId: effect1,
      auditRowId: inObjectId,
      authorizationRef: 'u1-tok-self',
    });
    await insertConfirmation({
      token: 'u1-tok-self',
      operatorId: userA.id,
      status: 'approved',
      decidedAt: new Date('2026-11-05T10:30:00Z'),
    });

    // The same customer, R4-approved by a **second person** — the row whose approver name the
    // published page could not state.
    // 同一客户，由**第二个人**按 R4 批准 —— 已发布页面说不出批准人姓名的那一行。
    secondApprovalId = await insertAuditRow({
      userId: userA.id,
      username: 'u1_user',
      createdAt: new Date('2026-11-05T10:45:00Z'),
      tool: 'create_followup_task',
      outcome: 'executed',
    });
    const effect2 = await insertEffect({
      key: `u1-effect-${Date.now()}-2`,
      userId: userA.id,
      tool: 'create_followup_task',
      resultType: 'crm_customer',
      resultId: 9005,
    });
    await insertClaim({
      key: `u1-claim-${Date.now()}-2`,
      userId: userA.id,
      tool: 'create_followup_task',
      effectId: effect2,
      auditRowId: secondApprovalId,
      authorizationRef: 'u1-tok-second',
    });
    await insertConfirmation({
      token: 'u1-tok-second',
      operatorId: userA.id,
      approverId: String(admin.id),
      status: 'approved',
      decidedAt: new Date('2026-11-05T10:45:30Z'),
    });
    // The approver's own decision row, in the same conversation — the row the export now takes the
    // name from, the same derivation the single-event read face uses.
    // 批准人自己那条裁决行，同一会话 —— 导出现在从这里取姓名，与单事件读面同一条推导。
    await insertAuditRow({
      userId: admin.id,
      username: 'u1_admin',
      createdAt: new Date('2026-11-05T10:45:30Z'),
      tool: 'create_followup_task',
      outcome: 'executed',
      action: 'tool_confirmation',
      conversationId: 'conv-u1_user-create_followup_task',
    });

    // Another customer, same period — must not appear in #9005's answer.
    // 另一个客户，同一期间 —— 不得出现在 #9005 的答案里。
    otherObjectId = await insertAuditRow({
      userId: userA.id,
      username: 'u1_user',
      createdAt: new Date('2026-11-05T10:20:00Z'),
      tool: 'create_event',
      outcome: 'executed',
    });
    const effect3 = await insertEffect({
      key: `u1-effect-${Date.now()}-3`,
      userId: userA.id,
      tool: 'create_event',
      resultType: 'crm_customer',
      resultId: 9006,
    });
    await insertClaim({
      key: `u1-claim-${Date.now()}-3`,
      userId: userA.id,
      tool: 'create_event',
      effectId: effect3,
      auditRowId: otherObjectId,
    });

    // Same customer, outside the period.
    // 同一客户，期间之外。
    outOfPeriodId = await insertAuditRow({
      userId: userA.id,
      username: 'u1_user',
      createdAt: new Date('2026-11-05T12:30:00Z'),
      tool: 'create_event',
      outcome: 'executed',
    });
    const effect4 = await insertEffect({
      key: `u1-effect-${Date.now()}-4`,
      userId: userA.id,
      tool: 'create_event',
      resultType: 'crm_customer',
      resultId: 9005,
    });
    await insertClaim({
      key: `u1-claim-${Date.now()}-4`,
      userId: userA.id,
      tool: 'create_event',
      effectId: effect4,
      auditRowId: outOfPeriodId,
    });

    // A blocked delete: in the period, no claim, so the object index cannot reach it. Its Object
    // cell must say «Not recorded» — never a guess, never the raw tool name.
    // 一次被拦下的删除：在期间内，没有占位行，故对象索引够不到它。它的「对象」列必须写「未记录」
    // —— 不猜，也不写原始工具名。
    blockedNoClaimId = await insertAuditRow({
      userId: userA.id,
      username: 'u1_user',
      createdAt: new Date('2026-11-05T10:10:00Z'),
      tool: 'delete_customer',
      outcome: 'blocked',
      isError: true,
      authorization: JSON.stringify([{ name: 'risk_policy', ok: false }]),
    });
  });

  afterAll(async () => {
    await app.close();
  });

  const listAs = (token: string, objectId: number) =>
    request(app.getHttpServer())
      .get(
        `/api/v1/audit/logs?objectType=crm_customer&objectId=${objectId}` +
          `&since=${SINCE}&until=${UNTIL}`,
      )
      .set(authHeader(token));

  const answersAs = (token: string, objectId: number) =>
    request(app.getHttpServer())
      .get(
        `/api/v1/audit/answers?objectType=crm_customer&objectId=${objectId}` +
          `&since=${SINCE}&until=${UNTIL}`,
      )
      .set(authHeader(token));

  const ids = (body: { data?: Array<{ id: number }> }) => (body.data ?? []).map((r) => r.id);

  it('object + period: the audit reader gets every linked row, and only those', async () => {
    const res = await listAs(auditor.token, 9005).expect(200);
    const returned = ids(res.body);
    expect(returned).toEqual(expect.arrayContaining([inObjectId, secondApprovalId]));
    expect(returned).not.toContain(otherObjectId);
    expect(returned).not.toContain(outOfPeriodId);
    expect(returned).not.toContain(blockedNoClaimId);
  });

  it('the same search without the object still finds the blocked row — the period is not lost', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/audit/logs?since=${SINCE}&until=${UNTIL}`)
      .set(authHeader(auditor.token))
      .expect(200);
    expect(ids(res.body)).toContain(blockedNoClaimId);
  });

  it('`common` gets 403 on the export', async () => {
    await answersAs(userA.token, 9005).expect(403);
  });

  it('the export has six columns and zero internal names', async () => {
    const res = await answersAs(auditor.token, 9005).expect(200);
    const matrix = res.body.data as AnswerMatrix;

    expect(matrix.headers).toEqual([
      'Time (UTC)',
      'Action',
      'Result',
      'Object',
      'Authorization',
      'Initiated by',
    ]);
    expect(matrix.rows).toHaveLength(2);
    for (const row of matrix.rows) {
      expect(row).toHaveLength(6);
      // The object is the business noun + the id the reader already holds.
      // 对象是业务名词 + 读者本来就持有的 id。
      expect(row[3]).toBe('Customer #9005');
    }
    expect(
      scanForInternalNames(matrix.rows.flat(), { allowedHumanNames: ['u1_user', 'u1_admin'] }),
    ).toEqual([]);

    // The clock is UTC and says so; a zone-less sqlite instant must not shift by the machine's TZ.
    // 钟面是 UTC 且写明；无时区的 sqlite 时刻不得随机器时区漂移。
    expect(matrix.rows.map((r) => r[0]).sort()).toEqual([
      '2026-11-05 10:30:00 UTC',
      '2026-11-05 10:45:00 UTC',
    ]);

    const authorizations = matrix.rows.map((r) => r[4]).sort();
    expect(authorizations).toEqual([
      'Approved by u1_admin',
      'Confirmed by u1_user',
    ]);
    // The initiator column distinguishes the assistant from the person — the gap the minute records.
    // 发起人列区分助手与人 —— 纪要记下的那个缺口。
    for (const row of matrix.rows) {
      expect(row[5]).toBe('u1_user (through the AI assistant)');
    }
  });

  it('a query with no match says so in words', async () => {
    const res = await answersAs(auditor.token, 12345).expect(200);
    const matrix = res.body.data as AnswerMatrix;
    expect(matrix.rows).toEqual([]);
    expect(matrix.match).toMatchObject({ found: false, count: 0 });
    expect(matrix.match.statement).toBe(
      'No matching records for Customer #12345 in the selected period.',
    );
  });

  it('the blocked row answers “Not recorded” for the object, and “Rejected” for the result', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/audit/answers?since=${SINCE}&until=${UNTIL}`)
      .set(authHeader(auditor.token))
      .expect(200);
    const matrix = res.body.data as AnswerMatrix;
    const blocked = matrix.rows.find((r) => r[1] === 'Delete customer');
    expect(blocked).toBeDefined();
    expect(blocked![2]).toBe('Rejected');
    expect(blocked![3]).toBe('Not recorded');
    expect(blocked![4]).toBe('Refused (no approval recorded)');
    expect(
      scanForInternalNames(matrix.rows.flat(), { allowedHumanNames: ['u1_user', 'u1_admin'] }),
    ).toEqual([]);
  });

  it('half an object filter is a 400 — never a silently broader read', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/audit/logs?objectType=crm_customer')
      .set(authHeader(auditor.token))
      .expect(400);
  });

  it('the object picker is the export’s own vocabulary', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/audit/object-types')
      .set(authHeader(auditor.token))
      .expect(200);
    expect(res.body.data).toContainEqual({ value: 'crm_customer', label: 'Customer' });
    expect(scanForInternalNames((res.body.data as Array<{ label: string }>).map((o) => o.label)))
      .toEqual([]);

    await request(app.getHttpServer())
      .get('/api/v1/audit/object-types')
      .set(authHeader(userA.token))
      .expect(403);
  });
});
