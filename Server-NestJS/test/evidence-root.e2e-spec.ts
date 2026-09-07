// SPDX-License-Identifier: Apache-2.0

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createHash } from 'crypto';
import { createTestApp, registerUser, authHeader } from './helpers';
import { CrmService } from '../src/crm/crm.service';
import { AiToolEffectsService } from '../src/ai/tool-effects/ai-tool-effects.service';
import { CreateFollowupTaskTool } from '../src/ai/tools/create-followup-task.tool';

/**
 * KB-3 证据根 v3 契约 e2e（docs/evidence-root.spec.md §7 验收：seed 一条 AI 写 → 导出 v3 → digest 复算 PASS → 撬链 FAIL）。
 * 确定性（无 LLM）：REST 建客户 → CreateFollowupTaskTool 写任务 → AiToolEffectsService.record 登记副作用 →
 * GET /ai/governance/evidence-root/:resultType/:resultId → root.digest===sha256(anchors)（与 verify-evidence 同算法）；
 * 非本人 403；改锚 hash → digest 复算不匹配（离线 FAIL 分支等价）。
 */
describe('证据根 v3 契约（KB-3）', () => {
  let app: INestApplication;
  let userA: { accessToken: string };
  let userB: { accessToken: string };
  let userAId: number;
  let effectsService: AiToolEffectsService;
  let customerId: number;
  let taskId: number;

  const digestOf = (anchors: Array<{ hash: string }>): string =>
    createHash('sha256').update(JSON.stringify(anchors)).digest('hex');

  beforeAll(async () => {
    app = await createTestApp();
    userA = await registerUser(app, {
      username: 'evroot_a',
      email: 'evroot_a@test.com',
      password: 'EvRootA1234',
      nickname: 'EvRootA',
    });
    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set(authHeader(userA.accessToken))
      .expect(200);
    userAId = (me.body.data as { id: number }).id;
    userB = await registerUser(app, {
      username: 'evroot_b',
      email: 'evroot_b@test.com',
      password: 'EvRootB1234',
      nickname: 'EvRootB',
    });
    effectsService = app.get(AiToolEffectsService);

    // 造一条 AI 写动作：REST 建客户 + 工具写任务（镜像确认后执行路径）+ 副作用登记
    const cus = await request(app.getHttpServer())
      .post('/api/v1/crm/customers')
      .set(authHeader(userA.accessToken))
      .send({ name: `evidence-root 客户 ${Date.now()}`, company: 'EvRootCo', status: 'active', riskLevel: 'low' })
      .expect(201);
    customerId = (cus.body.data as { id: number }).id;

    const crmService = app.get(CrmService);
    const tool = new CreateFollowupTaskTool(crmService);
    const res = await tool.execute(
      { customerId, title: '证据根导出用跟进任务', dueDate: '2026-09-10T10:00:00Z' },
      String(userAId),
    );
    taskId = (res.data as { id: number }).id;
    expect(taskId).toBeDefined();

    await effectsService.record(
      {
        userId: String(userAId),
        conversationId: 'evidence-root-e2e-1',
        toolName: 'create_followup_task',
        args: { customerId, title: '证据根导出用跟进任务' },
      } as never,
      'crm_task',
      taskId,
    );
  });

  afterAll(async () => {
    await app.close();
  });

  const exportRoot = (token: string, expectedStatus: number) =>
    request(app.getHttpServer())
      .get(`/api/v1/ai/governance/evidence-root/crm_task/${taskId}`)
      .set(authHeader(token))
      .expect(expectedStatus);

  it('① 本人导出 v3：action/root.anchors 结构 + root.digest 可离线复算（PASS）', async () => {
    const res = await exportRoot(userA.accessToken, 200);
    const pkg = res.body.data as any;
    expect(pkg.format).toBe('keelbase-audit-evidence/3');
    expect(pkg.action.id).toBe(`crm_task:${taskId}`);
    expect(pkg.action.effectId).toBeDefined();
    expect(pkg.exportedAt).toBeDefined();
    const anchors = pkg.root?.anchors ?? [];
    expect(anchors.length).toBeGreaterThan(0);
    anchors.forEach((a: { hash: string }) => expect(a.hash).toMatch(/^[0-9a-f]{64}$/));
    // 与 verify-evidence v3 同算法：digest = sha256(canonical anchors)，免钥可复现
    expect(pkg.root.digest).toBe(digestOf(anchors));
  });

  it('② 非本人非 admin → 403（数据隔离）', async () => {
    const res = await exportRoot(userB.accessToken, 403);
    expect(res.body).toBeDefined();
  });

  it('③ 撬锚检测：改 root.anchors[0].hash 一位 → digest 复算不匹配（离线 FAIL 分支等价）', async () => {
    const res = await exportRoot(userA.accessToken, 200);
    const pkg = res.body.data as any;
    const anchors = [...(pkg.root?.anchors ?? [])];
    expect(anchors.length).toBeGreaterThan(0);
    const flipped = { ...anchors[0], hash: (anchors[0].hash[0] === '0' ? '1' : '0') + anchors[0].hash.slice(1) };
    const tampered = [flipped, ...anchors.slice(1)];
    // 改锚后 digest 不再等于 sha256(tampered)——等于 verify-evidence 的 FAIL 判定
    expect(digestOf(tampered)).not.toBe(pkg.root.digest);
  });
});
