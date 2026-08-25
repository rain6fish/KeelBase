import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp, registerUser, loginAs, authHeader } from './helpers';
import { CrmService } from '../src/crm/crm.service';
import { AiService } from '../src/ai/ai.service';
import { AiToolEffectsService } from '../src/ai/tool-effects/ai-tool-effects.service';
import { QueryCustomersTool } from '../src/ai/tools/query-customers.tool';
import { AnalyzeCustomerRiskTool } from '../src/ai/tools/analyze-customer-risk.tool';
import { CreateFollowupTaskTool } from '../src/ai/tools/create-followup-task.tool';

/**
 * 1.0 Gate 1 — Golden Application = AI CRM（development-plan §7.3「一次跑通闭环」）
 *
 * 一次跑通：Customer → Risk Analysis → Create Follow-up Task → 确认 → 写 → 审计 → 撤销。
 * 确定性验证（无 LLM，可进 CI）：
 *   - Customer / Order：REST 真实落库；
 *   - Risk Analysis：analyze_customer_risk 工具直接实例化（镜像 Agent 执行路径，同 authorization.e2e）；
 *   - Create Follow-up Task：AiService.executeToolForExternal 走真实治理层 → requiresConfirmation 门控（不确认不执行）；
 *   - 确认 → 写：CreateFollowupTaskTool 执行（同 _executeWriteTool 确认后路径）+ AiToolEffectsService.record 登记副作用；
 *   - 审计：副作用可撤销登记 + 管理端审计哈希链 verify；
 *   - 撤销：HTTP revokeOwned 软删 + 越权撤销拒绝（所有权）。
 * Build（60s/10m/30m）由 scripts/verify-golden-application.sh 独立验证（keelbase init → 编译）。
 */
