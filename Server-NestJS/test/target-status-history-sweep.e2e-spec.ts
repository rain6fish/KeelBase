// SPDX-License-Identifier: Apache-2.0

/**
 * AW-17 history mode, the two ends the sibling spec does not reach: the **automatic sweep** asking
 * through `historyPath`, and a `historyPath` that cannot be sent at all.
 *
 * `target-status-history.e2e-spec.ts` pins the manual reconcile over a real target. It leaves two
 * spans unwired: (1) the hourly sweep (`system:sweep`) chooses and asks a hold on its own, and the
 * decision row it leaves must say so; (2) a `historyPath` shaped as anything but one `GET` with a
 * `{key}` is refused **before** a byte leaves the process — the unit tests pin the refusal, but not
 * the ledger, the evidence row, and the read face together. Both are exactly the kind of wire that
 * looks fine until it regresses, so they get their own file rather than growing the sibling.
 *
 * What this file pins:
 *
 * - the sweep's own entry (`MaintenanceTasksService.expireInFlightClaimWindows`) queues an overdue
 *   hold and asks through `historyPath`; `not_executed` releases it, and the chained `claim_release`
 *   row names `system:sweep (automatic sweep)` as the initiator and the history path as the origin;
 * - a second pass sends nothing: a released hold is no longer a candidate;
 * - a non-`GET` and a `{key}`-less `historyPath` are both `misconfigured` with **zero** outbound
 *   requests, the ledger stays `claimed`, and the reading lands as evidence — while `canAsk` (and
 *   therefore the console's query button, `reconcilable`) stays off;
 * - the sweep skips an unaskable channel without writing an evidence row: an hourly row about our own
 *   configuration would be noise about the write, and the code says so.
 *
 * Run it alone:
 * `npx jest --config test/jest-e2e.json test/target-status-history-sweep.e2e-spec.ts`
 *
 * AW-17 历史模式，兄弟用例够不到的两端：**自动清扫**经 `historyPath` 询问，以及根本发不出去的
 * `historyPath`。
 *
 * `target-status-history.e2e-spec.ts` 钉住的是人工对账对着真目标走通。它留下两段没接上：（1）每小时清扫
 *（`system:sweep`）自己挑选并询问一条占位，且它留下的决定行必须说清是谁发起的；（2）`historyPath` 不是
 * 「一次带 `{key}` 的 `GET`」时，在**任何字节离开发送进程之前**被拒绝 —— 单测钉了拒绝本身，但没把账、
 * 证据行与读面放在一起钉。这两种线恰恰是「看着没问题，直到它回归」的那类，故另起一个文件，不撑大兄弟用例。
 *
 * 本文件钉住：
 *
 * - 清扫自己的入口（`MaintenanceTasksService.expireInFlightClaimWindows`）把一条过期占位放进队列，并经
 *   `historyPath` 询问；`not_executed` 释放它，带链的 `claim_release` 行写明发起方是
 *   `system:sweep (automatic sweep)`、来源是历史路径；
 * - 第二趟什么都不发：已释放的占位不再是候选；
 * - 非 `GET` 与缺 `{key}` 的 `historyPath` 都按 `misconfigured` 处理、**零**出站请求，账保持 `claimed`，
 *   读数作为证据落库 —— 而 `canAsk`（也就是控制台的查询按钮、`reconcilable`）不亮；
 * - 清扫遇到问不了的通道只跳过、不写证据行：每小时一条关于我们自己配置的记录，是关于那次写的噪声。
 */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createServer, Server } from 'http';
import { DataSource } from 'typeorm';
import { createTestApp, registerUser, loginAs, authHeader } from './helpers';
import { ToolRegistry } from '../src/ai/tools/tool-registry';
import { SettingsService } from '../src/settings/settings.service';
import { ProxyTargetStatusProbe } from '../src/ai/proxy/target-status';
import { MaintenanceTasksService } from '../src/maintenance-tasks/maintenance-tasks.service';
import { AiToolEffectsService } from '../src/governance-shared/services/ai-tool-effects.service';

