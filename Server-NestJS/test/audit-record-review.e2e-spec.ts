// SPDX-License-Identifier: Apache-2.0

/**
 * AW-12 against a real DI container, a real database and the real hash chain.
 *
 * The acceptance is not «there is a field» but that the whole claim is derivable and falsifiable:
 *  ① the reviewer and the cadence are **explicit configuration**, and an unassigned deployment says so;
 *  ② each receipt **is a row on the chain** — deleting it both turns its range back into unreviewed
 *     and breaks `prevHash`, and a forged receipt fails verification;
 *  ③ the unreviewed window is **computed from the chain**, and the coverage statement reports it as
 *     `unknown` instead of leaving the surface green.
 *
 * AW-12，在真实 DI 容器、真实库与真实哈希链上验证。验收不是「多了一个字段」，而是整套说法可推导、
 * 可证伪：① 复核人与频度是**显式配置**，未指派就如实说；② 回执**就是链上一行** —— 删掉它，区间变回
 * 未复核且 `prevHash` 断裂；伪造一条，校验不过；③ 未复核区间**由链算出**，覆盖声明报 `unknown`，
 * 而不是让界面保持绿色。
 */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource, IsNull, Not } from 'typeorm';
import { createTestApp, registerUser, loginAs, authHeader } from './helpers';
import { AuditService } from '../src/governance-shared/services/audit.service';
import { AuditChainService } from '../src/common/audit-chain/audit-chain.service';
import { buildPayload } from '../src/governance-core/payload';

