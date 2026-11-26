// SPDX-License-Identifier: Apache-2.0

/**
 * AW-17 history mode (`historyPath`), end to end: real DI, a real HTTP target, the real reconcile
 * service, a real database.
 *
 * `historyPath` has unit coverage (`src/ai/proxy/target-status.spec.ts`) for what the probe *reads*.
 * That is not the same as knowing the path works when it is wired: the setting has to reach the
 * registry, a stale hold has to be seeded the way the sweep leaves one, the reconcile endpoint has to
 * call the probe with the writer's identity, and the answer has to reach the evidence row and both
 * read faces. This case walks that whole span against a target we control.
 *
 * What it pins:
 *
 * - a real verdict (`executed` / `not_executed`) converges the ledger, and the query is exactly one
 *   `GET` carrying the `Bearer` delegation of the **original writer**;
 * - every way of not getting a verdict — the four history disclosures plus a shape that is not a
 *   history at all — concludes `unknown`, leaves the claim `claimed`, and **never** `not_executed`.
 *   "Nothing in the list" is not "nothing ran";
 * - 401/403 is its own cause (`not_permitted`, F-122) in history mode too: a refusal to show is not a
 *   broken route and not an answer;
 * - declaring both `statusPath` and `historyPath` is refused as `misconfigured` **before** anything is
 *   sent — zero requests leave the process, and the console's query button (`canAsk`) stays dark.
 *
 * Run it alone: `npx jest --config test/jest-e2e.json test/target-status-history.e2e-spec.ts`
 *
 * AW-17 历史模式（`historyPath`）端到端：真 DI、真 HTTP 目标、真对账服务、真数据库。
 *
 * 历史模式此前的单元测试（`src/ai/proxy/target-status.spec.ts`）只覆盖探针**读**到了什么，这不等于知道
 * 接线后这条路走得通：配置要到达注册表、陈旧占位要按清扫留下的样子种下、对账端点要以写入者身份调用探针、
 * 答案要落到证据行与两个读面。本用例对着我们控制的目标把这一整段走一遍。
 *
 * 它钉住：
 *
 * - 真判决（`executed` / `not_executed`）收敛账，且查询恰好是一次 `GET`，携带**原写入者**的 `Bearer`
 *   委托身份；
 * - 每一种拿不到判决的情形 —— 四种历史披露，加上连历史都不是的形状 —— 结论都是 `unknown`，占位保持
 *   `claimed`，**绝不** `not_executed`。「列表里没有」不是「没有发生」；
 * - 401/403 自成一个成因（`not_permitted`，F-122），历史模式下同样成立：拒绝展示不是路由坏了，也不是
 *   一个答案；
 * - 同时声明 `statusPath` 与 `historyPath` ⇒ 发送**之前**按 `misconfigured` 拒绝，进程零请求，控制台的
 *   查询按钮（`canAsk`）不亮。
 *
 * 单独跑：`npx jest --config test/jest-e2e.json test/target-status-history.e2e-spec.ts`
 */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createServer, Server } from 'http';
import { DataSource } from 'typeorm';
import { createTestApp, registerUser, loginAs, authHeader } from './helpers';
import { ToolRegistry } from '../src/ai/tools/tool-registry';
import { SettingsService } from '../src/settings/settings.service';
import { ProxyTargetStatusProbe } from '../src/ai/proxy/target-status';

/**
 * What the target answers for one action key. `json` is a 200 body the probe parses; `http` is a bare
 * status code (the 401/403 refusal cases). A key with no seeded answer gets a history object with no
 * verdict — the honest default, never a "no".
 *
 * 目标对某个 action key 的回答。`json` 是探针解析的 200 响应体；`http` 是裸状态码（401/403 拒绝用例）。
 * 没种过答案的键得到一份没有判决的历史对象 —— 诚实的默认，绝不是「没有」。
 */
type SeededAnswer = { type: 'json'; body: unknown } | { type: 'http'; status: number };

interface ControlledTarget {
  server: Server;
  base: string;
  /** Requests as the target saw them, in arrival order. / 目标看到的请求，按到达顺序。 */
  requests: Array<{ method: string; path: string; authorization: string | undefined }>;
  /** Per-key answers the cases seed. / 用例按 key 种下的回答。 */
  answers: Map<string, SeededAnswer>;
}