interface ControlledTarget {
  server: Server;
  base: string;
  /** Requests as the target saw them, in arrival order. / 目标看到的请求，按到达顺序。 */
  requests: Array<{ method: string; path: string; authorization: string | undefined }>;
  /** Answers the cases seed, by action key. / 用例按 action key 种下的回答。 */
  answers: Map<string, unknown>;
}

async function startControlledTarget(): Promise<ControlledTarget> {
  const answers = new Map<string, unknown>();
  const requests: ControlledTarget['requests'] = [];

  const server = createServer((req, res) => {
    const rawUrl = req.url ?? '/';
    const { pathname } = new URL(rawUrl, 'http://target.local');
    requests.push({ method: req.method ?? '', path: rawUrl, authorization: req.headers.authorization });
    res.setHeader('Content-Type', 'application/json');

    const match = pathname.match(/^\/api\/contracts\/([^/]+)\/history$/);
    if (req.method !== 'GET' || !match) {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'no such route' }));
      return;
    }
    const key = decodeURIComponent(match[1]);
    const seeded = answers.get(key);
    res.end(JSON.stringify(seeded ?? { history: {} }));
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

describe('AW-17 history mode: the automatic sweep, and channels that cannot be sent', () => {
  let app: INestApplication;
  let ds: DataSource;
  let target: ControlledTarget;
  let admin: { token: string; id: number };
  let writerId: number;

  const password = 'HistorySweep123';
  const TOOL_SWEEP = 'proxy_history_sweep_create';
  const TOOL_POST = 'proxy_history_post_create';
  const TOOL_NO_KEY = 'proxy_history_nokey_create';
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

  /**
   * A hold past the staleness threshold and still unknown. `open` is the state the expiry sweep reads;
   * `awaiting_decision` is what it leaves behind for the ask.
   *
   * 一条已过陈旧阈值、结局仍未知的占位。`open` 是到期清扫读取的状态；`awaiting_decision` 是它留给询问
   * 的那个状态。
   */
  async function seedClaim(
    toolName: string,
    label: string,
    decisionState: 'open' | 'awaiting_decision',
  ): Promise<{ id: number; key: string }> {
    seq += 1;
    const key = `sweep-${label}-${Date.now()}-${seq}`;
    const saved = (await claimsRepo().save({
      idempotencyKey: key,
      userId: String(writerId),
      toolName,
      argsHash: '0123456789abcdef',
      status: 'claimed',
      decisionState,
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

  const listClaims = (toolName: string) =>
    request(app.getHttpServer())
      .get(`/api/v1/ai/tool-effects/claims?toolName=${toolName}`)
      .set(authHeader(admin.token));

  /** The `claim_release` rows a given hold left behind. / 某条占位留下的 `claim_release` 行。 */
  async function releaseRowsFor(
    claimId: number,
  ): Promise<Array<{ userId: string; detail: string; releaseLookups: string | null }>> {
    const rows = (await auditRepo().find({ where: { action: 'claim_release' } as never })) as unknown as Array<{
      userId: string;
      detail: string;
      releaseLookups: string | null;
    }>;
    return rows.filter((r) => r.detail.includes(`write claim #${claimId} `));
  }

  async function lookupFor(key: string): Promise<Record<string, unknown>> {
    const rows = (await lookupsRepo().find({ where: { idempotencyKey: key } })) as unknown as Array<
      Record<string, unknown>
    >;
    expect(rows).toHaveLength(1);
    return rows[0];
  }

  beforeAll(async () => {
    target = await startControlledTarget();

    app = await createTestApp();
    await app.init();
    ds = app.get(DataSource);

    const stamp = Date.now();
    const writer = await registerUser(app, {
      username: `sweep_writer_${stamp}`,
      email: `sweep_writer_${stamp}@test.com`,
      password,
      nickname: 'SweepWriter',
    });
    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set(authHeader(writer.accessToken))
      .expect(200);
    writerId = (me.body.data as { id: number }).id;

    const adminName = `sweep_admin_${stamp}`;
    const reg = await registerUser(app, {
      username: adminName,
      email: `${adminName}@test.com`,
      password,
      nickname: 'SweepAdmin',
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
            name: TOOL_SWEEP,
            description: '建合同（历史端点给判决，供自动清扫询问）',
            method: 'POST',
            path: '/contracts',
            parameters: [],
            riskLevel: 'R3',
            historyPath: 'GET /contracts/{key}/history',
          },
          {
            name: TOOL_POST,
            description: '建合同（历史通道配成 POST，应在发送前被拒）',
            method: 'POST',
            path: '/contracts',
            parameters: [],
            riskLevel: 'R3',
            historyPath: 'POST /contracts/state/{key}',
          },
          {
            name: TOOL_NO_KEY,
            description: '建合同（历史通道不含 {key}，应在发送前被拒）',
            method: 'POST',
            path: '/contracts',
            parameters: [],
            riskLevel: 'R3',
            historyPath: 'GET /contracts/history',
          },
        ],
      }),
    );
    await Promise.all([
      waitUntilRegistered(TOOL_SWEEP),
      waitUntilRegistered(TOOL_POST),
      waitUntilRegistered(TOOL_NO_KEY),
    ]);
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

  it('自动清扫经历史端点拿到 not_executed ⇒ 释放；决定行记 system:sweep 发起、历史路径为来源', async () => {
    const { id: claimId, key } = await seedClaim(TOOL_SWEEP, 'auto', 'open');
    target.answers.set(key, { status: 'not_executed' });

    // The sweep's own entry: the hourly cron, not a hand-copied call to its inner pass.
    // 清扫自己的入口：每小时那个 cron，而不是手工抄一遍它内部的 pass。
    await app.get(MaintenanceTasksService).expireInFlightClaimWindows();

    // One read-only GET, at the history path, carrying the writer's delegation.
    // 一次只读 GET，打向历史路径，携带写入者的委托。
    expect(target.requests).toHaveLength(1);
    expect(target.requests[0].method).toBe('GET');
    expect(target.requests[0].path).toBe(`/api/contracts/${key}/history`);
    expect(delegationClaims(target.requests[0].authorization)).toMatchObject({
      sub: `local:${writerId}`,
      aud: 'legacy-erp',
    });

    const claim = await claimRow(claimId);
    expect(claim.status).toBe('released');
    expect(claim.releaseReason).toBe('target_status_not_executed');

    // Who asked is the sweep; as whom it asked is still the writer. Two facts, two columns.
    // 谁问的是清扫；以谁的身份问的仍是写入者。两件事，两列。
    expect(await lookupFor(key)).toMatchObject({
      toolName: TOOL_SWEEP,
      conclusion: 'not_executed',
      reason: null,
      queryMethod: 'GET',
      queryPath: `/contracts/${key}/history`,
      asUserId: String(writerId),
      lookedUpBy: 'system:sweep',
    });

    const releases = await releaseRowsFor(claimId);
    expect(releases).toHaveLength(1);
    expect(releases[0].userId).toBe('system:sweep');
    expect(releases[0].detail).toContain('origin: target answered not_executed');
    expect(releases[0].detail).toContain(`(GET /contracts/${key}/history `);
    expect(releases[0].detail).toContain('initiated by: system:sweep (automatic sweep)');

    const evidence = JSON.parse(releases[0].releaseLookups!) as {
      count: number;
      askable: boolean;
      items: Array<{ conclusion: string; lookedUpBy: string }>;
    };
    expect(evidence.count).toBe(1);
    expect(evidence.askable).toBe(true);
    expect(evidence.items[0]).toMatchObject({ conclusion: 'not_executed', lookedUpBy: 'system:sweep' });

    // A released hold is not a candidate: the next pass asks nothing.
    // 已释放的占位不是候选：下一趟什么都不问。
    await app.get(MaintenanceTasksService).expireInFlightClaimWindows();
    expect(target.requests).toHaveLength(1);
  });

  /**
   * Two declarations that cannot be sent, one case each. Both are refused before the request is built,
   * so the assertion is on the wire; the evidence row says which channel was refused and why, and the
   * ledger does not move — an unsendable query is not an answer.
   *
   * 两条发不出去的声明，各一例。两者都在请求构造之前被拒，故断言落在线上；证据行说清哪条通道被拒、为什么，
   * 而账不动 —— 发不出的查询不是答案。
   */
  const unsendable: Array<{ label: string; tool: string; reason: string; method: string; path: string }> = [
    {
      label: '非 GET',
      tool: TOOL_POST,
      method: 'POST',
      path: '/contracts/state/{key}',
      reason: 'misconfigured',
    },
    {
      label: '缺 {key}',
      tool: TOOL_NO_KEY,
      method: 'GET',
      path: '/contracts/history',
      reason: 'misconfigured',
    },
  ];

  for (const c of unsendable) {
    it(`historyPath ${c.label} ⇒ 发送前 misconfigured，零请求、账保持 claimed、canAsk 不亮`, async () => {
      const { id: claimId, key } = await seedClaim(c.tool, `bad-${c.method}`, 'open');
      const probe = app.get(ProxyTargetStatusProbe);
      expect(probe.canAsk(c.tool)).toBe(false);

      const res = await reconcile(claimId).expect(200);
      expect(res.body.data).toMatchObject({
        outcome: 'unresolved',
        conclusion: 'unknown',
        claimStatus: 'claimed',
      });
      expect(res.body.data.evidence).toMatchObject({
        conclusion: 'unknown',
        reason: c.reason,
        queryMethod: c.method,
        queryPath: c.path,
      });

      // Nothing left the process — the refusal is before the request, not a failure after it.
      // 进程什么都没发出去 —— 拒绝在构造请求之前，不是一次失败之后。
      expect(target.requests).toHaveLength(0);

      expect(await lookupFor(key)).toMatchObject({
        toolName: c.tool,
        conclusion: 'unknown',
        reason: c.reason,
        queryMethod: c.method,
        queryPath: c.path,
        asUserId: String(writerId),
        lookedUpBy: String(admin.id),
      });

      const claim = await claimRow(claimId);
      expect(claim.status).toBe('claimed');
      expect(claim.decisionState).toBe('open');
      expect(await releaseRowsFor(claimId)).toHaveLength(0);

      // The console's query button reads the same fact the probe just gave.
      // 控制台的查询按钮读到探针刚给出的同一件事。
      const list = await listClaims(c.tool).expect(200);
      const row = (list.body.data.items as Array<Record<string, unknown>>).find((r) => r.id === claimId);
      expect(row).toBeDefined();
      expect(row).toMatchObject({ reconcilable: false, status: 'claimed' });
    });
  }

  /**
   * The sweep meets the same unaskable channels and skips them: no request, and no evidence row. An
   * hourly `misconfigured` row would be a record about our own configuration, not about the write —
   * the ledger is the only honest place for "still unknown" here.
   *
   * 清扫遇到同样的问不了的通道，只跳过：不发请求、也不写证据行。每小时一条 `misconfigured` 记录的是我们
   * 自己的配置，不是那次写 —— 在这里，「结局仍未知」唯一诚实的位置就是账本身。
   */
  it('自动清扫遇到问不了的通道只跳过：零请求、不写证据行、账不动', async () => {
    const post = await seedClaim(TOOL_POST, 'skip-post', 'awaiting_decision');
    const noKey = await seedClaim(TOOL_NO_KEY, 'skip-nokey', 'awaiting_decision');

    const summary = await app.get(AiToolEffectsService).reconcileDueClaims(new Date());

    expect(summary.candidates).toBe(2);
    expect(summary.skippedUnaskable).toBe(2);
    expect(summary.asked).toBe(0);
    expect(target.requests).toHaveLength(0);

    const rows = (await lookupsRepo().find({} as never)) as unknown as Array<{ idempotencyKey: string }>;
    const keys = new Set(rows.map((r) => r.idempotencyKey));
    expect(keys.has(post.key)).toBe(false);
    expect(keys.has(noKey.key)).toBe(false);

    for (const seeded of [post, noKey]) {
      const claim = await claimRow(seeded.id);
      expect(claim.status).toBe('claimed');
      expect(claim.decisionState).toBe('awaiting_decision');
      expect(await releaseRowsFor(seeded.id)).toHaveLength(0);
    }
  });
});
