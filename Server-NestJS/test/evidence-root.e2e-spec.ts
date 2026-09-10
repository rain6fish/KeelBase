// SPDX-License-Identifier: Apache-2.0

import { HttpStatus, INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createHash } from 'crypto';
import { execFileSync } from 'child_process';
import { tmpdir } from 'os';
import { writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { createTestApp, registerUser, authHeader } from './helpers';
import { CrmService } from '../src/crm/crm.service';
import { AiToolEffectsService } from '../src/ai/tool-effects/ai-tool-effects.service';
import { CreateFollowupTaskTool } from '../src/ai/tools/create-followup-task.tool';
import { AuditService } from '../src/ai/audit/audit.service';

/**
 * KB-3 证据根 v3 契约 e2e（docs/evidence-root.spec.md §7 验收：seed 一条 AI 写 → 导出 v3 → digest 复算 PASS → 撬链 FAIL）。
 * 确定性（无 LLM）：REST 建客户 → CreateFollowupTaskTool 写任务 → AiToolEffectsService.record 登记副作用 →
 * **真实三源装配（1.0.8 review-deferred 1.1）**：REST 写同一 crm_task（operation_audit 链行）+ 真实 AuditService.log
 * 落同 conversationId 的 ai_audit_logs 行（chat + tool_call，真实哈希链）→ 导出三源锚齐（ai-audit/op-audit/side-effect）
 * → root.digest===sha256(anchors)（与 verify-evidence 同算法）；非本人 403；改锚 hash → digest 复算不匹配。
 * ④ verify-evidence --key 离线全量验证：真实 AI/op 链行按 AUDIT_HMAC_KEY（.env.test 显式配置）全量重算 PASS。
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

    // 真实三源装配（1.0.8 review-deferred 1.1）：op 链 = REST 写同一 crm_task（operation_audit 行 targetId=taskId）；
    // ai 链 = 真实 AuditService.log 落 ai_audit_logs（真实哈希链、同 conversationId）——导出不再只有副作用单锚
    await request(app.getHttpServer())
      .post(`/api/v1/crm/tasks/${taskId}/complete`)
      .set(authHeader(userA.accessToken))
      .expect(HttpStatus.OK);
    const audit = app.get(AuditService);
    await audit.log({
      userId: String(userAId),
      conversationId: 'evidence-root-e2e-1',
      action: 'chat',
      detail: '证据根导出：请给该客户建跟进任务',
      isError: false,
    } as never);
    await audit.log({
      userId: String(userAId),
      conversationId: 'evidence-root-e2e-1',
      action: 'tool_call',
      detail: `create_followup_task({"customerId":${customerId},"title":"证据根导出用跟进任务"})`,
      isError: false,
    } as never);
  });

  afterAll(async () => {
    await app.close();
  });

  const exportRoot = (token: string, expectedStatus: number) =>
    request(app.getHttpServer())
      .get(`/api/v1/ai/governance/evidence-root/crm_task/${taskId}`)
      .set(authHeader(token))
      .expect(expectedStatus);

  it('① 本人导出 v3：action/root.anchors 结构 + 真实三源锚齐 + root.digest 可离线复算（PASS）', async () => {
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
    // 真实三源装配（1.0.8 review-deferred 1.1）：ai-audit + op-audit + side-effect 锚齐，子链非空
    expect(anchors.map((a: { kind?: string }) => a.kind).sort()).toEqual(['ai-audit', 'op-audit', 'side-effect']);
    expect(pkg.chains?.aiAudit?.length).toBeGreaterThan(0);
    expect(pkg.chains?.operationAudit?.length).toBeGreaterThan(0);
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

  it('④ 真实 verify-evidence.mjs --key 离线全量验证：整包 canonical HMAC + 真实 AI/op 链行全量重算 PASS，篡改 exportedAt 后 FAIL', async () => {
    // 链签名键 = AUDIT_HMAC_KEY（.env.test 显式配置，W4-②/HS-11）；离线全量重算与写入同 key
    const key = process.env.AUDIT_HMAC_KEY || process.env.ENCRYPTION_KEY || '';
    expect(key.length).toBe(64); // 配置缺口暴露为失败而非静默跳过
    const res = await exportRoot(userA.accessToken, 200);
    const pkg = res.body.data as any;
    const file = join(tmpdir(), `evroot-key-${Date.now()}.json`);
    const script = join(__dirname, '../scripts/verify-evidence.mjs');
    try {
      writeFileSync(file, JSON.stringify(pkg));
      // PASS：真实离线脚本 --key 全量重算真实三源链行（AI + operationAudit）+ 整包 canonical HMAC 签名验证（exit 0）
      const out = execFileSync(process.execPath, [script, file, '--key', key], { encoding: 'utf8' });
      expect(out).toContain('PASS');
      expect(out).toContain('子链内容重算'); // 真实非空子链被全量重算（非 vacuous）
      // 篡改 canonical 内 exportedAt → 整包 HMAC 重算不匹配 → FAIL（exit 1）
      const tampered = { ...pkg, exportedAt: '2999-01-01T00:00:00.000Z' };
      writeFileSync(file, JSON.stringify(tampered));
      let failed = false;
      try {
        execFileSync(process.execPath, [script, file, '--key', key], { encoding: 'utf8' });
      } catch {
        failed = true;
      }
      expect(failed).toBe(true);
    } finally {
      rmSync(file, { force: true });
    }
  });
});