async function startControlledTarget(): Promise<ControlledTarget> {
  const answers = new Map<string, SeededAnswer>();
  const requests: ControlledTarget['requests'] = [];

  const server = createServer((req, res) => {
    const rawUrl = req.url ?? '/';
    const { pathname } = new URL(rawUrl, 'http://target.local');
    requests.push({
      method: req.method ?? '',
      path: rawUrl,
      authorization: req.headers.authorization,
    });
    res.setHeader('Content-Type', 'application/json');

    // The history endpoint is read-only by construction; a non-GET is a misconfiguration, not a query.
    // 历史端点构造上只读；非 GET 是配置错误，不是查询。
    if (req.method !== 'GET') {
      res.statusCode = 405;
      res.end(JSON.stringify({ error: 'the history query is read-only' }));
      return;
    }

    const match = pathname.match(/^\/api\/contracts\/([^/]+)\/history$/);
    if (!match) {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'no such path' }));
      return;
    }

    const key = decodeURIComponent(match[1]);
    const seeded = answers.get(key);
    if (!seeded) {
      // No verdict, no disclosure: the list is material, not a decision.
      // 没有判决、没有披露：列表是材料，不是判决。
      res.end(JSON.stringify({ history: {} }));
      return;
    }
    if (seeded.type === 'http') {
      res.statusCode = seeded.status;
      res.end(JSON.stringify({ error: 'refused' }));
      return;
    }
    res.end(JSON.stringify(seeded.body));
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as { port: number }).port;
  return { server, base: `http://localhost:${port}/api`, requests, answers };
}

/** Base64url-decode the delegation JWT's payload — what identity the target actually saw. */
function delegationClaims(authorization: string | undefined): { sub: string; aud: string } {
  expect(authorization).toMatch(/^Bearer /);
  const payload = authorization!.slice('Bearer '.length).split('.')[1];
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
    sub: string;
    aud: string;
  };
}

