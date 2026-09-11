// SPDX-License-Identifier: Apache-2.0

import { INestApplication } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import request from 'supertest';
import { createTestApp, registerUser, authHeader } from './helpers';
import { AiToolEffectsService } from '../src/ai/tool-effects/ai-tool-effects.service';
import { AiToolSideEffect } from '../src/ai/tool-effects/ai-tool-side-effect.entity';

/**
 * A2「AI PM = 第二证明（Task/Deadline/Dependency 各压一次基座）」（Enterprise Proof，§18.6）。
 *
 * 与 CRM 失败路径同构（`crm-trust-failure-path.e2e-spec.ts`），确定性（无 LLM）、真实 app + REST：
 *   ① 越权「写」子资源（里程碑/任务/风险/成员）→ 拒绝且零副作用（不产生任何行）
 *   ② 越权「写」项目本体（PATCH/DELETE）→ 403（CASL 行级）且数据未被篡改/未被删
 *   ③ 延期风险分析边界：低数据项目 → 确定等级；逾期任务 → 等级上升（不崩、理由可解释）
 *   ④ 部分失败（KB-4 partial，PM 语境）：会话级批量撤销部分成功 → 汇总如实 + 项目详情任务递减
 * KB-4 的 timeout / 补偿失败依赖外部目标（proxy），PM 本地实体无此路径，由 failure-path/proxy-bridge 覆盖。
 */
