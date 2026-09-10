// SPDX-License-Identifier: Apache-2.0

import { INestApplication } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import request from 'supertest';
import { createTestApp, registerUser, authHeader } from './helpers';
import { AiService } from '../src/ai/ai.service';
import { AuthorizationDeniedError } from '../src/ai/interfaces/tool.interface';
import { AiToolEffectsService } from '../src/ai/tool-effects/ai-tool-effects.service';
import { AiToolSideEffect } from '../src/ai/tool-effects/ai-tool-side-effect.entity';

/**
 * A2「AI CRM 作 Business Execution Trust 证明器——失败路径场景化」（Enterprise Proof 证据）。
 *
 * 确定性（无 LLM）：真实 app + 真实 REST/治理层，把 CRM「失败也安全」的承诺固化为常绿证据。
 * 与既有套件不重复——crm.e2e 只测越权「读」(403)；golden-application 只测 happy path（critical 风险）；
 * cross-entry 只测 MCP/直调 deny；revoke/confirmation 语义另有专测。本套件补 CRM 语境下的缺口：
 *   ① 越权「写」（子资源：订单/跟进/任务/风险/机会/联系人）→ 404 拒绝且零副作用（不产生任何行）
 *   ② 越权「写」（客户本体 PATCH/DELETE）→ 403（CASL 行级）且数据未被篡改/未被删
 *   ③ R5 危险动作（delete_customer 会级联删除）经治理层阻断 → 客户实体零变更（不级联删）
 *   ④ 风险分析边界：低数据客户 → 确定 low；单笔小额逾期 → medium（不崩、理由可解释）
 *   ⑤ 重复请求幂等（KB-4 duplicate，CRM 语境）：同会话同参数 AI 跟进任务登记两次 → 归并同一副作用（不产生重复可撤锚）
 *   ⑥ 部分失败（KB-4 partial，CRM 语境）：会话级批量撤销先单撤一条 → 汇总 {revoked,skipped} 如实 + CRM 详情可见性递减
 *   ⑦ 撤销诚实（KB-4 unknown 边界，CRM 语境）：撤销后 CRM 详情不可见（软删）+ 再撤幂等成功（不谎报状态）
 * KB-4 的 timeout / 补偿失败 依赖外部目标系统（proxy），CRM 本地实体无此路径，由 failure-path/proxy-bridge 覆盖。
 */
