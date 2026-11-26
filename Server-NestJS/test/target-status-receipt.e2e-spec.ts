// SPDX-License-Identifier: Apache-2.0

/**
 * F-128 — the receipt path, run through a target on **our** side of the line.
 *
 * R-1 made the answer's kind a first-class reading (`current_state` | `receipt`), and the probe records
 * it only when the target declares it. That is enough to *read* a receipt; it is not enough to know the
 * path works end to end. F-128 named the gap: if no target we control ever answers with a receipt, the
 * path is only ever read and never exercised. This case closes it with a controlled target: the
 * real-HTTP stand-in below, which is what a B-path target of ours looks like from here. The sidecar is
 * not one: it is an inbound LLM gateway and offers no write-status channel.
 *
 * **A target we control must answer with a receipt basis.** The status answer of our own service (or of
 * a sidecar we place) carries `basis: "receipt"`, taken from its own acceptance record, so the path is
 * exercised by the thing that can supply the stronger reading. A target outside our control may stay
 * silent; silence remains `null` and is never inferred.
 *
 * What the case pins, in order: the probe sends exactly one read-only `GET` to the target; the answer's
 * `basis` reaches the reconcile result, the evidence row, the lookup read face, and the release
 * decision's off-chain evidence column — all as a **structured field**, so two `not_executed` answers
 * that differ in kind are distinguishable without parsing prose. The last case is the reverse: a target
 * that does not declare a basis is still released. The basis is a label, never a retry gate.
 *
 * Run it alone: `npx jest --config test/jest-e2e.json test/target-status-receipt.e2e-spec.ts`
 *
 * F-128 —— 让收据路径由**我们一侧**的目标真正跑一遍。
 *
 * R-1 把答案的种类做成了正式读数（`current_state` | `receipt`），探针只在目标主动声明时记录它。这只够
 * 「读」到一张收据，不够证明这条路走得通。F-128 点名的缺口是：如果我们控制的目标从不回收据，这条路就
 * 只被读、从未被跑过。本用例用一个受控目标封住它 —— 下面这个真实 HTTP 替身，也就是「我们的 B 路径目标」
 * 在这里的样子。sidecar 不是：它是入站 LLM 网关，不提供写的状态通道。
 *
 * **我们控制的目标必须用收据作答。** 自有服务（或我们放下的 sidecar）的状态应答带 `basis: "receipt"`，
 * 取自它自己的受理记录，于是这条路由能给出更强读数的东西跑过。不在我们控制内的目标仍可沉默；沉默就是
 * `null`，绝不反推。
 *
 * 本用例按顺序钉住：探针对目标只发一次只读 `GET`；答案的 `basis` 依次到达对账结果、证据行、查询读面、
 * 释放决定的链外证据列 —— 全部是**结构化字段**，故两条结论同为 `not_executed`、种类不同的读数无需解析
 * 散文即可区分。最后一个用例是反向：不声明种类的目标照样被释放。种类是标签，永远不是重试闸。
 *
 * 单独跑：`npx jest --config test/jest-e2e.json test/target-status-receipt.e2e-spec.ts`
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
 * The controlled target: a real HTTP server that, like our own services, keeps its own record of the
 * keys it accepted and answers the status query from **that record** (`receipt`) — not from a live
 * object store (`current_state`). Both routes are here so the two kinds can be compared on one wire.
 * A third route answers with no basis at all, standing in for a target that predates the convention.
 *
 * The records are seeded rather than filled by writes: the case is about the answer's kind, not about
 * performing the write first, and a pre-seeded key keeps the reading deterministic.
 *
 * 受控目标：一个真实 HTTP 服务。像我们自己的服务一样，它保留自己「受理过哪些 key」的记录，并用**那份
 * 记录**回答状态查询（`receipt`），而不是读活的对象存储（`current_state`）。两条路由都在这里，两种种类
 * 便可在同一条线上比较。第三条路由完全不带种类，代表先于该约定存在的目标。
 *
 * 记录是预先种下的，而不是先真写一遍：本用例关心答案的种类，不关心先完成那次写；预置的 key 让读数确定。
 */
interface ControlledTarget {
  server: Server;
  base: string;
  /** Requests as the target saw them, in arrival order. / 目标看到的请求，按到达顺序。 */
  requests: Array<{ method: string; path: string; authorization: string | undefined }>;
  /** The target's own acceptance record. / 目标自己的受理记录。 */
  accepted: Set<string>;
  /** The target's live object store. / 目标的活对象存储。 */
  liveObjects: Set<string>;
}