describe('AI PM 失败/拒绝路径（A2 第二证明）', () => {
  let app: INestApplication;
  let ds: DataSource;
  let aiEffects: AiToolEffectsService;
  let effectsRepo: Repository<AiToolSideEffect>;
  let tokenA: string;
  let tokenB: string;
  let userAId: number;
  let userBId: number;

  async function createProject(token: string, name: string, extra: Record<string, unknown> = {}): Promise<number> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/pm/projects')
      .set(authHeader(token))
      .send({ name, ...extra })
      .expect(201);
    return (res.body.data as { id: number }).id;
  }

  async function createTask(token: string, projectId: number, title: string, dueDate?: string): Promise<number> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/pm/tasks')
      .set(authHeader(token))
      .send({ projectId, title, ...(dueDate ? { dueDate } : {}) })
      .expect(201);
    return (res.body.data as { id: number }).id;
  }

  async function tasksOfProject(token: string, projectId: number): Promise<unknown[]> {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/pm/projects/${projectId}`)
      .set(authHeader(token))
      .expect(200);
    return ((res.body.data as { tasks?: unknown[] }).tasks ?? []) as unknown[];
  }

  beforeAll(async () => {
    app = await createTestApp();
    ds = app.get(DataSource);
    aiEffects = app.get(AiToolEffectsService);
    effectsRepo = ds.getRepository(AiToolSideEffect);

    const a = await registerUser(app, { username: 'a2_pm_a', email: 'a2_pm_a@test.com', password: 'A2PmA1234', nickname: 'A2PmA' });
    const b = await registerUser(app, { username: 'a2_pm_b', email: 'a2_pm_b@test.com', password: 'A2PmB1234', nickname: 'A2PmB' });
    tokenA = a.accessToken;
    tokenB = b.accessToken;

    const meA = await request(app.getHttpServer()).get('/api/v1/auth/me').set(authHeader(tokenA)).expect(200);
    userAId = (meA.body.data as { id: number }).id;
    const meB = await request(app.getHttpServer()).get('/api/v1/auth/me').set(authHeader(tokenB)).expect(200);
    userBId = (meB.body.data as { id: number }).id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('① 越权写：B 对 A 的项目发起子资源写（里程碑/任务/风险/成员）→ 拒绝 + 零副作用', async () => {
    const id = await createProject(tokenA, '越权写目标项目');

    const writes = [
      { label: '里程碑', run: () => request(app.getHttpServer()).post(`/api/v1/pm/projects/${id}/milestones`).set(authHeader(tokenB)).send({ title: '越权里程碑' }) },
      { label: '任务', run: () => request(app.getHttpServer()).post('/api/v1/pm/tasks').set(authHeader(tokenB)).send({ projectId: id, title: '越权任务' }) },
      { label: '风险', run: () => request(app.getHttpServer()).post(`/api/v1/pm/projects/${id}/risks`).set(authHeader(tokenB)).send({ level: 'high', reason: '越权风险' }) },
      { label: '成员', run: () => request(app.getHttpServer()).post(`/api/v1/pm/projects/${id}/members`).set(authHeader(tokenB)).send({ userId: userBId, role: 'member' }) },
    ];
    for (const w of writes) {
      const res = await w.run();
      // 拒绝语义：归属校验 → 403/404 均表拒绝（不暴露存在性属可接受）；明确不得 2xx
      expect({ label: w.label, rejected: res.status >= 400 }).toEqual({ label: w.label, rejected: true });
    }

    // 零副作用：A 详情聚合下子资源为空（detail 形状 = { project, milestones, tasks, risks, memberCount }）
    const detail = await request(app.getHttpServer())
      .get(`/api/v1/pm/projects/${id}`)
      .set(authHeader(tokenA))
      .expect(200);
    const d = detail.body.data as { milestones: unknown[]; tasks: unknown[]; risks: unknown[]; memberCount: number };
    for (const key of ['milestones', 'tasks', 'risks'] as const) {
      expect({ key, len: d[key].length }).toEqual({ key, len: 0 });
    }
    expect(d.memberCount).toBe(0);
    expect(await ds.getRepository('PmTask').count({ where: { projectId: id } })).toBe(0);
  });

  it('② 越权写：B PATCH/DELETE A 的项目 → 403（CASL 行级）+ 数据未被篡改/未被删', async () => {
    const name = '越权改删目标项目';
    const id = await createProject(tokenA, name);

    await request(app.getHttpServer())
      .patch(`/api/v1/pm/projects/${id}`)
      .set(authHeader(tokenB))
      .send({ name: '被篡改' })
      .expect(403);
    await request(app.getHttpServer())
      .delete(`/api/v1/pm/projects/${id}`)
      .set(authHeader(tokenB))
      .expect(403);

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/pm/projects/${id}`)
      .set(authHeader(tokenA))
      .expect(200);
    expect((detail.body.data as { project: { name: string } }).project.name).toBe(name);
  });

  it('③ 延期风险分析边界：低数据项目 → 确定等级；逾期任务 → 等级上升（不崩、理由可解释）', async () => {
    // 低数据：无任务/里程碑/风险
    const lowId = await createProject(tokenA, '低数据项目');
    const low = await request(app.getHttpServer())
      .get(`/api/v1/pm/projects/${lowId}/analyze`)
      .set(authHeader(tokenA))
      .expect(200);
    const lowData = low.body.data as { level: string; reasons?: string[] };
    expect(['low', 'medium', 'high']).toContain(lowData.level);
    const baselineLevel = lowData.level;

    // 逾期任务（截止已过且未完成）→ 等级不低于基线（确定性上升或持平，不崩）
    const overdueId = await createProject(tokenA, '逾期项目');
    await createTask(tokenA, overdueId, '逾期任务', '2020-01-01T00:00:00Z');
    const overdue = await request(app.getHttpServer())
      .get(`/api/v1/pm/projects/${overdueId}/analyze`)
      .set(authHeader(tokenA))
      .expect(200);
    const overdueData = overdue.body.data as { level: string; reasons?: string[] };
    const rank: Record<string, number> = { low: 0, medium: 1, high: 2 };
    expect(rank[overdueData.level]).toBeGreaterThanOrEqual(rank[baselineLevel]);
    expect(overdueData.level).not.toBe('low'); // 有逾期任务不应停留在最低级
    expect(Array.isArray(overdueData.reasons)).toBe(true);
  });

  it('④ 部分失败（KB-4 partial，PM 语境）：会话级批量撤销部分 → 汇总如实 + 项目详情任务递减', async () => {
    const projectId = await createProject(tokenA, '批量撤销目标项目');
    const t1 = await createTask(tokenA, projectId, 'PM 任务-批撤-1');
    const t2 = await createTask(tokenA, projectId, 'PM 任务-批撤-2');
    const record = (title: string, resultId: number) =>
      aiEffects.record(
        { userId: String(userAId), conversationId: 'a2-pm-batch', toolName: 'create_project_task', args: { projectId, title } },
        'pm_task',
        resultId,
      );
    const e1 = await record('PM 任务-批撤-1', t1);
    const e2 = await record('PM 任务-批撤-2', t2);
    expect(await tasksOfProject(tokenA, projectId)).toHaveLength(2);

    // 先单撤 e1 → 制造部分态
    await request(app.getHttpServer())
      .delete(`/api/v1/ai/my/tool-effects/${e1.id}`)
      .set(authHeader(tokenA))
      .expect(200);

    // 会话级批量撤销：e1 已撤 skipped / e2 未撤 revoked（汇总如实）
    const res = await request(app.getHttpServer())
      .delete('/api/v1/ai/my/tool-effects?conversationId=a2-pm-batch')
      .set(authHeader(tokenA))
      .expect(200);
    const summary = res.body.data as { total: number; revoked: number; skipped: number; failed: number; results?: Array<{ effectId: number; revoked: boolean }> };
    expect(summary.total).toBe(2);
    expect(summary.revoked).toBe(1);
    expect(summary.skipped).toBe(1);
    expect(summary.failed).toBe(0);
    expect(summary.results?.find((r) => r.effectId === e2.id)?.revoked).toBe(true);

    // 项目详情：两条 AI 任务均软删不可见
    expect(await tasksOfProject(tokenA, projectId)).toHaveLength(0);
  });

  it('⑤ 重复请求幂等（KB-4 duplicate，PM 语境）：同会话同参数登记两次 → 归并同一副作用', async () => {
    const projectId = await createProject(tokenA, '幂等项目');
    const t1 = await createTask(tokenA, projectId, 'PM 任务-幂等');
    const ctx = {
      userId: String(userAId),
      conversationId: 'a2-pm-idem',
      toolName: 'create_project_task',
      args: { projectId, title: 'PM 任务-幂等' },
    };
    const first = await aiEffects.record(ctx, 'pm_task', t1);
    const second = await aiEffects.record(ctx, 'pm_task', t1);
    expect(second.id).toBe(first.id);
    expect(await effectsRepo.count({ where: { idempotencyKey: AiToolEffectsService.buildKey(ctx) } })).toBe(1);
  });
});
