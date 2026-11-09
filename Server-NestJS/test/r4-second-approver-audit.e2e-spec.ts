// SPDX-License-Identifier: Apache-2.0

/**
 * R4 two-person approval: the **second person leaves an audit row of their own**.
 *
 * This pins the behaviour `d7ed2ccf` introduced, through the product's own doors only:
 *   ① an administrator raises `create_followup_task` to the approval tier with the governance policy
 *      (no hand-written DB rows, no product-code shortcuts);
 *   ② the operator (alex) proposes it over `/ai/chat/stream` with the deterministic demo provider, so
 *      the R4 door parks a pending confirmation without an API key;
 *   ③ a different administrator (admin) decides it through `POST /ai/confirmations/:token/approve-by`;
 *   ④ the audit read then shows a `tool_confirmation` row attributed to **admin**, and the operator's
 *      execution row names the approver as `name (#id)`; the hash chain still verifies.
 *
 * Before `d7ed2ccf` the decision path wrote only the operator's `tool_call` row, so an audit reader
 * could see a numeric `approverId` on the confirmation but no row naming the person who decided —
 * assertion ④a below is the one that goes red there.
 *
 * R4 双人审批：**第二人留下自己的一行审计记录**。
 *
 * 本套件只为 `d7ed2ccf` 引入的行为加防回归守护，且只走产品自己的门：管理员用治理策略把
 * `create_followup_task` 升到审批档（不手写 DB 行、不改产品码）；operator（alex）经
 * `/ai/chat/stream` 与确定性 demo provider 发起提议，R4 门因此挂起一条待批确认（无需 API key）；
 * 另一名管理员（admin）经 `POST /ai/confirmations/:token/approve-by` 裁决；随后审计读面应能看到一条
 * 归属 **admin** 的 `tool_confirmation` 行，operator 的执行行以 `姓名 (#id)` 点名批准人，且哈希链仍可验。
 *
 * 在 `d7ed2ccf` 之前，裁决路径只写 operator 的 `tool_call` 行 —— 审计读者在确认行上只能看到一个数字
 * `approverId`，没有任何一行点名做出决定的人；下面 ④a 就是那时会红的那条断言。
 */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp, registerUser, loginAs, authHeader } from './helpers';

/**
 * A parsed SSE frame: `{ type: 'confirmation_request', confirmation: {...} }` and friends.
 *
 * 解析后的一帧 SSE：`{ type: 'confirmation_request', confirmation: {...} }` 之类。
 */
interface SseEvent {
  type?: string;
  [k: string]: unknown;
}

/**
 * Drive one chat turn over the SSE endpoint and collect its frames. The demo provider is named
 * explicitly so the turn is deterministic even when the environment configures a cloud provider.
 *
 * 驱动一轮对话并收集它的事件帧。显式点名 demo provider，使这一轮在配置了云 provider 的环境里
 * 仍然确定。
 */
async function runStream(opts: { port: number; token: string; message: string }): Promise<SseEvent[]> {
  const res = await fetch(`http://localhost:${opts.port}/api/v1/ai/chat/stream`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${opts.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: opts.message, provider: 'demo' }),
  });
  if (!res.ok) {
    throw new Error(`stream ${res.status} ${res.statusText}: ${await res.text()}`);
  }
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  const events: SseEvent[] = [];

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    let sep: number;
    while ((sep = buf.indexOf('\n\n')) >= 0) {
      const frame = buf.slice(0, sep);
      buf = buf.slice(sep + 2);
      const dataLine = frame.split('\n').find((l) => l.startsWith('data: '));
      if (!dataLine) continue;
      let evt: SseEvent;
      try {
        evt = JSON.parse(dataLine.slice('data: '.length)) as SseEvent;
      } catch {
        continue;
      }
      events.push(evt);
    }
  }
  return events;
}

interface AuditRow {
  id: number | string;
  userId: string;
  username?: string;
  action: string;
  outcome?: string | null;
  tool?: string | null;
  errorMessage?: string;
  isError?: boolean;
  [k: string]: unknown;
}