async function startControlledTarget(): Promise<ControlledTarget> {
  const accepted = new Set<string>();
  const liveObjects = new Set<string>();
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

    if (req.method !== 'GET') {
      res.statusCode = 405;
      res.end(JSON.stringify({ error: 'the status query is read-only' }));
      return;
    }

    const answer = (match: RegExpMatchArray | null, basedOn: 'receipt' | 'current_state' | null) => {
      if (!match) return false;
      const key = decodeURIComponent(match[1]);
      const record = basedOn === 'receipt' ? accepted : liveObjects;
      const body: { status: string; basis?: string } = {
        status: record.has(key) ? 'executed' : 'not_executed',
      };
      // Only the two kinds this target can honestly speak from declare a basis; the third route stays
      // silent, which the probe must record as absent rather than guess.
      // 只有本目标能诚实作答的两种才声明种类；第三条路由保持沉默，探针必须记为未声明而不是猜。
      if (basedOn) body.basis = basedOn;
      res.end(JSON.stringify(body));
      return true;
    };

    if (answer(pathname.match(/^\/api\/contracts\/status\/(.+)$/), 'receipt')) return;
    if (answer(pathname.match(/^\/api\/contracts\/status-current\/(.+)$/), 'current_state')) return;
    if (answer(pathname.match(/^\/api\/contracts\/status-no-basis\/(.+)$/), null)) return;

    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'no such path' }));
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as { port: number }).port;
  return { server, base: `http://localhost:${port}/api`, requests, accepted, liveObjects };
}