describe('1.0 Gate 1 — Golden Application：AI CRM 一次跑通闭环', () => {
  let app: INestApplication;
  let userA: { accessToken: string };
  let userB: { accessToken: string };
  let admin: { accessToken: string };
  let userAId: number;
  let crmService: CrmService;
  let aiService: AiService;
  let effectsService: AiToolEffectsService;

  // 闭环数据（跨 it 步骤共享）
  let customerId: number;
  let taskId: number;
  let effectId: number;

  beforeAll(async () => {
    app = await createTestApp();
    userA = await registerUser(app, {
      username: 'golden_a',
      email: 'golden_a@test.com',
      password: 'GoldenA1234',
      nickname: 'GoldenA',
    });
    userB = await registerUser(app, {
      username: 'golden_b',
      email: 'golden_b@test.com',
      password: 'GoldenB1234',
      nickname: 'GoldenB',
    });
    const meA = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set(authHeader(userA.accessToken))
      .expect(200);
    userAId = meA.body.data.id;

    // 管理员：注册 → 提升角色 → 重新登录（JWT role 声明随登录生成）
    const regAdmin = await registerUser(app, {
      username: 'golden_admin',
      email: 'golden_admin@test.com',
      password: 'GoldenAdmin1234',
      nickname: 'GoldenAdmin',
    });
    const adminMe = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set(authHeader(regAdmin.accessToken))
      .expect(200);
    const ds = app.get(DataSource);
    await ds.getRepository('users').update(adminMe.body.data.id, { role: 'admin' });
    admin = await loginAs(app, 'golden_admin', 'GoldenAdmin1234');

    crmService = app.get(CrmService);
    aiService = app.get(AiService);
    effectsService = app.get(AiToolEffectsService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('① Customer：创建临海制造 + 280 万逾期订单 → AI 可读到该客户', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/crm/customers')
      .set(authHeader(userA.accessToken))
      .send({ name: '临海制造', company: '临海集团', status: 'active', riskLevel: 'high' })
      .expect(201);
    customerId = created.body.data.id;
    expect(customerId).toBeDefined();

    await request(app.getHttpServer())
      .post(`/api/v1/crm/customers/${customerId}/orders`)
      .set(authHeader(userA.accessToken))
      .send({ amount: 2800000, status: 'overdue', dueDate: '2026-08-01T00:00:00Z' })
      .expect(201);
    // 第二笔逾期订单：大额逾期(5) + 逾期额>50万(2) + 累计>50万(2) + 普通逾期(3) → score 12 → critical
    await request(app.getHttpServer())
      .post(`/api/v1/crm/customers/${customerId}/orders`)
      .set(authHeader(userA.accessToken))
      .send({ amount: 800000, status: 'overdue', dueDate: '2026-08-10T00:00:00Z' })
      .expect(201);

    const queryTool = new QueryCustomersTool(crmService);
    const res = await queryTool.execute({}, String(userAId));
    expect(res.success).toBe(true);
    const items = (res.data as any).items ?? (res.data as any);
    expect(Array.isArray(items)).toBe(true);
    expect(items.some((c: any) => c.id === customerId && c.name === '临海制造')).toBe(true);
  });

  it('② Risk Analysis：analyze_customer_risk → critical + 理由', async () => {
    const riskTool = new AnalyzeCustomerRiskTool(crmService);
    const res = await riskTool.execute({ customerId }, String(userAId));
    expect(res.success).toBe(true);
    expect((res.data as any).level).toBe('critical');
    expect((res.data as any).score).toBeGreaterThanOrEqual(10);
    expect((res.data as any).reasons.length).toBeGreaterThan(0);
  });

  it('③ Create Follow-up Task：确认门控（不确认不执行）', async () => {
    // 真实治理层：写工具经 executeToolForExternal → requiresConfirmation，不自动执行
    const gated = await aiService.executeToolForExternal(
      'create_followup_task',
      { customerId, title: '跟进临海制造 280 万逾期' },
      String(userAId),
    );
    expect(gated.executed).toBe(false);
    expect(gated.requiresConfirmation).toBe(true);
    expect(gated.result).toBeUndefined();

    // 未确认 → 任务未创建
    const tasks = await request(app.getHttpServer())
      .get('/api/v1/crm/tasks')
      .set(authHeader(userA.accessToken))
      .expect(200);
    expect(tasks.body.data.items.some((t: any) => t.title === '跟进临海制造 280 万逾期')).toBe(false);
  });

  it('④ 确认 → 写：任务真实落库 + 副作用登记（可撤销）', async () => {
    // 确认后执行（镜像 _executeWriteTool：execute 成功 → record 副作用）
    const createTool = new CreateFollowupTaskTool(crmService);
    const res = await createTool.execute(
      { customerId, title: '跟进临海制造 280 万逾期', dueDate: '2026-08-25T10:00:00Z' },
      String(userAId),
    );
    expect(res.success).toBe(true);
    taskId = (res.data as any).id;
    expect(taskId).toBeDefined();

    const effect = await effectsService.record(
      {
        userId: String(userAId),
        conversationId: 'golden-app-1',
        toolName: 'create_followup_task',
        args: { customerId, title: '跟进临海制造 280 万逾期' },
      } as any,
      'crm_task',
      taskId,
    );
    effectId = effect.id;
    expect(effectId).toBeDefined();

    // 写已落库（REST 可见）
    const tasks = await request(app.getHttpServer())
      .get('/api/v1/crm/tasks')
      .set(authHeader(userA.accessToken))
      .expect(200);
    expect(tasks.body.data.items.some((t: any) => t.id === taskId && t.title === '跟进临海制造 280 万逾期')).toBe(true);
  });

  it('⑤ 审计：副作用可撤销登记存在 + 管理端审计哈希链 valid', async () => {
    const key = AiToolEffectsService.buildKey({
      userId: String(userAId),
      conversationId: 'golden-app-1',
      toolName: 'create_followup_task',
      args: { customerId, title: '跟进临海制造 280 万逾期' },
    });
    const effect = await effectsService.findExisting(key);
    expect(effect.existing).toBe(true);
    expect(effect.effect?.resultType).toBe('crm_task');
    expect(effect.effect?.resultId).toBe(taskId);

    // 审计哈希链完整性（admin 视角，HS-11）
    const aiVerify = await request(app.getHttpServer())
      .get('/api/v1/audit/verify')
      .set(authHeader(admin.accessToken))
      .expect(200);
    expect(aiVerify.body.data.valid).toBe(true);

    const opVerify = await request(app.getHttpServer())
      .get('/api/v1/audit/operations/verify')
      .set(authHeader(admin.accessToken))
      .expect(200);
    expect(opVerify.body.data.valid).toBe(true);
  });

  it('⑥ 撤销：本人撤销 AI 副作用 → 任务软删不可见', async () => {
    await request(app.getHttpServer())
      .delete(`/api/v1/ai/my/tool-effects/${effectId}`)
      .set(authHeader(userA.accessToken))
      .expect(200);

    const tasks = await request(app.getHttpServer())
      .get('/api/v1/crm/tasks')
      .set(authHeader(userA.accessToken))
      .expect(200);
    expect(tasks.body.data.items.some((t: any) => t.id === taskId)).toBe(false);
  });

  it('⑦ 所有权：B 撤销 A 的副作用 → 404（越权拒绝）', async () => {
    // 先让 A 再次产生一条可撤销记录
    const effect = await effectsService.record(
      {
        userId: String(userAId),
        conversationId: 'golden-app-2',
        toolName: 'create_followup_task',
        args: { customerId, title: '越权撤销目标' },
      } as any,
      'crm_task',
      taskId,
    );
    await request(app.getHttpServer())
      .delete(`/api/v1/ai/my/tool-effects/${effect.id}`)
      .set(authHeader(userB.accessToken))
      .expect(404);

    // 本人仍可撤销
    await request(app.getHttpServer())
      .delete(`/api/v1/ai/my/tool-effects/${effect.id}`)
      .set(authHeader(userA.accessToken))
      .expect(200);
  });

  it('⑧ 治理视图：CRM 业务动作（crm_task）经 governance 端点反查（EB-2/B4 贯通）', async () => {
    // 经 AI 写执行路径登记 crm_task 副作用（真实 CRM 业务动作）
    const write = await (aiService as any)._executeWriteTool('create_followup_task', { customerId, title: '治理视图跟进' }, String(userAId), 'gov-crm-conv');
    expect(write.success).toBe(true);
    const list = await effectsService.list({ userId: userAId });
    const effect = list.items.find((e: any) => e.toolName === 'create_followup_task' && e.targetTitle === '治理视图跟进');
    expect(effect).toBeDefined();

    // 本人可读治理视图（CRM 业务动作 → 副作用 + trace，trace 尽力而为）
    const gov = await request(app.getHttpServer())
      .get(`/api/v1/ai/governance/action/crm_task/${effect.resultId}`)
      .set(authHeader(userA.accessToken))
      .expect(200);
    expect(gov.body.data.effect.resultType).toBe('crm_task');
    expect(gov.body.data.effect.resultId).toBe(effect.resultId);
    expect(gov.body.data.effect.toolName).toBe('create_followup_task');

    // 越权：B → 403
    await request(app.getHttpServer())
      .get(`/api/v1/ai/governance/action/crm_task/${effect.resultId}`)
      .set(authHeader(userB.accessToken))
      .expect(403);
  });
});
