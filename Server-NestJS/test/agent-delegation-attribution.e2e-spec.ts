// SPDX-License-Identifier: Apache-2.0

import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { createTestApp, registerUser, loginAs, authHeader } from './helpers';
import { AiAuditLog } from '../src/ai/audit/ai-audit-log.entity';
import { AuditService } from '../src/ai/audit/audit.service';
import { AiService } from '../src/ai/ai.service';
import { actorContext } from '../src/ai/actor-context';
import { HeadlessKeysService } from '../src/headless/headless-keys.service';

/**
 * 读完整条 SSE 流并返回其原文。本仓 e2e 此前没有消费 SSE 的写法，故就地定义：
 * superagent 对 `text/event-stream` 没有内建解析，须 `buffer(true)` + 自定义 parser，
 * parser 的回调值即 `res.body`。
 */
function postSse(
  app: INestApplication,
  path: string,
  token: string,
  body: Record<string, unknown>,
): Promise<string> {
  return request(app.getHttpServer())
    .post(path)
    .set(authHeader(token))
    .send(body)
    .buffer(true)
    .parse((response, callback) => {
      let data = '';
      response.on('data', (chunk: Buffer) => {
        data += chunk.toString('utf8');
      });
      response.on('end', () => callback(null, data));
    })
    .then((res) => res.body as string);
}

/**
 * §22.19 未验证项：Agent / 委托链路归责（`agentId` / `callerAgentId` / `parentActionId`）。
 *
 * roadmap 记的是「**列在、无写入方、真实流量未验证**」，并注明「**不是已证缺陷，别当缺陷修**」。
 * 本套件最初只做**验证**（不改产品码），把「未验证」变成「已观测」。
 *
 * **2026-10-01 更动**：§22.19 AU-2 余项落地（子代理 / plan 路径补 per-tool 审计落点，
 * `parentActionId` 一并补）⇒ ② 由「观测有/无」改为**断言已落地且归责字段齐全**，
 * ③ 由「断言恒 null」改为**钉住新形状**。它们此前钉的正是本刀要改掉的那个现状。
 *
 * **② 走真实路径**：不用「直接 new orchestrator」这种间接测法，而是经 `AiService.chat()` 完整走
 * `chatImpl` 的 delegate 分支 —— 因此用的是 `ai.service` **真正传下去的那个 `readOnlyExecutor`**
 * （`ToolExecutionService.executeAgentRead`）。免 LLM 触发：消息命中 `WEEK_PLAN_SKILL` 的触发词且不含动作动词
 * （`ai.service.ts` 的 `actionVerbs` 守卫）→ `intent='delegate'`，零 LLM 成本且不依赖任何 key。
 *
 * **⚠ 2026-10-01 更正：本套件此前那个 provider 替身从没生效过。** 原先 `jest.spyOn(app.get(
 * LlmProviderFactory), 'getProvider')` 换掉的是 **DI 里那个实例**，而 `AiService` 走的是
 * `ai.module.ts` 工厂里**手工 `new` 出来的另一个实例**（供 `ProviderRoutingService` 用）——
 * 实测：整轮跑完 `getProvider` 被调用 **0 次**。也就是说这些用例一直是靠**确认链尾的确定性
 * DemoProvider**（`.env.test` 无任何 API key）在跑，替身是**装饰**。本刀把它删掉，并在头注写下
 * 真实前提：**本套件不控 provider，走的是部署在无 key 时的同一套确定性路径**。
 * （同类前科：JV-14 那种「看起来在验证 X、其实从未验证过 X」的断言。）
 *
 * 由此带来的一条**必须记住的前提**：这些用例能产出子代理工具行，靠的是 DemoProvider 的确定性
 * 意图表对同一句话给出工具调用。它若变，本套件会红——那正是想要的信号，不是 flake。
 */
