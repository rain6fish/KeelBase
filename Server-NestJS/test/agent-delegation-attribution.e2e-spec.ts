// SPDX-License-Identifier: Apache-2.0

import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { createTestApp, registerUser, authHeader } from './helpers';
import { AiAuditLog } from '../src/ai/audit/ai-audit-log.entity';
import { AuditService } from '../src/ai/audit/audit.service';
import { AiService } from '../src/ai/ai.service';
import { actorContext } from '../src/ai/actor-context';
import { LlmProviderFactory } from '../src/ai/providers/provider-factory';

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
 * 夹具纪律（教训来自本日另一条线的假缺陷）：mock provider 只做**最少**的事——子代理首轮发一个
 * 该子代理**确实持有**的只读工具（`count_events_by_status`，calendar/stats/organizer 三者皆有），
 * 其余轮次返回纯文本。不注入任何审计行为，避免把结论做成夹具的产物。
 */
describe('§22.19 委托链路归责验证（agentId / callerAgentId / parentActionId）', () => {
  let app: INestApplication;
  let ds: DataSource;
  let auditService: AuditService;
  let aiService: AiService;
  let ownerId: string;

  /** 确定性 provider：仅首轮发一个只读工具调用，其余返回文本；不触网、不看 key */
  const makeProvider = () => {
    let call = 0;
    return {
      name: 'mock',
      availableModels: ['mock-model'],
      generate: jest.fn(async () => {
        call += 1;
        if (call === 1) {
          return {
            content: '',
            toolCalls: [
              { id: 'call-1', name: 'count_events_by_status', arguments: '{}' },
            ],
          };
        }
        return { content: '子代理结果' };
      }),
    };
  };

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
    const factory = app.get(LlmProviderFactory);
    const spy = jest
      .spyOn(factory, 'getProvider')
      .mockReturnValue(makeProvider() as never);

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

    spy.mockRestore();
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
});
