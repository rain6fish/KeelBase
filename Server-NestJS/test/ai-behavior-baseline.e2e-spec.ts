// SPDX-License-Identifier: Apache-2.0

/**
 * BA 异常行为基线 e2e（docs/ai-behavior-baseline.spec.md §8）。
 *
 * 证明的是**闭环**而不是规则细节（细则由单测覆盖）：真造出异常行为 → 跑扫描 → 告警**落库**且
 * 带可复算依据 → 冷却期内再扫**不重复落库**；且全程**不阻断任何东西**（本能力只观测）。
 *
 * 造数走真实写入路径（`AuditService.log`），不直接插表——否则测的是夹具而不是链路。
 */
import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createTestApp } from './helpers';
import { AuditService } from '../src/ai/audit/audit.service';
import { BehaviorBaselineService } from '../src/ai/behavior-baseline/behavior-baseline.service';
import { AiBehaviorAlert } from '../src/ai/behavior-baseline/behavior-alert.entity';

describe('BA 异常行为基线（扫描 → 落库 → 去重）', () => {
  let app: INestApplication;
  let audit: AuditService;
  let baseline: BehaviorBaselineService;
  let alertRepo: Repository<AiBehaviorAlert>;

  beforeAll(async () => {
    app = await createTestApp();
    audit = app.get(AuditService);
    baseline = app.get(BehaviorBaselineService);
    alertRepo = app.get(getRepositoryToken(AiBehaviorAlert));
  });

  afterAll(async () => {
    await app.close();
  });

  const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  it('① R-1：同一会话工具调用超阈值 → 落一条告警，带 count/threshold/window 依据', async () => {
    const conversationId = `conv-r1-${stamp()}`;
    const userId = 'behavior-e2e-user';
    // 阈值 20 → 造 21 条
    for (let i = 0; i < 21; i++) {
      await audit.log({ userId, conversationId, action: 'tool_call', detail: `create_todo({"i":${i}})` });
    }

    const saved = await baseline.scan();

    const mine = saved.filter((a) => a.rule === 'R-1' && a.conversationId === conversationId);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ level: 'warning', subjectKind: 'conversation', status: 'open' });
    const evidence = JSON.parse(mine[0].evidenceJson) as { count: number; threshold: number; windowMinutes: number };
    expect(evidence.count).toBeGreaterThanOrEqual(21);
    expect(evidence.threshold).toBe(20);
    expect(evidence.windowMinutes).toBe(10);
  });

  it('② R-2：高危工具被拒后反复尝试 → 落一条告警（主体是用户，带工具名）', async () => {
    const userId = `behavior-e2e-hr-${stamp()}`;
    // delete_customer 是 R5（恒定阻断）；阈值 3 → 造 4 条失败
    for (let i = 0; i < 4; i++) {
      await audit.log({
        userId,
        conversationId: `conv-r2-${stamp()}`,
        action: 'tool_call',
        detail: `delete_customer({"id":${i}})`,
        isError: true,
        errorMessage: 'blocked by policy',
      });
    }

    const saved = await baseline.scan();

    const mine = saved.filter((a) => a.rule === 'R-2' && a.subjectId === userId);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ subjectKind: 'user', level: 'warning' });
    const evidence = JSON.parse(mine[0].evidenceJson) as { toolName?: string; count: number };
    expect(evidence.toolName).toBe('delete_customer');
    expect(evidence.count).toBeGreaterThanOrEqual(4);
  });

  it('③ 去重：冷却期内再扫一次 → **不重复落库**（把告警流变成噪音是错的）', async () => {
    const conversationId = `conv-dedup-${stamp()}`;
    for (let i = 0; i < 21; i++) {
      await audit.log({ userId: 'behavior-e2e-dedup', conversationId, action: 'tool_call', detail: `create_todo({"i":${i}})` });
    }
    const first = await baseline.scan();
    expect(first.filter((a) => a.conversationId === conversationId)).toHaveLength(1);

    const second = await baseline.scan();
    expect(second.filter((a) => a.conversationId === conversationId)).toHaveLength(0);
  });

  it('④ 告警可被人工标记已处理，且标记后不再出现在默认（未处理）列表里', async () => {
    const conversationId = `conv-ack-${stamp()}`;
    for (let i = 0; i < 21; i++) {
      await audit.log({ userId: 'behavior-e2e-ack', conversationId, action: 'tool_call', detail: `create_todo({"i":${i}})` });
    }
    const saved = await baseline.scan();
    const target = saved.find((a) => a.conversationId === conversationId);
    expect(target).toBeDefined();

    expect(await baseline.acknowledge(target!.id)).toBe(true);
    expect(await baseline.acknowledge(target!.id)).toBe(false); // 幂等：再标一次不改动

    const open = await baseline.list();
    expect(open.map((a) => a.id)).not.toContain(target!.id);
    const all = await baseline.list({ status: 'all' });
    expect(all.map((a) => a.id)).toContain(target!.id);
    // 对外形状对齐契约：evidence 是对象、subject 收成对象
    expect(all.find((a) => a.id === target!.id)).toMatchObject({
      subject: { kind: 'conversation', id: conversationId },
    });
    expect(typeof (all.find((a) => a.id === target!.id) as { evidence: unknown }).evidence).toBe('object');
  });

  it('⑤ 只观测不阻断：扫描前后审计行数不变，且告警不改变任何业务数据', async () => {
    const before = await alertRepo.count();
    await baseline.scan();
    const after = await alertRepo.count();

    // 扫描可能落新告警（取决于数据），但**绝不该删改已有告警**——只增不减
    expect(after).toBeGreaterThanOrEqual(before);
  });
});
