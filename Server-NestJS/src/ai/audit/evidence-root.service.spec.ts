// SPDX-License-Identifier: Apache-2.0

import { createHash, createHmac } from 'crypto';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { AuditService } from './audit.service';

/** ① 证据根（§22.17 ①，docs/evidence-root.spec.md）：getEvidenceRoot 装配 + 鉴权 + 根锚 */
describe('AuditService.getEvidenceRoot（① 证据根 v3）', () => {
  const AUDIT_HMAC_KEY = 'test-evidence-root-key';

  function build(opts: { effect?: any | null; viewer?: string; isAdmin?: boolean; convRows?: any[] } = {}) {
    const logRepo = {
      find: jest.fn().mockResolvedValue(opts.convRows ?? []),
      findOne: jest.fn(),
    };
    const usageRepo = { findOne: jest.fn(), save: jest.fn(), create: jest.fn((x: any) => x ?? {}) } as any;
    const effectsRepo = { findOne: jest.fn().mockResolvedValue(opts.effect ?? null) };
    const operationAudit = {
      chainRowsByTarget: jest.fn().mockResolvedValue([
        { seq: 1, id: 500, prevHash: null, hash: 'a'.repeat(64), payload: { method: 'PATCH', path: '/crm/tasks/7' } },
      ]),
    } as any;
    const service = new AuditService(
      logRepo as any,
      usageRepo,
      effectsRepo as any,
      { computeHash: jest.fn() } as any,
      { options: { type: 'postgres' } } as any,
      undefined,
      undefined,
      undefined,
      undefined,
      operationAudit,
    );
    return { service, logRepo, effectsRepo, operationAudit };
  }

  const allowedSnapshot = JSON.stringify({
    allowed: true,
    tool: 'create_followup_task',
    riskLevel: 'R3',
    strategy: 'confirmation',
    checks: [{ name: 'user_scoped', ok: true, note: '仅本人数据' }],
    policy: { revision: 'ab12cd34ef56', updatedAt: '2026-09-04T09:20:00.000Z' },
  });
  const convRow = {
    id: 38172,
    userId: '42',
    username: 'alex',
    action: 'tool_call',
    detail: 'create_followup_task({"customerId":7})',
    conversationId: 'c1',
    authorization: allowedSnapshot,
    businessEvent: 'FollowupTaskCreated',
    evidence: JSON.stringify({ decision: 'create', evidence: [], policy: 'p', confidence: 0.9 }),
    hash: 'b'.repeat(64),
    createdAt: new Date('2026-09-04T09:21:00Z'),
  };
  const effect = {
    id: 9281,
    userId: '42',
    conversationId: 'c1',
    toolName: 'create_followup_task',
    resultType: 'crm_task',
    resultId: 7,
    beforeSnapshot: null,
    afterSnapshot: '{"id":7,"status":"open"}',
  };

  beforeEach(() => {
    process.env.AUDIT_HMAC_KEY = AUDIT_HMAC_KEY;
  });
  afterEach(() => {
    delete process.env.AUDIT_HMAC_KEY;
  });

  it('装配 v3 证据根：action/authorization(policy.revision)/decision/副作用锚+根锚/签名', async () => {
    const { service, operationAudit } = build({ effect, viewer: '42', convRows: [convRow] });
    const out = await service.getEvidenceRoot('crm_task', 7, '42', false);

    expect(out.format).toBe('keelbase-audit-evidence/3');
    expect(out.action).toMatchObject({ id: 'crm_task:7', resultType: 'crm_task', resultId: 7, effectId: 9281, conversationId: 'c1' });
    expect(out.authorization?.allowed).toMatchObject({ checks: expect.any(Array), policy: { revision: 'ab12cd34ef56' } });
    expect(out.decision.businessEvent).toBe('FollowupTaskCreated');
    expect(out.effect.before).toBeNull();
    expect(out.effect.after).toEqual({ id: 7, status: 'open' });
    // 子链 + operation-audit 反查
    expect(out.chains.aiAudit).toHaveLength(1);
    expect(operationAudit.chainRowsByTarget).toHaveBeenCalledWith('7', ['/crm/tasks/']);
    expect(out.chains.operationAudit).toHaveLength(1);
    // 根锚：side-effect 摘要 + digest 自洽
    const sideAnchor = out.root.anchors.find((a: any) => a.kind === 'side-effect')!;
    expect(sideAnchor.hash).toBe(createHash('sha256').update(JSON.stringify(out.effect)).digest('hex'));
    expect(out.root.digest).toBe(createHash('sha256').update(JSON.stringify(out.root.anchors)).digest('hex'));
    // 签名（v3 canonical 可复现）
    const canonical = JSON.stringify({
      action: out.action,
      authorization: out.authorization ?? null,
      decision: out.decision,
      effect: out.effect,
      chains: out.chains,
      root: out.root,
      exportedAt: out.exportedAt,
    });
    expect(out.signature).toBe(createHmac('sha256', AUDIT_HMAC_KEY).update(canonical).digest('hex'));
  });

  it('副作用不存在 → 404', async () => {
    const { service } = build({ effect: null });
    await expect(service.getEvidenceRoot('crm_task', 999, '42', false)).rejects.toThrow(NotFoundException);
  });

  it('非本人非管理员 → 403（不泄漏存在性前先拒）', async () => {
    const { service } = build({ effect, viewer: '7' });
    await expect(service.getEvidenceRoot('crm_task', 7, '7', false)).rejects.toThrow(ForbiddenException);
  });

  it('管理员可读他人动作', async () => {
    const { service } = build({ effect, viewer: '1', isAdmin: true, convRows: [convRow] });
    await expect(service.getEvidenceRoot('crm_task', 7, '1', true)).resolves.toMatchObject({
      action: { id: 'crm_task:7' },
    });
  });
});