describe('AW-12 record-level review', () => {
  let app: INestApplication;
  let ds: DataSource;
  let auditService: AuditService;
  let chain: AuditChainService;
  let admin: { token: string; id: number };

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
    await ds.getRepository('users').update(id, { role });
    const relogin = await loginAs(app, username, password);
    return { token: relogin.accessToken, id };
  }

  /** A row written through the real write path, so it carries a real `prevHash` / `hash`. */
  async function writeRow(tool: string): Promise<number> {
    const saved = await auditService.log({
      userId: String(admin.id),
      username: 'aw12_admin',
      action: 'tool_call',
      detail: `${tool}({})`,
      isError: false,
    });
    return saved.id;
  }

  async function reviews() {
    const res = await request(app.getHttpServer())
      .get('/api/v1/audit/reviews')
      .set(authHeader(admin.token))
      .expect(200);
    return res.body.data as {
      config: { configured: boolean; owner: string | null; cadenceDays: number | null };
      maxAuditId: number | null;
      reviewableRows: number;
      unreviewedRows: number;
      reviewedRanges: Array<{ fromId: number; throughId: number }>;
      unreviewedRanges: Array<{ fromId: number; throughId: number; rows: number }>;
      receipts: Array<{ id: number; fromId: number; throughId: number }>;
      malformedReceipts: number;
    };
  }

  async function coverageGapIds(): Promise<string[]> {
    const res = await request(app.getHttpServer())
      .get('/api/v1/audit/coverage')
      .set(authHeader(admin.token))
      .expect(200);
    return (res.body.data.gaps as Array<{ id: string }>).map((g) => g.id);
  }

  /**
   * Verify the chain the way the endpoint does — only rows that entered it (`hash` non-null) — but
   * without the endpoint's 60-second cache, because the point of these cases is what changed *just now*.
   *
   * 按端点同样的口径校验（只取已入链的行），但**绕过 60 秒缓存** —— 这些用例问的正是「刚刚改了什么」。
   */
  async function chainValid(): Promise<boolean> {
    const rows = await ds.getRepository('ai_audit_logs').find({
      where: { hash: Not(IsNull()) },
      order: { id: 'ASC' },
    });
    return chain.verifyChain(rows as never, (row) => buildPayload(row as object)).valid;
  }

  beforeAll(async () => {
    app = await createTestApp();
    await app.init();
    ds = app.get(DataSource);
    auditService = app.get(AuditService);
    chain = app.get(AuditChainService);

    admin = await makeUser('aw12_admin', 'admin');
    await writeRow('create_event');
    await writeRow('create_todo');
    await writeRow('query_contacts');
  });

  afterAll(async () => {
    await app.close();
  });

  it('before anyone signs: the chain says every reviewable row is unreviewed, and nobody is assigned', async () => {
    const status = await reviews();
    expect(status.config.configured).toBe(false);
    expect(status.receipts).toEqual([]);
    expect(status.reviewedRanges).toEqual([]);
    expect(status.reviewableRows).toBeGreaterThanOrEqual(3);
    expect(status.unreviewedRows).toBe(status.reviewableRows);
  });

  it('the coverage statement reports both review gaps as unknown while rows are unreviewed', async () => {
    const ids = await coverageGapIds();
    expect(ids).toContain('record-review-unassigned');
    expect(ids).toContain('record-review-unreviewed-window');
  });

  it('signing covers the range, and the coverage gaps clear — nothing green is claimed, they simply stop applying', async () => {
    const before = await reviews();
    const throughId = before.maxAuditId as number;

    const res = await request(app.getHttpServer())
      .post('/api/v1/audit/reviews')
      .set(authHeader(admin.token))
      .send({ fromId: 1, throughId })
      .expect(201);
    expect(res.body.data).toMatchObject({ fromId: 1, throughId, cadenceDays: null });

    const after = await reviews();
    expect(after.reviewedRanges).toEqual([{ fromId: 1, throughId }]);
    expect(after.unreviewedRows).toBe(0);
    expect(after.receipts).toHaveLength(1);
    // The receipt is a proper chain row: the chain still verifies.
    // 回执是一条规规矩矩的链上行：链仍然校验通过。
    expect(await chainValid()).toBe(true);

    const ids = await coverageGapIds();
    expect(ids).not.toContain('record-review-unassigned');
    expect(ids).not.toContain('record-review-unreviewed-window');
  });

  it('a row written after the receipt is unreviewed again — the interval is derived, not a stored flag', async () => {
    const newId = await writeRow('create_note');
    const status = await reviews();
    expect(status.unreviewedRows).toBe(1);
    expect(status.unreviewedRanges).toMatchObject([{ fromId: newId, throughId: newId, rows: 1 }]);

    const ids = await coverageGapIds();
    expect(ids).toContain('record-review-unreviewed-window');
  });

  it('a range ahead of the chain is refused (a receipt cannot cover rows nobody wrote)', async () => {
    const status = await reviews();
    await request(app.getHttpServer())
      .post('/api/v1/audit/reviews')
      .set(authHeader(admin.token))
      .send({ fromId: 1, throughId: (status.maxAuditId as number) + 50 })
      .expect(400);
  });

  it('a forged receipt fails chain verification', async () => {
    const repo = ds.getRepository('ai_audit_logs');
    const tail = await repo.find({ where: { hash: Not(IsNull()) }, order: { id: 'DESC' }, take: 1 });
    const forged = await repo.save({
      userId: String(admin.id),
      username: 'aw12_admin',
      action: 'audit_review',
      detail: JSON.stringify({ kind: 'audit_review', fromId: 1, throughId: 1, cadenceDays: 7 }),
      isError: false,
      payloadVersion: 2,
      prevHash: tail[0]?.hash ?? null,
      hash: 'f'.repeat(64),
    } as never);
    expect(await chainValid()).toBe(false);

    // Remove it again so the next case starts from the honest chain.
    // 删掉它，让下一条用例从诚实的链开始。
    await repo.delete((forged as unknown as { id: number }).id);
    expect(await chainValid()).toBe(true);
  });

  it('deleting the receipt turns its range back to unreviewed AND breaks the chain', async () => {
    const status = await reviews();
    const receiptId = status.receipts[0].id;

    await ds.getRepository('ai_audit_logs').delete(receiptId);

    const after = await reviews();
    expect(after.receipts).toEqual([]);
    expect(after.reviewedRanges).toEqual([]);
    expect(after.unreviewedRows).toBe(after.reviewableRows);

    // The row written after the receipt now points at a hash that is no longer in the chain.
    // 回执之后写的那一行，`prevHash` 指向一个已不在链上的 hash。
    expect(await chainValid()).toBe(false);
  });
});
