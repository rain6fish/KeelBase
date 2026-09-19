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
 * 本套件只做**验证**（不改产品码），把「未验证」变成「已观测」，并如实写下观测到的边界。
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

  it('② 真实路径：AiService.chat 委托跑完后，库里有哪些审计行（含是否带 agentId）', async () => {
    const factory = app.get(LlmProviderFactory);
    const spy = jest
      .spyOn(factory, 'getProvider')
      .mockReturnValue(makeProvider() as never);

    // 「周计划」命中 WEEK_PLAN_SKILL 触发词、且不含 actionVerbs → intent=delegate，零 LLM
    const res = await aiService.chat(ownerId, { message: '周计划' });

    expect(res.reply).toBeTruthy();

    // ⚠ 审计是 **fire-and-forget**（`auditService.log` 在 chatImpl 里不被 await）→ chat() 返回时
    // 行可能尚未落库。**必须轮询等待**，否则会观测到「0 行」这种由测试时序造出的假缺陷
    //（本日另一条线正因夹具问题报过一个不存在的缺陷，此处引以为戒）。
    const repo = ds.getRepository(AiAuditLog);
    const deadline = Date.now() + 3000;
    let rows: AiAuditLog[] = [];
    while (Date.now() < deadline) {
      rows = await repo.find({ where: { userId: ownerId }, order: { id: 'ASC' } });
      if (rows.length > 0) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    const withAgent = rows.filter((r) => r.agentId != null);

    // 观测（不是规定结论）：本用例的价值在这一行输出，别只断言不变量
    console.log(
      'OBSERVE-② 委托路径审计：',
      JSON.stringify({
        审计行数: rows.length,
        actions: rows.map((r) => r.action),
        带agentId的行数: withAgent.length,
      }),
    );

    // 不变量（避免假绿）：要么一行 agentId 都没有（无落点），要么每行都有且正确。
    expect(withAgent.length === 0 || withAgent.length === rows.length).toBe(true);
    if (withAgent.length > 0) {
      expect(withAgent.every((r) => r.callerAgentId != null)).toBe(true);
    }

    spy.mockRestore();
  });

  it('③ 边界层：parentActionId 全仓无调用方赋值 —— 断言其现状（避免「列在」被读成「已生效」）', async () => {
    const rows = await ds.getRepository(AiAuditLog).find({ order: { id: 'ASC' }, take: 300 });
    const nonNull = rows.filter((r) => r.parentActionId != null).length;
    console.log(
      'OBSERVE-③ parentActionId：',
      JSON.stringify({ 抽样行数: rows.length, 非null行数: nonNull }),
    );
    // 现状：没有任何写入方 → 恒为 null。此断言把边界钉住：
    // 一旦有人补上写入方，本用例会立刻失败并提醒「该更新 §22.19 的结论了」。
    expect(nonNull).toBe(0);
  });
});