describe('R4 第二批准人的审计行（产品路径，e2e）', () => {
  let app: INestApplication;
  let port: number;
  let operatorToken: string;
  let operatorId: string;
  let adminToken: string;
  let adminId: string;

  jest.setTimeout(120_000);

  beforeAll(async () => {
    app = await createTestApp();

    const operator = await registerUser(app, {
      username: 'alex',
      email: 'alex@r4-audit.test',
      password: 'AlexR4abcd1',
      nickname: 'Alex',
    });
    operatorToken = operator.accessToken;
    const operatorMe = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set(authHeader(operatorToken))
      .expect(200);
    operatorId = String(operatorMe.body.data.id);

    const adminReg = await registerUser(app, {
      username: 'admin',
      email: 'admin@r4-audit.test',
      password: 'AdminR4abcd2',
      nickname: 'Admin',
    });
    const adminMe = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set(authHeader(adminReg.accessToken))
      .expect(200);
    adminId = String(adminMe.body.data.id);
    await app.get(DataSource).getRepository('users').update(Number(adminId), { role: 'admin' });
    // Re-login so the token carries the promoted role — the registration token does not have it.
    //
    // 重新登录，换取带 admin 角色的 token —— 注册时签发的那枚没有。
    adminToken = (await loginAs(app, 'admin', 'AdminR4abcd2')).accessToken;

    // The demo provider's follow-up intent resolves the customer from the turn, defaulting to id 1.
    //
    // 跟进意图会从本轮对话里解析客户，缺省取 id 1。
    await request(app.getHttpServer())
      .post('/api/v1/crm/customers')
      .set(authHeader(operatorToken))
      .send({ name: '辰光建材', company: '辰光集团', status: 'active', riskLevel: 'high' })
      .expect(201);

    // Bind a real socket: the SSE path streams over `fetch`, unlike the buffered supertest calls.
    //
    // 绑定真实端口：SSE 经 `fetch` 流式读取，缓冲式 supertest 调用不行。
    await app.listen(0);
    port = (app.getHttpServer().address() as { port: number }).port;
  });

  afterAll(async () => {
    await app.close();
  });

  /**
   * Audit rows for one user through the product's read face (admins get the full row).
   *
   * 经产品自己的读面取某个用户的审计行（管理员拿到整行）。
   */
  async function logsFor(userId: string): Promise<AuditRow[]> {
    const res = await request(app.getHttpServer())
      .get('/api/v1/audit/logs')
      .query({ userId, limit: 200 })
      .set(authHeader(adminToken))
      .expect(200);
    const body = res.body.data;
    return (Array.isArray(body) ? body : (body?.items ?? [])) as AuditRow[];
  }

  it('第二人批准 → 留下归属批准人的 tool_confirmation 行，执行行点名批准人，链仍可验', async () => {
    // ① Raise the tier through the governance policy — the same door an administrator uses.
    //
    // ① 经治理策略升档 —— 管理员用的就是这扇门。
    await request(app.getHttpServer())
      .put('/api/v1/ai/governance/policy')
      .set(authHeader(adminToken))
      .send({ tools: { create_followup_task: { mode: 'approval' } }, audit: { granularity: 'all' } })
      .expect(200);

    let approvalToken = '';
    try {
      // ② The operator proposes the write; the R4 door parks it pending without deciding it.
      //
      // ② operator 发起写提议；R4 门把它挂起待批，不作裁决。
      const events = await runStream({
        port,
        token: operatorToken,
        message: '帮我为这个客户创建跟进任务',
      });
      const requestFrame = events.find(
        (e) => e.type === 'confirmation_request',
      ) as { confirmation?: Record<string, unknown> } | undefined;
      expect(requestFrame?.confirmation).toBeDefined();
      // Guard: the parked request must be the R4 (approval) tier. If the policy had not taken effect
      // this would be the inline R3 path, and every assertion below would be about a different door.
      //
      // 守卫：挂起的必须是 R4（审批）档。若策略没生效，这里会是内联 R3 路径，下面的断言就都在说另一扇门。
      expect(requestFrame!.confirmation!.mode).toBe('approval');
      expect(requestFrame!.confirmation!.toolName).toBe('create_followup_task');
      approvalToken = String(requestFrame!.confirmation!.token);

      // ③ The second person decides. `decideApproval` awaits execution before answering, so both
      // audit rows exist once this returns.
      //
      // ③ 第二人裁决。`decideApproval` 会先把执行做完再返回，故响应返回时两行审计都已落库。
      const approved = await request(app.getHttpServer())
        .post(`/api/v1/ai/confirmations/${approvalToken}/approve-by`)
        .set(authHeader(adminToken))
        .send({ decision: 'approve' })
        .expect(200);
      expect(approved.body.data.ok).toBe(true);
      expect(approved.body.data.success).toBe(true);

      // ④a The approver has a row of their own, attributed to them by id AND username snapshot.
      // This is the assertion that goes red before d7ed2ccf: the row did not exist at all.
      //
      // ④a 批准人有自己的一行，按 id 与用户名快照归属 —— 这条断言在 `d7ed2ccf` 之前会红：那一行根本不存在。
      const approverRows = await logsFor(adminId);
      const decisionRows = approverRows.filter(
        (r) => r.action === 'tool_confirmation' && r.tool === 'create_followup_task' && r.outcome === 'approved',
      );
      expect(decisionRows).toHaveLength(1);
      expect(decisionRows[0]).toMatchObject({
        userId: adminId,
        username: 'admin',
        action: 'tool_confirmation',
        outcome: 'approved',
        tool: 'create_followup_task',
        isError: false,
      });

      // ④b The execution row belongs to the operator, but its note names the approver as name (#id).
      //
      // ④b 执行行归属 operator，但其注记以「姓名 (#id)」点名批准人。
      const operatorRows = await logsFor(operatorId);
      const executionRow = operatorRows.find(
        (r) => r.action === 'tool_call' && r.tool === 'create_followup_task',
      );
      expect(executionRow).toBeDefined();
      expect(executionRow!.outcome).toBe('executed');
      expect(executionRow!.userId).toBe(operatorId);
      expect(String(executionRow!.errorMessage)).toContain(`approver admin (#${adminId})`);

      // ④c The approver row joined the same hash chain; the chain still verifies.
      //
      // ④c 批准人那一行进了同一条哈希链，链仍可验。
      const verify = await request(app.getHttpServer())
        .get('/api/v1/audit/verify')
        .set(authHeader(adminToken))
        .expect(200);
      expect(verify.body.data.valid).toBe(true);
    } finally {
      // Put the policy back so a re-run (or a neighbouring suite) sees no raised tier.
      //
      // 恢复策略，使重跑（或相邻套件）看不到被抬高的档位。
      await request(app.getHttpServer())
        .put('/api/v1/ai/governance/policy')
        .set(authHeader(adminToken))
        .send({ tools: {}, audit: { granularity: 'all' } })
        .expect(200);
    }
  });
});