describe('§22.19 委托链路归责验证（agentId / callerAgentId / parentActionId）', () => {
  let app: INestApplication;
  let ds: DataSource;
  let auditService: AuditService;
  let aiService: AiService;
  let ownerId: string;

  beforeAll(async () => {
    app = await createTestApp();
    ds = app.get(DataSource);
    auditService = app.get(AuditService);
    aiService = app.get(AiService);

    const owner = await registerUser(app, {
      username: 'delegate_owner',
      email: 'delegateowner@test.com',
      password: 'DelegateOwner1',
      nickname: 'DelegateOwner',
    });
    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set(authHeader(owner.accessToken))
      .expect(200);
    ownerId = String((me.body.data as { id: number }).id);
  });

  afterAll(async () => {
    await app.close();
  });

  it('① 机制层：actorContext 中的 agentId / callerAgentId 会被 AuditService.log 落进行', async () => {
    await actorContext.run(
      { agentId: 'calendar', callerAgentId: 'orchestrator', businessIntent: 'sub-agent' },
      () =>
        auditService.log({
          userId: '91001',
          action: 'tool_call',
          detail: 'probe-mechanism({})',
          isError: false,
        }),
    );

    const rows = await ds
      .getRepository(AiAuditLog)
      .find({ where: { userId: '91001' }, order: { id: 'DESC' } });
    expect(rows.length).toBeGreaterThan(0);
    // 机制结论：有值就落（否则说明 audit.service 的 actorContext fallback 没生效）
    expect(rows[0].agentId).toBe('calendar');
    expect(rows[0].callerAgentId).toBe('orchestrator');
  });

  it('② 真实路径：委托跑完后工具行落库，且归责字段齐全（§22.19 AU-2 已落地）', async () => {
    // 不换 provider（换不到，见文件头注）：本用例跑的是无 key 部署下的确定性 DemoProvider 路径。
    // 真实入口会先设好请求级身份（sessionId / username / source）。直接调 service 就绕过了这一层，
    // 观测到的会是「没有父上下文可继承」——那不是本用例要证的东西。
    // 「周计划」命中 WEEK_PLAN_SKILL 触发词、且不含 actionVerbs → intent=delegate，零 LLM
    const res = await actorContext.run(
      { sessionId: 'sess-e2e-1', username: 'delegate_owner', source: 'web' },
      () => aiService.chat(ownerId, { message: '周计划' }),
    );

    expect(res.reply).toBeTruthy();

    // ⚠ 对话级行是 **fire-and-forget**（`auditService.log` 在 chatImpl 尾部不被 await）→ chat() 返回时
    // 它可能尚未落库。必须轮询到「工具行 + 对话级行都在」，否则会观测到由测试时序造出的假缺陷
    //（本日另一条线正因夹具问题报过一个不存在的缺陷，此处引以为戒）。
    const repo = ds.getRepository(AiAuditLog);
    const deadline = Date.now() + 3000;
    let rows: AiAuditLog[] = [];
    while (Date.now() < deadline) {
      rows = await repo.find({ where: { userId: ownerId }, order: { id: 'ASC' } });
      if (rows.some((r) => r.action === 'tool_call') && rows.some((r) => r.action === 'delegate')) break;
      await new Promise((r) => setTimeout(r, 50));
    }

    const toolRows = rows.filter((r) => r.action === 'tool_call');
    console.log(
      'OBSERVE-② 委托路径审计：',
      JSON.stringify({
        审计行数: rows.length,
        actions: rows.map((r) => r.action),
        工具行数: toolRows.length,
      }),
    );

    // 本刀之前这里是 **0 行**：子代理确实执行了只读工具，审计里却什么都没有
    expect(toolRows.length).toBeGreaterThan(0);

    const toolRow = toolRows[0];
    expect(['calendar', 'stats', 'organizer']).toContain(toolRow.agentId);
    // ACT-1 的兑现面：子代理作用域**继承**父上下文 ⇒ 身份链另外三段不再丢
    expect(toolRow.sessionId).toBe('sess-e2e-1');
    expect(toolRow.username).toBe('delegate_owner');
    expect(toolRow.source).toBe('web');
    // 这一段只在**父本身是 agent**（嵌套委托）时才有值。本用例的父是一次普通网页轮次，
    // 故如实为 null——把它断言成「非 null」是在规定语义，不是观测语义（机制层见用例①）。
    expect(toolRow.callerAgentId).toBeNull();

    // §22.19 AU-2：整轮一次查询可取回 —— 工具行与对话级行共用同一个非空句柄
    expect(toolRow.parentActionId).toBeTruthy();
    expect(rows.find((r) => r.action === 'delegate')?.parentActionId).toBe(toolRow.parentActionId);
    expect(rows.every((r) => r.parentActionId === toolRow.parentActionId)).toBe(true);
  });

  it('③ §22.19 AU-2：parentActionId 从此有写入方 —— 钉住它的形状，并说清它是什么', async () => {
    const rows = await ds.getRepository(AiAuditLog).find({ order: { id: 'ASC' }, take: 300 });
    const withHandle = rows.filter((r) => r.parentActionId != null);
    console.log(
      'OBSERVE-③ parentActionId：',
      JSON.stringify({
        抽样行数: rows.length,
        非null行数: withHandle.length,
        样例值: withHandle[0]?.parentActionId ?? null,
      }),
    );
    // 本刀之前全仓无写入方、恒 null（旧断言 `toBe(0)` 钉的正是那个现状，本刀把它改掉）。
    // 本刀之后：delegate / plan 轮次的行带同一个**预分配**句柄。它**不是行 id** ——
    // 全仓无消费方解引用它（2026-10-01 核实：只做原样透传 + 进哈希载荷），它的职责是把
    // 「一次委托产生的所有行」归成一组。
    expect(withHandle.length).toBeGreaterThan(0);
    expect(withHandle.every((r) => typeof r.parentActionId === 'string')).toBe(true);
  });

  /**
   * §22.19 ① 多入口维度：上面三个用例只走 `AiService.chat()` 单入口。本块把同一条委托消息
   * （`周计划`，命中 WEEK_PLAN_SKILL）**从每个真实入口**送一遍，逐入口交代两件事：
   *   ① 这个入口**能不能**起始一次委托；② 能的话，归责字段各自长什么样（尤其身份从哪来）。
   *
   * 入口清单取自代码而非抄文档：`actorContext.run(...)` 的四处入口 + 一条**结构上不是对话入口**的
   * 路径（MCP 是工具出口）。
   *
   * **2026-10-02 更动**：技能短路收进 `chatStreamImpl`（触发词单源化）⇒ **流式端点从「不能委托」
   * 变成「能」**，用例④随之翻面。MCP 那条不变，它本就不做意图分类。
   */
  describe('§22.19 ① 多入口维度：委托归责在哪些入口可观测', () => {
    let adminToken: string;
    let adminUserId: number;
    let headlessKey: string;
    let headlessOwnerId: number;
    let headlessOwnerUsername: string;

    const DELEGATE_MSG = '周计划';
    const SUB_AGENTS = ['calendar', 'stats', 'organizer'];

    /** 每个用例一个全新用户：审计行按 userId 取，避免上一用例的委托行混进来。 */
    let seq = 0;
    async function freshUser(): Promise<{ token: string; id: number; username: string }> {
      seq += 1;
      const username = `delegate_multi_${seq}`;
      const u = await registerUser(app, {
        username,
        email: `delegatemulti${seq}@test.com`,
        password: 'DelegateMulti1',
        nickname: `DelegateMulti${seq}`,
      });
      const me = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set(authHeader(u.accessToken))
        .expect(200);
      return { token: u.accessToken, id: Number((me.body.data as { id: number }).id), username };
    }

    /** 轮询到「工具行 + 对话级行都在」（对话级行是 fire-and-forget，理由同用例②）。 */
    async function delegationRows(userId: number): Promise<AiAuditLog[]> {
      const repo = ds.getRepository(AiAuditLog);
      const deadline = Date.now() + 3000;
      let rows: AiAuditLog[] = [];
      while (Date.now() < deadline) {
        rows = await repo.find({ where: { userId: String(userId) }, order: { id: 'ASC' } });
        if (rows.some((r) => r.action === 'tool_call') && rows.some((r) => r.action === 'delegate')) break;
        await new Promise((r) => setTimeout(r, 50));
      }
      return rows;
    }

    /** 能委托的入口共用这段：这一轮真委托了、归责字段齐、整轮一个句柄。 */
    function expectDelegation(rows: AiAuditLog[], source: string): AiAuditLog[] {
      const toolRows = rows.filter((r) => r.action === 'tool_call');
      expect(toolRows.length).toBeGreaterThan(0);
      expect(SUB_AGENTS).toContain(toolRows[0].agentId);
      expect(toolRows[0].source).toBe(source);
      const handle = toolRows[0].parentActionId;
      expect(handle).toBeTruthy();
      expect(rows.every((r) => r.parentActionId === handle)).toBe(true);
      return toolRows;
    }

    beforeAll(async () => {
      const regAdmin = await registerUser(app, {
        username: 'delegate_multi_admin',
        email: 'delegatemultiadmin@test.com',
        password: 'DelegateMultiA1',
        nickname: 'DelegateMultiAdmin',
      });
      const meAdmin = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set(authHeader(regAdmin.accessToken))
        .expect(200);
      adminUserId = Number((meAdmin.body.data as { id: number }).id);
      await ds.getRepository('users').update(adminUserId, { role: 'admin' });
      adminToken = (await loginAs(app, 'delegate_multi_admin', 'DelegateMultiA1')).accessToken;

      // headless 的属主用一个普通用户（不是 admin 默认），使该入口的 userId 归属可判读
      const owner = await freshUser();
      const created = await app.get(HeadlessKeysService).create({
        name: 'delegate-integration',
        ownerUserId: owner.id,
        quotaPerDay: 100,
      });
      headlessKey = created.apiKey;
      headlessOwnerId = owner.id;
      headlessOwnerUsername = owner.username;
    });

    it('① REST `/ai/chat`（web 首方入口）—— 能委托，源标 web，人类会话身份齐全', async () => {
      const u = await freshUser();
      await request(app.getHttpServer())
        .post('/api/v1/ai/chat')
        .set(authHeader(u.token))
        .send({ message: DELEGATE_MSG })
        .expect(200);

      const toolRows = expectDelegation(await delegationRows(u.id), 'web');
      expect(toolRows[0].username).toBe(u.username);
      expect(toolRows[0].sessionId).toBeTruthy();
      // web 的父上下文里没有 agent 身份 ⇒ callerAgentId 如实为 null（同用例②）
      expect(toolRows[0].callerAgentId).toBeNull();
    });

    it('② 管理端 `/admin/ai/chat` —— 能委托（adminMode 只关导航，不关意图路由），源标 admin', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/admin/ai/chat')
        .set(authHeader(adminToken))
        .send({ message: DELEGATE_MSG })
        .expect(200);

      const toolRows = expectDelegation(await delegationRows(adminUserId), 'admin');
      expect(toolRows[0].username).toBe('delegate_multi_admin');
      expect(toolRows[0].sessionId).toBeTruthy();
      expect(toolRows[0].callerAgentId).toBeNull();
    });

    it('③ headless `/headless/chat` —— 能委托，但身份是**集成 key**，不是人类会话', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/headless/chat')
        .set('x-api-key', headlessKey)
        .send({ message: DELEGATE_MSG })
        .expect(200);

      const rows = await delegationRows(headlessOwnerId);
      const toolRows = expectDelegation(rows, 'headless');
      // 该入口的父上下文是 `{agentId: key 名, source:'headless'}`（无人类会话）⇒
      // 子代理由这个**集成**调用，故 callerAgentId 有值——这是三个入口里唯一能观测到嵌套归责的。
      expect(toolRows[0].callerAgentId).toBe('delegate-integration');
      // sessionId —— **设计上没有**：API key 认证不存在 JWT 会话，无处可取。
      expect(toolRows[0].sessionId).toBeNull();
      // username —— **取属主**（与 userId 同一主体）。此前这一列为空：headless 入口只给了 userId，
      // 独立治理库（无 users 表）因此显示不出「谁做的」。2026-10-01 补上，本行改为断言它**有值且等于属主**。
      expect(toolRows[0].username).toBe(headlessOwnerUsername);
      // 对话级行也在 key 身份下：agentId = key 名
      expect(rows.find((r) => r.action === 'delegate')?.agentId).toBe('delegate-integration');
    });

    it('④ SSE `/ai/chat/stream` —— **也能**委托（2026-10-02 起）：能力不再取决于走哪条端点', async () => {
      const u = await freshUser();
      // 同一条消息、同一套 provider 路径；只有入口不同
      const body = await postSse(app, '/api/v1/ai/chat/stream', u.token, { message: DELEGATE_MSG });
      // 流确实跑完并产出了回复 —— 否则下面的断言会是被「压根没跑」骗过的假绿
      expect(body).toContain('event: done');

      // 本刀之前这里断言的是「没有 delegate / tool_call 行」——那时意图路由只在非流式端点，
      // 流式路径整段不分类。路由收进 Runtime 后，它应当是**和第①条一样的形状**。
      const toolRows = expectDelegation(await delegationRows(u.id), 'web');
      expect(toolRows[0].username).toBe(u.username);
      expect(toolRows[0].sessionId).toBeTruthy();
    });

    it('⑤ MCP `/mcp` tools/call —— 工具出口，不是对话入口：结构上无法起始委托', async () => {
      const u = await freshUser();
      await request(app.getHttpServer())
        .post('/api/v1/mcp')
        .set(authHeader(u.token))
        .send({
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'tools/call',
          params: { name: 'count_events_by_status', arguments: {} },
        })
        .expect(201);

      const rows = await ds
        .getRepository(AiAuditLog)
        .find({ where: { userId: String(u.id) }, order: { id: 'ASC' } });
      // 本断言的用途是**绊线**：MCP 走 executeToolForExternal，从不调用 AiService.chat，
      // 因此没有任何意图分类、也就没有委托行。将来谁把意图路由接进 MCP，这里会红。
      expect(rows.filter((r) => ['delegate', 'plan', 'analyze'].includes(r.action))).toHaveLength(0);
    });
  });
});