describe('AW-17 history mode: the target answer, through the real reconcile path', () => {
  let app: INestApplication;
  let ds: DataSource;
  let target: ControlledTarget;
  let admin: { token: string; id: number };
  let writerId: number;

  const password = 'HistoryPath123';
  const TOOL_HISTORY = 'proxy_history_create';
  const TOOL_BOTH = 'proxy_both_channels_create';
  const HISTORY_PATH = 'GET /contracts/{key}/history';
  let seq = 0;

  const claimsRepo = () => ds.getRepository('ai_write_claims');
  const lookupsRepo = () => ds.getRepository('ai_target_status_lookups');
  const auditRepo = () => ds.getRepository('ai_audit_logs');

  /** Wait for the real app's proxy registry to hot-reload the Settings config into the registry. */
  async function waitUntilRegistered(name: string, timeoutMs = 5000): Promise<void> {
    const registry = app.get(ToolRegistry);
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        registry.getTool(name);
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 50));
      }
    }
    throw new Error(`tool ${name} was not registered by the hot reload in ${timeoutMs}ms`);
  }

  /** A hold past the staleness threshold and still unknown — the state reconcile accepts. */
  async function seedStaleClaim(toolName: string, label: string): Promise<{ id: number; key: string }> {
    seq += 1;
    const key = `hist-${label}-${Date.now()}-${seq}`;
    const saved = (await claimsRepo().save({
      idempotencyKey: key,
      userId: String(writerId),
      toolName,
      argsHash: '0123456789abcdef',
      status: 'claimed',
      decisionState: 'open',
      claimedAt: new Date(Date.now() - 90 * 60_000),
      attempts: 1,
    })) as unknown as { id: number };
    return { id: saved.id, key };
  }

  const claimRow = async (id: number) =>
    (await claimsRepo().findOne({ where: { id } })) as unknown as {
      status: string;
      decisionState: string;
      releaseReason: string | null;
    };

  const reconcile = (claimId: number) =>
    request(app.getHttpServer())
      .post(`/api/v1/ai/tool-effects/claims/${claimId}/reconcile`)
      .set(authHeader(admin.token));

  const readLookups = (claimId: number) =>
    request(app.getHttpServer())
      .get(`/api/v1/ai/tool-effects/claims/${claimId}/lookups`)
      .set(authHeader(admin.token));

  /** The `claim_release` rows a given hold left behind (empty for every `unknown` conclusion). */
  async function releaseRowsFor(claimId: number): Promise<Array<{ detail: string; releaseLookups: string | null }>> {
    const rows = (await auditRepo().find({ where: { action: 'claim_release' } as never })) as unknown as Array<{
      detail: string;
      releaseLookups: string | null;
    }>;
    return rows.filter((r) => r.detail.includes(`write claim #${claimId} `));
  }

  /**
   * The target saw exactly one query for this key, it was a `GET`, it went to the history path, and
   * it carried a `Bearer` delegation. The writer's identity is asserted at the call site.
   *
   * 目标对这一个键恰好看到一次查询，是 `GET`、打向历史路径、带着 `Bearer` 委托。写入者身份在调用处断言。
   */
  function expectSingleHistoryGet(key: string): void {
    expect(target.requests).toHaveLength(1);
    const [hit] = target.requests;
    expect(hit.method).toBe('GET');
    expect(hit.path).toBe(`/api/contracts/${key}/history`);
    expect(hit.authorization).toMatch(/^Bearer /);
  }

  beforeAll(async () => {
    target = await startControlledTarget();

    app = await createTestApp();
    await app.init();
    ds = app.get(DataSource);

    const writer = await registerUser(app, {
      username: `hist_writer_${Date.now()}`,
      email: `hist_writer_${Date.now()}@test.com`,
      password,
      nickname: 'HistoryWriter',
    });
    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set(authHeader(writer.accessToken))
      .expect(200);
    writerId = (me.body.data as { id: number }).id;

    const adminName = `hist_admin_${Date.now()}`;
    const reg = await registerUser(app, {
      username: adminName,
      email: `${adminName}@test.com`,
      password,
      nickname: 'HistoryAdmin',
    });
    const adminMe = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set(authHeader(reg.accessToken))
      .expect(200);
    const adminId = (adminMe.body.data as { id: number }).id;
    await ds.getRepository('users').update(adminId, { role: 'admin' });
    admin = { token: (await loginAs(app, adminName, password)).accessToken, id: adminId };

    await app.get(SettingsService).set(
      'ai_proxy_tools',
      JSON.stringify({
        baseUrl: target.base,
        audience: 'legacy-erp',
        tools: [
          {
            name: TOOL_HISTORY,
            description: '建合同（目标只在历史端点给判决）',
            method: 'POST',
            path: '/contracts',
            parameters: [],
            riskLevel: 'R3',
            historyPath: HISTORY_PATH,
          },
          {
            name: TOOL_BOTH,
            description: '建合同（两条通道同配，应在发送前被拒）',
            method: 'POST',
            path: '/contracts',
            parameters: [],
            riskLevel: 'R3',
            statusPath: 'GET /contracts/status/{key}',
            historyPath: HISTORY_PATH,
          },
        ],
      }),
    );
    await Promise.all([waitUntilRegistered(TOOL_HISTORY), waitUntilRegistered(TOOL_BOTH)]);
  }, 120_000);

  beforeEach(() => {
    target.requests.length = 0;
    target.answers.clear();
  });

  afterAll(async () => {
    (target.server as unknown as { closeAllConnections?: () => void }).closeAllConnections?.();
    await new Promise<void>((resolve) => target.server.close(() => resolve()));
    await app.close();
  });

  it('目标在历史端点答 executed ⇒ 落定；一次 GET，携带写入者的委托身份', async () => {
    const { id: claimId, key } = await seedStaleClaim(TOOL_HISTORY, 'exec');
    target.answers.set(key, { type: 'json', body: { status: 'executed' } });

    const res = await reconcile(claimId).expect(200);
    expect(res.body.data).toMatchObject({
      outcome: 'reconciled',
      conclusion: 'executed',
      claimStatus: 'settled',
    });
    // The probe's reading says which channel was asked, not just that a question was asked.
    // 探针的读数说出问的是哪条通道，而不只是「问了」。
    expect(res.body.data.evidence).toMatchObject({
      conclusion: 'executed',
      reason: null,
      basis: null,
      queryMethod: 'GET',
      queryPath: `/contracts/${key}/history`,
    });

    expectSingleHistoryGet(key);
    // The writer's delegated identity, not the administrator's who pressed reconcile.
    // 写入者的委托身份，不是按下对账的管理员。
    expect(delegationClaims(target.requests[0].authorization)).toMatchObject({
      sub: `local:${writerId}`,
      aud: 'legacy-erp',
    });

    const [lookup] = await lookupsRepo().find({ where: { idempotencyKey: key } });
    expect(lookup).toMatchObject({
      toolName: TOOL_HISTORY,
      conclusion: 'executed',
      reason: null,
      basis: null,
      queryMethod: 'GET',
      queryPath: `/contracts/${key}/history`,
      asUserId: String(writerId),
      lookedUpBy: String(admin.id),
    });
    expect((await claimRow(claimId)).status).toBe('settled');

    const read = await readLookups(claimId).expect(200);
    expect((read.body.data as { items: Array<Record<string, unknown>> }).items[0]).toMatchObject({
      conclusion: 'executed',
      reason: null,
      // The read face never returns `null`; an undeclared basis reads `unknown`, never a guess.
      // 读面从不返回 `null`；未声明读作 `unknown`，绝不猜。
      basis: 'unknown',
      queryPath: `/contracts/${key}/history`,
    });
  });

  it('目标答 not_executed ⇒ 释放；释放证据行指向历史路径，账上留决定', async () => {
    const { id: claimId, key } = await seedStaleClaim(TOOL_HISTORY, 'release');
    target.answers.set(key, { type: 'json', body: { status: 'not_executed' } });

    const res = await reconcile(claimId).expect(200);
    expect(res.body.data).toMatchObject({
      outcome: 'reconciled',
      conclusion: 'not_executed',
      claimStatus: 'released',
    });

    expectSingleHistoryGet(key);
    expect(delegationClaims(target.requests[0].authorization).sub).toBe(`local:${writerId}`);

    const [lookup] = await lookupsRepo().find({ where: { idempotencyKey: key } });
    expect(lookup).toMatchObject({
      conclusion: 'not_executed',
      reason: null,
      queryMethod: 'GET',
      queryPath: `/contracts/${key}/history`,
    });

    const claim = await claimRow(claimId);
    expect(claim.status).toBe('released');
    expect(claim.releaseReason).toBe('target_status_not_executed');

    // The decision is on the chain too: the hold row is overwritten by any re-claim, this row is not.
    // 决定也上了链：占位行会被任何重占位覆盖，而这一行不会。
    const releases = await releaseRowsFor(claimId);
    expect(releases).toHaveLength(1);
    expect(releases[0].detail).toContain(
      `origin: target answered not_executed (GET /contracts/${key}/history`,
    );
    // The copy holds observed fields only (F-125); the path is in the row's `detail`, asserted above.
    // 拷贝只装观测到的字段（F-125）；路径在行 `detail` 里，上面已断言。
    const evidence = JSON.parse(releases[0].releaseLookups!) as {
      count: number;
      items: Array<{ conclusion: string; basis: string }>;
    };
    expect(evidence.count).toBe(1);
    expect(evidence.items[0]).toMatchObject({ conclusion: 'not_executed', basis: 'unknown' });
  });

  /**
   * Every silence, one case each. The assertion that matters is the same in all of them: the ledger
   * stays `claimed` and the conclusion stays `unknown` — a target that did not say "no" must never be
   * recorded as having said it.
   *
   * 每一种沉默各一例。所有用例里要紧的断言相同：账保持 `claimed`、结论保持 `unknown` —— 目标没说
   * 「没有」，就绝不能记成它说了。
   */
  const silences: Array<{ label: string; body: unknown; reason: string }> = [
    { label: '不保留', body: { history: { available: false } }, reason: 'history-unavailable' },
    { label: '覆盖不到', body: { history: { coversActionKey: false } }, reason: 'history-does-not-cover' },
    { label: '被截断-complete', body: { history: { complete: false } }, reason: 'history-truncated' },
    { label: '被截断-hasMore', body: { history: { hasMore: true } }, reason: 'history-truncated' },
    { label: '无判决-空历史', body: { history: {} }, reason: 'history-no-verdict' },
    { label: '无判决-有事件但无判决', body: { history: { events: [] } }, reason: 'history-no-verdict' },
    { label: '非历史形状', body: { ok: true }, reason: 'unrecognized_answer' },
  ];

  for (const c of silences) {
    it(`沉默形状「${c.label}」⇒ unknown / ${c.reason}，账保持 claimed（绝非 not_executed）`, async () => {
      const { id: claimId, key } = await seedStaleClaim(TOOL_HISTORY, 'silent');
      target.answers.set(key, { type: 'json', body: c.body });

      const res = await reconcile(claimId).expect(200);
      expect(res.body.data).toMatchObject({
        outcome: 'unresolved',
        conclusion: 'unknown',
        claimStatus: 'claimed',
      });
      expect(res.body.data.evidence).toMatchObject({ conclusion: 'unknown', reason: c.reason });

      expectSingleHistoryGet(key);

      const [lookup] = await lookupsRepo().find({ where: { idempotencyKey: key } });
      expect(lookup).toMatchObject({
        conclusion: 'unknown',
        reason: c.reason,
        queryPath: `/contracts/${key}/history`,
        asUserId: String(writerId),
        lookedUpBy: String(admin.id),
      });

      // The ledger did not move, and no release decision was written: silence is not a no.
      // 账没动，也没写任何释放决定：沉默不是「没有」。
      const claim = await claimRow(claimId);
      expect(claim.status).toBe('claimed');
      expect(claim.decisionState).toBe('open');
      expect(await releaseRowsFor(claimId)).toHaveLength(0);

      const read = await readLookups(claimId).expect(200);
      expect((read.body.data as { items: Array<Record<string, unknown>> }).items[0]).toMatchObject({
        conclusion: 'unknown',
        reason: c.reason,
        queryPath: `/contracts/${key}/history`,
      });
    });
  }

  for (const status of [401, 403]) {
    it(`目标回 ${status} ⇒ not_permitted（拒绝展示不是坏了，也不是没跑）`, async () => {
      const { id: claimId, key } = await seedStaleClaim(TOOL_HISTORY, `denied-${status}`);
      target.answers.set(key, { type: 'http', status });

      const res = await reconcile(claimId).expect(200);
      expect(res.body.data).toMatchObject({
        outcome: 'unresolved',
        conclusion: 'unknown',
        claimStatus: 'claimed',
      });
      // F-122: the deliberate refusal has its own cause, in history mode too.
      // F-122：有意的拒绝自成一个成因，历史模式下同样如此。
      expect(res.body.data.evidence).toMatchObject({ conclusion: 'unknown', reason: 'not_permitted' });

      expectSingleHistoryGet(key);

      const [lookup] = await lookupsRepo().find({ where: { idempotencyKey: key } });
      expect(lookup).toMatchObject({ conclusion: 'unknown', reason: 'not_permitted' });

      const claim = await claimRow(claimId);
      expect(claim.status).toBe('claimed');
      expect(await releaseRowsFor(claimId)).toHaveLength(0);
    });
  }

  /**
   * Two declarations are two questions, and the probe asks one. The refusal is taken **before** the
   * request is built, so the target sees nothing — the assertion is on the wire, not on a log line.
   *
   * 两条声明是两个问题，而探针只问一个。拒绝发生在请求构造**之前**，故目标什么都看不到 —— 断言落在
   * 线上，不落在日志上。
   */
  it('两条通道同配 ⇒ misconfigured，零请求；canAsk 也不亮（不猜问哪个）', async () => {
    const { id: claimId, key } = await seedStaleClaim(TOOL_BOTH, 'both');
    const probe = app.get(ProxyTargetStatusProbe);

    // A property of the tool, not a query — the console button must not offer a query that will
    // always be refused.
    // 工具的性质，不是查询 —— 控制台按钮不该提供一个必被拒绝的查询。
    expect(probe.canAsk(TOOL_BOTH)).toBe(false);

    const res = await reconcile(claimId).expect(200);
    expect(res.body.data).toMatchObject({
      outcome: 'unresolved',
      conclusion: 'unknown',
      claimStatus: 'claimed',
    });
    expect(res.body.data.evidence).toMatchObject({ conclusion: 'unknown', reason: 'misconfigured' });
    expect(target.requests).toHaveLength(0);

    const claim = await claimRow(claimId);
    expect(claim.status).toBe('claimed');
    expect(await releaseRowsFor(claimId)).toHaveLength(0);

    // The direct probe agrees, and still sends nothing.
    // 直接调用探针结论一致，且仍然什么都不发。
    const direct = await probe.lookup(TOOL_BOTH, key, String(writerId));
    expect(direct).toMatchObject({ conclusion: 'unknown', reason: 'misconfigured' });
    expect(target.requests).toHaveLength(0);
  });
});