describe('AI CRM 失败/拒绝路径（A2 Trust 证明器）', () => {
  let app: INestApplication;
  let ds: DataSource;
  let aiService: AiService;
  let effectsService: AiToolEffectsService;
  let effectsRepo: Repository<AiToolSideEffect>;
  let tokenA: string;
  let tokenB: string;
  let userAId: number;

  async function createCustomer(
    token: string,
    name: string,
    extra: Record<string, unknown> = {},
  ): Promise<number> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/crm/customers')
      .set(authHeader(token))
      .send({ name, ...extra })
      .expect(201);
    return (res.body.data as { id: number }).id;
  }

  async function createTask(token: string, customerId: number, title: string): Promise<number> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/crm/tasks')
      .set(authHeader(token))
      .send({ customerId, title })
      .expect(201);
    return (res.body.data as { id: number }).id;
  }

  async function tasksOfCustomer(token: string, customerId: number): Promise<unknown[]> {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/crm/customers/${customerId}`)
      .set(authHeader(token))
      .expect(200);
    return (res.body.data as { tasks: unknown[] }).tasks;
  }

  beforeAll(async () => {
    app = await createTestApp();
    ds = app.get(DataSource);
    aiService = app.get(AiService);
    effectsService = app.get(AiToolEffectsService);
    effectsRepo = ds.getRepository(AiToolSideEffect);

    const a = await registerUser(app, {
      username: 'a2_crm_a',
      email: 'a2_crm_a@test.com',
      password: 'A2CrmA1234',
      nickname: 'A2CrmA',
    });
    const b = await registerUser(app, {
      username: 'a2_crm_b',
      email: 'a2_crm_b@test.com',
      password: 'A2CrmB1234',
      nickname: 'A2CrmB',
    });
    tokenA = a.accessToken;
    tokenB = b.accessToken;

    const meA = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set(authHeader(tokenA))
      .expect(200);
    userAId = (meA.body.data as { id: number }).id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('① 越权写：B 对 A 的客户发起子资源写 → 404（拒绝且不暴露存在性）+ 零副作用', async () => {
    const id = await createCustomer(tokenA, '越权写目标客户');

    // 六类子资源写：均须被拒（`_assertCustomerOwner` 按 userId 归属校验 → 404，非 403，避免枚举他人客户）
    const writes = [
      { label: '订单', run: () => request(app.getHttpServer()).post(`/api/v1/crm/customers/${id}/orders`).set(authHeader(tokenB)).send({ amount: 9999 }) },
      { label: '跟进', run: () => request(app.getHttpServer()).post(`/api/v1/crm/customers/${id}/activities`).set(authHeader(tokenB)).send({ summary: '越权跟进' }) },
      { label: '任务', run: () => request(app.getHttpServer()).post('/api/v1/crm/tasks').set(authHeader(tokenB)).send({ customerId: id, title: '越权任务' }) },
      { label: '风险', run: () => request(app.getHttpServer()).post(`/api/v1/crm/customers/${id}/risks`).set(authHeader(tokenB)).send({ reason: '越权风险' }) },
      { label: '机会', run: () => request(app.getHttpServer()).post(`/api/v1/crm/customers/${id}/opportunities`).set(authHeader(tokenB)).send({ name: '越权机会', amount: 1000 }) },
      { label: '联系人', run: () => request(app.getHttpServer()).post(`/api/v1/crm/customers/${id}/contacts`).set(authHeader(tokenB)).send({ name: '越权联系人' }) },
    ];
    for (const w of writes) {
      const res = await w.run();
      // 断言形状含 label，失败信息可定位到具体子资源
      expect({ label: w.label, status: res.status }).toEqual({ label: w.label, status: 404 });
    }

    // 零副作用：A 详情聚合下全部子资源为空（越权写未产生任何记录）
    const detail = await request(app.getHttpServer())
      .get(`/api/v1/crm/customers/${id}`)
      .set(authHeader(tokenA))
      .expect(200);
    const d = detail.body.data as Record<string, unknown[]>;
    for (const key of ['orders', 'activities', 'tasks', 'risks', 'opportunities', 'contacts']) {
      expect({ key, len: d[key].length }).toEqual({ key, len: 0 });
    }
    // DB 直证：无订单/任务行落库
    expect(await ds.getRepository('CrmOrder').count({ where: { customerId: id } })).toBe(0);
    expect(await ds.getRepository('CrmTask').count({ where: { customerId: id } })).toBe(0);
  });

  it('② 越权写：B PATCH/DELETE A 的客户 → 403（CASL 行级）+ 数据未被篡改/未被删', async () => {
    const name = '越权改删目标客户';
    const id = await createCustomer(tokenA, name);

    await request(app.getHttpServer())
      .patch(`/api/v1/crm/customers/${id}`)
      .set(authHeader(tokenB))
      .send({ name: '被篡改' })
      .expect(403);
    await request(app.getHttpServer())
      .delete(`/api/v1/crm/customers/${id}`)
      .set(authHeader(tokenB))
      .expect(403);

    // 客户名未被篡改、未被软删（本人仍可读且内容不变）
    const detail = await request(app.getHttpServer())
      .get(`/api/v1/crm/customers/${id}`)
      .set(authHeader(tokenA))
      .expect(200);
    expect((detail.body.data as { customer: { name: string } }).customer.name).toBe(name);
  });

  it('③ R5 阻断：delete_customer 经治理层被拒 → 依据 risk_policy + 客户实体零变更（不级联删）', async () => {
    const id = await createCustomer(tokenA, 'R5 阻断目标客户');
    // 造一条订单：证明 R5 被阻断后连子资源也未受影响（本工具语义为级联删除）
    await request(app.getHttpServer())
      .post(`/api/v1/crm/customers/${id}/orders`)
      .set(authHeader(tokenA))
      .send({ amount: 500000 })
      .expect(201);

    let denied: AuthorizationDeniedError | undefined;
    try {
      await aiService.executeToolForExternal(
        'delete_customer',
        { customerId: id, reason: 'A2 演示' },
        String(userAId),
      );
    } catch (e) {
      denied = e as AuthorizationDeniedError;
    }
    // 拒绝确实发生 + 结构化依据为 risk_policy（R5 不可逆/外部动作 → 阻断）
    expect(denied).toBeDefined();
    expect(denied!.reasons[0]?.name).toBe('risk_policy');
    expect(denied!.reasons[0]?.ok).toBe(false);

    // 零变更：客户行仍在、订单未被级联删
    expect(await ds.getRepository('CrmCustomer').count({ where: { id } })).toBe(1);
    const detail = await request(app.getHttpServer())
      .get(`/api/v1/crm/customers/${id}`)
      .set(authHeader(tokenA))
      .expect(200);
    expect((detail.body.data as { orders: unknown[] }).orders).toHaveLength(1);
  });

  it('④ 风险分析边界：低数据客户 → low；单笔小额逾期 → medium（确定等级 + 理由，不崩）', async () => {
    // 低数据：无订单/任务/风险，默认 status=lead → 无外部风险信号，确定落到 low
    const lowId = await createCustomer(tokenA, '低数据客户');
    const low = await request(app.getHttpServer())
      .get(`/api/v1/crm/customers/${lowId}/analyze`)
      .set(authHeader(tokenA))
      .expect(200);
    const lowData = low.body.data as {
      level: string;
      reasons: string[];
      dataPoints: { orderCount: number; overdueOrders: number; openRisks: number; lateTasks: number };
    };
    expect(lowData.level).toBe('low');
    expect(Array.isArray(lowData.reasons)).toBe(true);
    expect(lowData.dataPoints.orderCount).toBe(0);
    expect(lowData.dataPoints.overdueOrders).toBe(0);
    expect(lowData.dataPoints.openRisks).toBe(0);
    expect(lowData.dataPoints.lateTasks).toBe(0);

    // 单笔小额逾期（≤100 万 → 权重 3）→ medium（≥3 且 <6），理由可解释
    const medId = await createCustomer(tokenA, '单笔逾期客户', { status: 'active' });
    await request(app.getHttpServer())
      .post(`/api/v1/crm/customers/${medId}/orders`)
      .set(authHeader(tokenA))
      .send({ amount: 50000, status: 'overdue' })
      .expect(201);
    const med = await request(app.getHttpServer())
      .get(`/api/v1/crm/customers/${medId}/analyze`)
      .set(authHeader(tokenA))
      .expect(200);
    const medData = med.body.data as {
      level: string;
      score: number;
      reasons: string[];
      dataPoints: { overdueOrders: number };
    };
    expect(medData.level).toBe('medium');
    expect(medData.score).toBe(3);
    expect(medData.dataPoints.overdueOrders).toBe(1);
    expect(medData.reasons.length).toBeGreaterThan(0);
  });

  it('⑤ 重复请求幂等（KB-4 duplicate）：同会话同参数 AI 跟进任务登记两次 → 归并同一副作用，不产生重复可撤锚', async () => {
    const customerId = await createCustomer(tokenA, '幂等目标客户');
    // 两次真实任务（模拟两次执行）+ 同参数登记 → 幂等键相同 → 归并
    const t1 = await createTask(tokenA, customerId, '跟进-幂等');
    const t2 = await createTask(tokenA, customerId, '跟进-幂等');
    const ctx = {
      userId: String(userAId),
      conversationId: 'a2-crm-idem',
      toolName: 'create_followup_task',
      args: { customerId, title: '跟进-幂等' },
    };
    const first = await effectsService.record(ctx, 'crm_task', t1);
    const second = await effectsService.record(ctx, 'crm_task', t2);

    // 幂等核心：第二次归并到同一条副作用（不新增行、不指向第二条任务）
    expect(first.id).toBeGreaterThan(0);
    expect(second.id).toBe(first.id);
    expect((second as { resultId: number }).resultId).toBe(t1);
    expect(await effectsRepo.count({ where: { idempotencyKey: AiToolEffectsService.buildKey(ctx) } })).toBe(1);
  });

  it('⑥ 部分失败（KB-4 partial）：会话级批量撤销部分成功 → 汇总如实 + CRM 详情任务递减', async () => {
    const customerId = await createCustomer(tokenA, '批量撤销目标客户');
    const t1 = await createTask(tokenA, customerId, '跟进-批撤-1');
    const t2 = await createTask(tokenA, customerId, '跟进-批撤-2');
    const record = (title: string, resultId: number) =>
      effectsService.record(
        { userId: String(userAId), conversationId: 'a2-crm-batch', toolName: 'create_followup_task', args: { customerId, title } },
        'crm_task',
        resultId,
      );
    const e1 = await record('跟进-批撤-1', t1);
    const e2 = await record('跟进-批撤-2', t2);
    expect(await tasksOfCustomer(tokenA, customerId)).toHaveLength(2);

    // 先单撤 e1（制造部分态）
    await request(app.getHttpServer())
      .delete(`/api/v1/ai/my/tool-effects/${e1.id}`)
      .set(authHeader(tokenA))
      .expect(200);

    // 会话级批量撤销：e1 已撤 → skipped；e2 未撤 → revoked（汇总如实，非「全部成功」）
    const res = await request(app.getHttpServer())
      .delete('/api/v1/ai/my/tool-effects?conversationId=a2-crm-batch')
      .set(authHeader(tokenA))
      .expect(200);
    const summary = res.body.data as {
      total: number;
      revoked: number;
      skipped: number;
      failed: number;
      results?: Array<{ effectId: number; revoked: boolean; revokeStatus?: string }>;
    };
    // 逐字段断言（响应另含 results 明细，不用 toEqual 以免过严耦合）
    expect(summary.total).toBe(2);
    expect(summary.revoked).toBe(1);
    expect(summary.skipped).toBe(1);
    expect(summary.failed).toBe(0);
    // 明细如实：e2 真撤（revoked/revokeStatus=revoked），e1 已撤跳过
    const detail = summary.results?.find((r) => r.effectId === e2.id);
    expect(detail?.revoked).toBe(true);
    expect(detail?.revokeStatus).toBe('revoked');

    // CRM 详情：两条 AI 任务均软删不可见（部分撤销后状态一致收敛）
    expect(await tasksOfCustomer(tokenA, customerId)).toHaveLength(0);
  });

  it('⑧ §4 G1 run 级批量撤销：只圈定该 run 的副作用（同会话其它 run 不受影响）', async () => {
    const customerId = await createCustomer(tokenA, 'run 级撤销目标客户');
    const t1 = await createTask(tokenA, customerId, 'run撤-1');
    const t2 = await createTask(tokenA, customerId, 'run撤-2');
    const tOther = await createTask(tokenA, customerId, 'run撤-其它');
    const record = (title: string, resultId: number, runId: string) =>
      effectsService.record(
        { userId: String(userAId), conversationId: 'a2-run-batch', runId, toolName: 'create_followup_task', args: { customerId, title } },
        'crm_task',
        resultId,
      );
    // 同一会话下两个 run：run-batch-1 含 2 条、run-batch-2 含 1 条
    await record('run撤-1', t1, 'run-batch-1');
    await record('run撤-2', t2, 'run-batch-1');
    await record('run撤-其它', tOther, 'run-batch-2');
    expect(await tasksOfCustomer(tokenA, customerId)).toHaveLength(3);

    const res = await request(app.getHttpServer())
      .delete('/api/v1/ai/my/tool-effects?runId=run-batch-1')
      .set(authHeader(tokenA))
      .expect(200);
    const summary = res.body.data as {
      runId?: string;
      total: number;
      revoked: number;
      truncated?: boolean;
    };
    expect(summary.runId).toBe('run-batch-1');
    expect(summary.total).toBe(2); // 只圈 run-batch-1 的 2 条（非整个会话的 3 条）
    expect(summary.revoked).toBe(2);
    expect(summary.truncated).toBe(false);

    // 精确圈定：run-batch-2 的 1 条仍在（run 级比会话级细，不误伤同会话其它 run）
    expect(await tasksOfCustomer(tokenA, customerId)).toHaveLength(1);
  });

  it('⑦ 撤销诚实（KB-4 unknown 边界）：撤销后 CRM 详情不可见（软删）+ 再撤幂等成功', async () => {
    const customerId = await createCustomer(tokenA, '撤销诚实目标客户');
    const tid = await createTask(tokenA, customerId, '跟进-撤销诚实');
    const e = await effectsService.record(
      { userId: String(userAId), conversationId: 'a2-crm-revoke', toolName: 'create_followup_task', args: { customerId, title: '跟进-撤销诚实' } },
      'crm_task',
      tid,
    );

    // 撤销前：CRM 详情可见该任务（证明撤销确有可观察效果，而非空操作）
    expect(await tasksOfCustomer(tokenA, customerId)).toHaveLength(1);

    await request(app.getHttpServer())
      .delete(`/api/v1/ai/my/tool-effects/${e.id}`)
      .set(authHeader(tokenA))
      .expect(200);
    expect(await tasksOfCustomer(tokenA, customerId)).toHaveLength(0);

    // 再撤一次：幂等成功（200，不新增行、不谎报为「未找到」或失败）
    await request(app.getHttpServer())
      .delete(`/api/v1/ai/my/tool-effects/${e.id}`)
      .set(authHeader(tokenA))
      .expect(200);
    expect(await effectsRepo.count({ where: { id: e.id } })).toBe(1);
  });
});