describe('F-128 the receipt basis, from the controlled target to the release evidence', () => {
  let app: INestApplication;
  let ds: DataSource;
  let target: ControlledTarget;
  let admin: { token: string; id: number };
  let writerId: number;

  const password = 'ReceiptPath123';
  const TOOL_RECEIPT = 'proxy_receipt_create';
  const TOOL_CURRENT = 'proxy_current_state_create';
  const TOOL_SILENT = 'proxy_silent_create';
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

  /** A hold that is past the staleness threshold and still unknown — the state reconcile accepts. */
  async function seedStaleClaim(toolName: string): Promise<{ id: number; key: string }> {
    seq += 1;
    const key = `r1-receipt-${Date.now()}-${seq}`;
    const saved = await claimsRepo().save({
      idempotencyKey: key,
      userId: String(writerId),
      toolName,
      argsHash: '0123456789abcdef',
      status: 'claimed',
      decisionState: 'open',
      claimedAt: new Date(Date.now() - 90 * 60_000),
      attempts: 1,
    });
    return { id: (saved as unknown as { id: number }).id, key };
  }

  const reconcile = (claimId: number) =>
    request(app.getHttpServer())
      .post(`/api/v1/ai/tool-effects/claims/${claimId}/reconcile`)
      .set(authHeader(admin.token));

  const readLookups = (claimId: number) =>
    request(app.getHttpServer())
      .get(`/api/v1/ai/tool-effects/claims/${claimId}/lookups`)
      .set(authHeader(admin.token));

  /**
   * The `claim_release` row a given hold left behind. The cases share one database, so a tool name
   * alone would collect other cases' rows too; the claim id in the detail is the exact key.
   *
   * 给定占位留下的那条 `claim_release` 行。用例共用一个库，光凭工具名会收进别的用例的行；`detail`
   * 里的占位 id 才是精确键。
   */
  async function releaseRowFor(claimId: number): Promise<{ detail: string; releaseLookups: string | null }> {
    const rows = (await auditRepo().find({ where: { action: 'claim_release' } as never })) as unknown as Array<{
      detail: string;
      releaseLookups: string | null;
    }>;
    const mine = rows.filter((r) => r.detail.includes(`write claim #${claimId} `));
    expect(mine).toHaveLength(1);
    return mine[0];
  }

  beforeAll(async () => {
    target = await startControlledTarget();
    // One key was accepted long ago; the keys this case asks about were not. The answer is read from
    // that difference, so `executed` versus `not_executed` comes from the target's own record.
    // 有一个 key 很久以前被受理过；本用例要问的 key 都没有。答案读自这个差别，故 `executed` 与
    // `not_executed` 来自目标自己的记录。
    target.accepted.add('accepted-long-ago');

    app = await createTestApp();
    await app.init();
    ds = app.get(DataSource);

    const writer = await registerUser(app, {
      username: `r1_receipt_writer_${Date.now()}`,
      email: `r1_receipt_writer_${Date.now()}@test.com`,
      password,
      nickname: 'ReceiptWriter',
    });
    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set(authHeader(writer.accessToken))
      .expect(200);
    writerId = (me.body.data as { id: number }).id;

    const adminName = `r1_receipt_admin_${Date.now()}`;
    const reg = await registerUser(app, {
      username: adminName,
      email: `${adminName}@test.com`,
      password,
      nickname: 'ReceiptAdmin',
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
            name: TOOL_RECEIPT,
            description: '建合同（目标按受理记录答状态）',
            method: 'POST',
            path: '/contracts',
            parameters: [],
            riskLevel: 'R3',
            statusPath: 'GET /contracts/status/{key}',
          },
          {
            name: TOOL_CURRENT,
            description: '建合同（目标按当前对象存储答状态）',
            method: 'POST',
            path: '/contracts',
            parameters: [],
            riskLevel: 'R3',
            statusPath: 'GET /contracts/status-current/{key}',
          },
          {
            name: TOOL_SILENT,
            description: '建合同（目标不声明种类）',
            method: 'POST',
            path: '/contracts',
            parameters: [],
            riskLevel: 'R3',
            statusPath: 'GET /contracts/status-no-basis/{key}',
          },
        ],
      }),
    );
    await Promise.all([
      waitUntilRegistered(TOOL_RECEIPT),
      waitUntilRegistered(TOOL_CURRENT),
      waitUntilRegistered(TOOL_SILENT),
    ]);
  }, 120_000);

  afterAll(async () => {
    (target.server as unknown as { closeAllConnections?: () => void }).closeAllConnections?.();
    await new Promise<void>((resolve) => target.server.close(() => resolve()));
    await app.close();
  });

  it('受控目标回 receipt：一次 GET → 对账结果 → 读数行 → 读面 → 释放证据，basis 一路可见', async () => {
    const { id: claimId, key } = await seedStaleClaim(TOOL_RECEIPT);

    const res = await reconcile(claimId).expect(200);
    expect(res.body.data).toMatchObject({
      outcome: 'reconciled',
      conclusion: 'not_executed',
      claimStatus: 'released',
    });
    // Step 1 — the probe's reading, as the reconcile result carries it.
    // 第一步 —— 探针的读数，由对账结果带出。
    expect(res.body.data.evidence).toMatchObject({ conclusion: 'not_executed', basis: 'receipt' });

    // One read-only query, nothing else. / 一次只读查询，没有别的。
    const hits = target.requests.filter((r) => r.path === `/api/contracts/status/${encodeURIComponent(key)}`);
    expect(hits).toHaveLength(1);
    expect(hits[0].method).toBe('GET');
    // The query carried the writer's delegated identity, not the administrator's.
    // 查询携带的是写入者的委托身份，不是管理员的。
    expect(hits[0].authorization).toMatch(/^Bearer /);

    // Step 2 — the evidence row. / 第二步 —— 证据行。
    const [lookup] = await lookupsRepo().find({ where: { idempotencyKey: key } });
    expect(lookup).toMatchObject({
      toolName: TOOL_RECEIPT,
      conclusion: 'not_executed',
      reason: null,
      basis: 'receipt',
      queryMethod: 'GET',
      asUserId: String(writerId),
      lookedUpBy: String(admin.id),
    });

    // Step 3 — the read face. / 第三步 —— 读面。
    const read = await readLookups(claimId).expect(200);
    const row = (read.body.data as { items: Array<Record<string, unknown>> }).items[0];
    expect(row).toMatchObject({ conclusion: 'not_executed', basis: 'receipt' });

    // Step 4 — the release decision's off-chain evidence column. / 第四步 —— 释放决定的链外证据列。
    const release = await releaseRowFor(claimId);
    expect(release.detail).toContain('origin: target answered not_executed');
    const evidence = JSON.parse(release.releaseLookups!) as {
      count: number;
      items: Array<{ id: number; conclusion: string; basis: string }>;
    };
    expect(evidence.count).toBe(1);
    expect(evidence.items[0]).toMatchObject({
      id: (lookup as unknown as { id: number }).id,
      conclusion: 'not_executed',
      basis: 'receipt',
    });

    // The same endpoint still answers `executed` for a key the target accepted — the conclusion comes
    // from the record, not from a hard-coded word.
    // 同一个端点对目标受理过的 key 仍答 `executed` —— 结论读自记录，不是写死的词。
    const probe = app.get(ProxyTargetStatusProbe);
    const accepted = await probe.lookup(TOOL_RECEIPT, 'accepted-long-ago', String(writerId));
    expect(accepted).toMatchObject({ conclusion: 'executed', basis: 'receipt' });
  });

  /**
   * R-1's own criterion: two `not_executed` answers that differ in kind — a receipt from the target's
   * acceptance record versus a current-state read — are distinguishable **without parsing prose**. The
   * assertions below touch only the structured `basis` field on each surface; the prose is never read.
   *
   * R-1 自己的判据：两条同为 `not_executed`、种类不同的答案 —— 一张来自目标受理记录的收据，一次当前
   * 状态读数 —— 无需解析散文即可区分。下面的断言只碰每一面上的结构化 `basis` 字段，从不读散文。
   */
  it('同为 not_executed：receipt 与 current_state 靠结构化字段可分辨（读面与释放证据皆然）', async () => {
    const receipt = await seedStaleClaim(TOOL_RECEIPT);
    const current = await seedStaleClaim(TOOL_CURRENT);

    await reconcile(receipt.id).expect(200);
    await reconcile(current.id).expect(200);

    const receiptRead = (await readLookups(receipt.id).expect(200)).body.data as {
      items: Array<{ conclusion: string; basis: string }>;
    };
    const currentRead = (await readLookups(current.id).expect(200)).body.data as {
      items: Array<{ conclusion: string; basis: string }>;
    };
    // Same verdict word, different kind — the distinction is a field, not a sentence.
    // 同一个结论词、不同的种类 —— 区分是一个字段，不是一句话。
    expect(receiptRead.items[0].conclusion).toBe('not_executed');
    expect(currentRead.items[0].conclusion).toBe('not_executed');
    expect(receiptRead.items[0].basis).toBe('receipt');
    expect(currentRead.items[0].basis).toBe('current_state');

    const evidenceFor = async (claimId: number) => {
      const release = await releaseRowFor(claimId);
      return (JSON.parse(release.releaseLookups!) as {
        items: Array<{ conclusion: string; basis: string }>;
      }).items[0];
    };
    expect(await evidenceFor(receipt.id)).toMatchObject({
      conclusion: 'not_executed',
      basis: 'receipt',
    });
    expect(await evidenceFor(current.id)).toMatchObject({
      conclusion: 'not_executed',
      basis: 'current_state',
    });
  });

  /**
   * The basis is a label, not a gate (R-1's reverse criterion, now on the real wire): a target that
   * does not declare one still gets its `not_executed` believed, and the hold is released. Gating on a
   * receipt would make every target without a receipt endpoint permanently unreleasable (F-84).
   *
   * 种类是标签，不是闸（R-1 的反向判据，现在走真实链路）：不声明种类的目标，其 `not_executed` 照样
   * 被采信，占位照样被释放。要求收据才放行，会让所有没有收据端点的目标永远无法释放（F-84）。
   */
  it('反向：不声明种类的目标仍被释放 —— 种类不是重试闸', async () => {
    const { id: claimId, key } = await seedStaleClaim(TOOL_SILENT);

    const res = await reconcile(claimId).expect(200);
    expect(res.body.data).toMatchObject({
      outcome: 'reconciled',
      conclusion: 'not_executed',
      claimStatus: 'released',
    });

    const [lookup] = await lookupsRepo().find({ where: { idempotencyKey: key } });
    // Not declared ⇒ stored as absent. / 未声明 ⇒ 存成缺省。
    expect((lookup as unknown as { basis: string | null }).basis ?? null).toBeNull();

    const read = await readLookups(claimId).expect(200);
    // The read face never returns `null`; an undeclared basis reads `unknown`, never a guess.
    // 读面从不返回 `null`；未声明读作 `unknown`，绝不猜。
    expect((read.body.data as { items: Array<{ basis: string }> }).items[0].basis).toBe('unknown');

    const release = await releaseRowFor(claimId);
    expect(
      (JSON.parse(release.releaseLookups!) as { items: Array<{ basis: string }> }).items[0].basis,
    ).toBe('unknown');
  });
});
