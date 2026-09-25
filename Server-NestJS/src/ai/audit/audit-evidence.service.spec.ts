// SPDX-License-Identifier: Apache-2.0

import { createHash, createHmac } from 'crypto';
import { NotFoundException } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AuditEvidenceService } from './audit-evidence.service';
import { AuditStatsService } from './audit-stats.service';

/** ① 证据根（§internal.17 ①，docs/evidence-root.spec.md）：getEvidenceRoot 装配 + 鉴权 + 根锚 */
describe('AuditEvidenceService.getEvidenceRoot（① 证据根 v3）', () => {
  const AUDIT_HMAC_KEY = 'test-evidence-root-key';

  function build(opts: { effect?: any | null; viewer?: string; isAdmin?: boolean; convRows?: any[]; governancePolicy?: any } = {}) {
    const logRepo = {
      find: jest.fn().mockResolvedValue(opts.convRows ?? []),
      findOne: jest.fn(),
    };
    // A8: the lookup is narrowed to the viewer when one is passed, so the stub has to honour
    // `where.userId`. A stub that always returns the fixture would hand back a row the real query
    // never would, and the non-owner case could not be observed at all.
    //
    // A8：传了查看者时查询会按用户收窄，故替身必须尊重 `where.userId`。恒返回固定行的替身
    // 会交出真实查询永远不会返回的行，非本人那条路径也就根本测不出来。
    const effectsRepo = {
      findOne: jest.fn().mockImplementation(async (arg?: { where?: { userId?: string } }) => {
        if (!opts.effect) return null;
        const scoped = arg?.where?.userId;
        return scoped === undefined || scoped === opts.effect.userId ? opts.effect : null;
      }),
    };
    const operationAudit = {
      chainRowsByTarget: jest.fn().mockResolvedValue([
        { seq: 1, id: 500, prevHash: null, hash: 'a'.repeat(64), payload: { method: 'PATCH', path: '/crm/tasks/7' } },
      ]),
    } as any;
    const governancePolicy = opts.governancePolicy ?? (undefined as any);
    // 证据域已独立成服务（阶段 3 第三刀）：构造参数随之收敛
    const service = new AuditEvidenceService(
      logRepo as any,
      effectsRepo as any,
      { computeHash: jest.fn() } as any,
      undefined, // cacheService
      undefined, // authorizationExplainer
      undefined, // agentService
      operationAudit,
      governancePolicy,
    );
    return { service, logRepo, effectsRepo, operationAudit, governancePolicy };
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
    // 含补偿锚路径：级联补偿行按根业务 id 落 targetId，不带这条子串会漏掉「被补偿过」的事实
    expect(operationAudit.chainRowsByTarget).toHaveBeenCalledWith('7', [
      '/crm/tasks/',
      '/ai/tool-effects/compensate',
    ]);
    expect(out.chains.operationAudit).toHaveLength(1);
    // 根锚：side-effect 摘要 + digest 自洽
    const sideAnchor = out.root.anchors.find((a: any) => a.kind === 'side-effect')!;
    expect(sideAnchor.hash).toBe(createHash('sha256').update(JSON.stringify(out.effect)).digest('hex'));
    // 切片一（1.0.8 deferred）：决策/审计链锚（ai-audit）与副作用锚都入根锚——chains 非空，不再只断副作用
    const aiAnchor = out.root.anchors.find((a: any) => a.kind === 'ai-audit');
    expect(aiAnchor).toBeTruthy();
    expect(aiAnchor.rowId).toBe(convRow.id);
    expect(aiAnchor.hash).toBe('b'.repeat(64));
    expect(out.root.anchors.map((a: any) => a.kind)).toEqual(
      expect.arrayContaining(['ai-audit', 'side-effect']),
    );
    expect(out.root.digest).toBe(createHash('sha256').update(JSON.stringify(out.root.anchors)).digest('hex'));
    // ① spec 对齐：业务摘要（trigger 存在时经 summarizeAudit）
    expect(out.summary).toBeTruthy();
    expect(typeof out.summary?.sentence).toBe('string');
    expect(out.summary?.stats).toBeDefined();
    // replay：无 governancePolicy 注入 → 省略（replayDecision 不调）
    expect(out.replay).toBeNull();
    // 签名（v3 canonical 可复现：含 summary——存在才含，与导出同源）
    const canonical = JSON.stringify({
      action: out.action,
      authorization: out.authorization ?? null,
      decision: out.decision,
      effect: out.effect,
      chains: out.chains,
      root: out.root,
      exportedAt: out.exportedAt,
      ...(out.summary ? { summary: out.summary } : {}),
      ...(out.replay ? { replay: out.replay } : {}),
    });
    // §11 双签：未配 SM2_PRIVATE_KEY → sm2 段缺席（而不是伪造一个空段）；HMAC 落在 signature.hmac
    expect(out.signature?.hmac).toBe(createHmac('sha256', AUDIT_HMAC_KEY).update(canonical).digest('hex'));
    expect(out.signature?.sm2).toBeUndefined();
  });

  it('replay wire：授权快照 policy.revision → replayDecision 被调 + replay 段入包', async () => {
    const replayDecision = jest.fn().mockResolvedValue({
      mode: 'history', verifiable: true, reproducible: true, policyChanged: false, toolDecisionChanged: false,
      recordedRevision: 'ab12cd34ef56', currentRevision: 'ab12cd34ef56',
    });
    const { service, governancePolicy } = build({
      effect,
      viewer: '42',
      convRows: [convRow],
      governancePolicy: { replayDecision },
    });
    const out = await service.getEvidenceRoot('crm_task', 7, '42', false);
    // 授权快照带 policy.revision + effect.toolName → replayDecision 被调
    expect(replayDecision).toHaveBeenCalledWith(expect.objectContaining({
      tool: 'create_followup_task',
      checks: expect.any(Array),
      policyRevision: 'ab12cd34ef56',
    }));
    expect(out.replay).toMatchObject({ reproducible: true, recordedRevision: 'ab12cd34ef56' });
  });

  it('副作用不存在 → 404', async () => {
    const { service } = build({ effect: null });
    await expect(service.getEvidenceRoot('crm_task', 999, '42', false)).rejects.toThrow(NotFoundException);
  });

  it('非本人非管理员 → 404：按用户收窄，不确认该动作存在（防枚举，同 auth 域口径）', async () => {
    const { service } = build({ effect, viewer: '7' });
    await expect(service.getEvidenceRoot('crm_task', 7, '7', false)).rejects.toThrow(NotFoundException);
  });

  it('管理员可读他人动作', async () => {
    const { service } = build({ effect, viewer: '1', isAdmin: true, convRows: [convRow] });
    await expect(service.getEvidenceRoot('crm_task', 7, '1', true)).resolves.toMatchObject({
      action: { id: 'crm_task:7' },
    });
  });
});

describe('AuditEvidenceService（报表 / 链校验 / 证据装配）', () => {
  let service: AuditEvidenceService;
  let logRepo: { find: jest.Mock; findOne: jest.Mock; createQueryBuilder: jest.Mock };
  let effectsRepo: { count: jest.Mock; find: jest.Mock; findOne: jest.Mock };
  let chain: { computeHash: jest.Mock; verifyChain: jest.Mock };

  beforeEach(() => {
    logRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      createQueryBuilder: jest.fn(),
    };
    effectsRepo = {
      count: jest.fn().mockResolvedValue(0),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
    };
    chain = {
      computeHash: jest.fn().mockReturnValue('h'),
      verifyChain: jest.fn().mockReturnValue({ valid: true, checked: 0 }),
    };
    service = new AuditEvidenceService(
      logRepo as never,
      effectsRepo as never,
      chain as never,
      undefined, // cacheService
      // §internal.16 A-5 放行快照：authorizationExplainer 供「无快照降级重算」场景（快照场景不应调用）
      {
        explainAuthorization: jest.fn().mockResolvedValue({
          tool: 'query_customers',
          checks: [{ name: 'RECOMPUTED', ok: true }],
        }),
      } as never,
    );
  });

    it('verifyChain 沿 id 升序取数并委托链校验', async () => {
      logRepo.find.mockResolvedValue([{ id: 1, prevHash: null, hash: 'a' }]);
      await service.verifyChain();
      expect(logRepo.find).toHaveBeenCalledWith({ order: { id: 'ASC' } });
      expect(chain.verifyChain).toHaveBeenCalled();
    });

    it('E-2：valid 链返回最近 24 条切片', async () => {
      const rows = Array.from({ length: 30 }, (_, i) => ({
        id: i + 1, prevHash: i === 0 ? null : `h${i}`, hash: `h${i + 1}`,
        createdAt: new Date(), action: 'chat', detail: null, isError: false,
      }));
      logRepo.find.mockResolvedValue(rows);
      (chain.verifyChain as jest.Mock).mockReturnValue({ valid: true, checked: 30 });
      const result = await service.verifyChain();
      expect(result.chain).toHaveLength(24);
      expect(result.chain[0].id).toBe(7); // 30-24+1
      expect(result.chain[23].id).toBe(30);
      expect(result.chain.every((n) => !n.broken)).toBe(true);
    });

    it('E-2：broken 链以断点为中心切片并标记断点行', async () => {
      const rows = Array.from({ length: 30 }, (_, i) => ({
        id: i + 1, prevHash: i === 0 ? null : `h${i}`, hash: `h${i + 1}`,
        createdAt: new Date(), action: 'tool_call', detail: 'query_customers({})', isError: false,
      }));
      logRepo.find.mockResolvedValue(rows);
      (chain.verifyChain as jest.Mock).mockReturnValue({ valid: false, checked: 10, brokenIndex: 11 });
      const result = await service.verifyChain();
      expect(result.chain.length).toBeLessThan(30); // 断点窗口而非全量
      const brokenNode = result.chain.find((n) => n.broken);
      expect(brokenNode).toBeDefined();
      expect(brokenNode!.id).toBe(11);
      expect(brokenNode!.toolName).toBe('query_customers');
    });

    it('feedback 后置写入不参与哈希 payload（submitFeedback 不断链，HS-11）', async () => {
      logRepo.find.mockResolvedValue([{ id: 1, prevHash: null, hash: 'a' }]);
      let payloadFor: ((row: Record<string, unknown>) => Record<string, unknown>) | undefined;
      (chain.verifyChain as jest.Mock).mockImplementation((_rows, cb) => {
        payloadFor = cb;
        return { valid: true, checked: 1 };
      });
      await service.verifyChain();
      // 即使行里已写入 feedback（submitFeedback 后置更新），payload 仍恒为 null —— 与写入时 canonical 一致
      const payload = payloadFor!({
        id: 1,
        prevHash: null,
        hash: 'a',
        feedback: 'thumbs_down',
        feedbackNote: '回答不准',
      });
      expect(payload.feedback).toBeNull();
      expect(payload.feedbackNote).toBeNull();
    });

    it('§internal.16 A-1：business_event/evidence 不入哈希 payload（链外，_payload 恒 null）', async () => {
      logRepo.find.mockResolvedValue([{ id: 1, prevHash: null, hash: 'a' }]);
      let payloadFor: ((row: Record<string, unknown>) => Record<string, unknown>) | undefined;
      (chain.verifyChain as jest.Mock).mockImplementation((_rows, cb) => {
        payloadFor = cb;
        return { valid: true, checked: 1 };
      });
      await service.verifyChain();
      const payload = payloadFor!({
        id: 1,
        prevHash: null,
        hash: 'a',
        businessEvent: 'CustomerRiskAssessed',
        evidence: '{"decision":"high"}',
      });
      expect(payload.businessEvent).toBeNull();
      expect(payload.evidence).toBeNull();
    });

    it('PC-2：verify/stats/cost/action-report 响应无越界键（⊆ 冻结契约）', async () => {
      (chain.verifyChain as jest.Mock).mockReturnValue({ valid: true, checked: 0 });
      (logRepo.find as jest.Mock).mockResolvedValue([]);
      const statsService = new AuditStatsService(logRepo as never, undefined);
      const propsOf = (name: string) =>
        Object.keys(
          (JSON.parse(readFileSync(resolve(__dirname, `../../../specs/protocol/schemas/v1/${name}`), 'utf8')) as {
            properties: Record<string, unknown>;
          }).properties,
        );
      const noExtra = (obj: Record<string, unknown>, name: string) => {
        const props = propsOf(name);
        expect(Object.keys(obj).filter((k) => !props.includes(k))).toEqual([]);
      };
      noExtra(await service.verifyChain(), 'audit-chain-verification.schema.json');
      // 聚合响应已由 AuditStatsService 产出（阶段 3 拆分）——契约校验跟着响应走，断言不变
      noExtra(await statsService.getAllStats(), 'audit-usage-stats.schema.json');
      noExtra(await statsService.getCostBreakdown(), 'audit-cost-breakdown.schema.json');
      noExtra(await service.getActionReport(), 'audit-action-report.schema.json');
    });

  describe('getActionReport（§10 P1 合规证据包）', () => {
    it('聚合 执行/批准/拒绝/阻断 + 副作用 + 哈希链', async () => {
      logRepo.find.mockResolvedValue([
        { id: 1, userId: '1', action: 'tool_call', detail: 'create_followup_task({"customerId":1})', isError: false, createdAt: new Date() },
        { id: 2, userId: '1', action: 'tool_confirmation', detail: 'create_followup_task() → approve', isError: false, createdAt: new Date() },
        { id: 3, userId: '1', action: 'tool_confirmation', detail: 'x() → decline', isError: true, errorMessage: 'User declined the operation', createdAt: new Date() },
        { id: 4, userId: '1', action: 'tool_call', detail: 'query_customers({})', isError: true, errorMessage: 'Tool "query_evil" is blocked (risk level R5)', createdAt: new Date() },
      ]);
      effectsRepo.count.mockResolvedValue(2);
      chain.verifyChain.mockReturnValue({ valid: true, checked: 4 });

      const report = await service.getActionReport({ userId: '1' });

      expect(report.summary).toEqual({
        executed: 1,
        approved: 1,
        rejected: 1,
        blocked: 1,
        errors: 2,
        effects: 2,
      });
      expect(report.hashChain).toEqual({ valid: true, checked: 4, brokenIndex: null });
      // 明细样本：从 detail 提取工具名 + 阻断原因可见
      expect(report.samples[0].toolName).toBe('create_followup_task');
      expect(report.samples[3].toolName).toBe('query_customers');
      expect(report.samples[3].errorMessage).toContain('blocked (risk level R5)');
      // B3：同日日志聚合到单个 byDay 桶（计数与 summary 对齐）
      expect(report.byDay).toHaveLength(1);
      expect(report.byDay[0]).toMatchObject({ executed: 1, approved: 1, rejected: 1, blocked: 1, errors: 2 });
    });

    it('byDay 按 UTC 日聚合（多日升序，阻断/错误分别入桶）', async () => {
      logRepo.find.mockResolvedValue([
        { id: 1, userId: '1', action: 'tool_call', detail: 'create_x()', isError: false, createdAt: new Date('2026-08-20T10:00:00Z') },
        { id: 2, userId: '1', action: 'tool_call', detail: 'query_y({})', isError: true, errorMessage: 'blocked (risk level R5)', createdAt: new Date('2026-08-20T11:00:00Z') },
        { id: 3, userId: '1', action: 'tool_call', detail: 'create_z()', isError: false, createdAt: new Date('2026-08-21T09:00:00Z') },
      ]);
      effectsRepo.count.mockResolvedValue(0);
      chain.verifyChain.mockReturnValue({ valid: true, checked: 3 });

      const report = await service.getActionReport();

      expect(report.byDay).toEqual([
        { date: '2026-08-20', executed: 1, approved: 0, rejected: 0, blocked: 1, errors: 1 },
        { date: '2026-08-21', executed: 1, approved: 0, rejected: 0, blocked: 0, errors: 0 },
      ]);
    });

    it('无日志时全零 + 哈希链 checked 0', async () => {
      logRepo.find.mockResolvedValue([]);
      effectsRepo.count.mockResolvedValue(0);
      chain.verifyChain.mockReturnValue({ valid: true, checked: 0 });

      const report = await service.getActionReport();
      expect(report.summary.executed).toBe(0);
      expect(report.hashChain).toEqual({ valid: true, checked: 0, brokenIndex: null });
      expect(report.samples).toEqual([]);
      expect(report.byDay).toEqual([]);
    });

    it('E-1：effectDiffs 解析副作用 before/after 快照', async () => {
      logRepo.find.mockResolvedValue([]);
      effectsRepo.count.mockResolvedValue(1);
      effectsRepo.find.mockResolvedValue([
        {
          id: 7,
          toolName: 'create_followup_task',
          resultType: 'crm_task',
          resultId: 3,
          createdAt: new Date('2026-08-30T00:00:00Z'),
          beforeSnapshot: null,
          afterSnapshot: '{"id":3,"title":"跟进","status":"open"}',
        },
      ]);
      chain.verifyChain.mockReturnValue({ valid: true, checked: 0 });

      const report = await service.getActionReport({ userId: '1' });
      expect(report.effectDiffs).toHaveLength(1);
      expect(report.effectDiffs[0]).toMatchObject({
        resultType: 'crm_task',
        before: null,
        after: { id: 3, title: '跟进', status: 'open' },
      });
    });

    it('E-1：快照非法 JSON 降级 null（不破坏证据包）', async () => {
      logRepo.find.mockResolvedValue([]);
      effectsRepo.count.mockResolvedValue(1);
      effectsRepo.find.mockResolvedValue([
        { id: 8, toolName: 'create_todo', resultType: 'todo', resultId: 1, createdAt: new Date(), beforeSnapshot: 'not-json', afterSnapshot: null },
      ]);
      chain.verifyChain.mockReturnValue({ valid: true, checked: 0 });

      const report = await service.getActionReport();
      expect(report.effectDiffs[0]).toMatchObject({ before: null, after: null });
    });
  });

  describe('getActionReportExport（D4/A2 证据包：format + chain + 签名）', () => {
    it('导出含 format / 全量 chain（payload 供离线重算）/ 签名覆盖 chain', async () => {
      (service as any).getActionReport = jest.fn().mockResolvedValue({
        summary: { totalCalls: 1 },
        hashChain: { valid: true, checked: 2, brokenIndex: null },
        effectDiffs: [],
      });
      const prevKey = process.env.AUDIT_HMAC_KEY;
      process.env.AUDIT_HMAC_KEY = 'ab'.repeat(32);
      try {
        logRepo.find.mockResolvedValue([
          { id: 1, userId: '42', conversationId: null, action: 'tool_call', detail: 'query_customers({})', model: 'deepseek-v4-flash', provider: 'deepseek', promptTokens: 10, completionTokens: 5, durationMs: 100, isError: false, errorMessage: null, authorization: null, prevHash: null, hash: 'a'.repeat(64) },
          { id: 2, userId: '42', conversationId: null, action: 'chat', detail: 'hello', model: null, provider: null, promptTokens: null, completionTokens: null, durationMs: null, isError: false, errorMessage: null, authorization: null, prevHash: 'a'.repeat(64), hash: 'b'.repeat(64) },
        ]);
        const out = await service.getActionReportExport({});
        expect(out.format).toBe('keelbase-audit-evidence/2');
        expect(out.generator).toBe('keelbase-audit-export');
        expect(out.compliance).toEqual([]); // mock report 无 samples → 空合规段
        expect(out.chain).toHaveLength(2);
        expect(out.chain[0]).toMatchObject({ seq: 1, id: 1, prevHash: null, hash: 'a'.repeat(64) });
        expect(out.chain[1].seq).toBe(2);
        expect(out.chain[1].prevHash).toBe('a'.repeat(64));
        // payload 与写入侧一致（feedback/businessEvent 恒 null，供离线重算）
        expect(out.chain[0].payload).toMatchObject({ userId: '42', action: 'tool_call', completionTokens: 5, feedback: null, businessEvent: null, evidence: null });
        expect(out.signature?.hmac).toMatch(/^[0-9a-f]{64}$/);
        // ② 绑定：证据包(/2)键集 == evidence-package v3 契约的 /2 分支
        const pkgSchema = JSON.parse(
          readFileSync(resolve(__dirname, '../../../specs/protocol/schemas/v3/evidence-package.schema.json'), 'utf8'),
        ) as { oneOf: Array<{ properties: Record<string, unknown> & { format?: { const: string } } }> };
        const branch = pkgSchema.oneOf.find((b) => b.properties.format?.const === 'keelbase-audit-evidence/2');
        expect(branch).toBeDefined();
        expect(Object.keys(out).sort()).toEqual(Object.keys(branch!.properties).sort());
      } finally {
        if (prevKey === undefined) delete process.env.AUDIT_HMAC_KEY;
        else process.env.AUDIT_HMAC_KEY = prevKey;
      }
    });

    it('§internal.16 A-6 合规段：samples 业务摘要 + 责任链（签名覆盖 compliance）', async () => {
      (service as any).getActionReport = jest.fn().mockResolvedValue({
        summary: { executed: 1 },
        hashChain: { valid: true, checked: 1, brokenIndex: null },
        effectDiffs: [],
        samples: [{ id: 1, action: 'tool_call', toolName: 'analyze_customer_risk', isError: false, createdAt: new Date() }],
      });
      const prevKey = process.env.AUDIT_HMAC_KEY;
      process.env.AUDIT_HMAC_KEY = 'ab'.repeat(32);
      try {
        logRepo.find.mockResolvedValue([
          { id: 1, userId: '42', username: 'alex', conversationId: 'c1', action: 'tool_call', detail: 'analyze_customer_risk({"id":7})', businessEvent: 'CustomerRiskAssessed', evidence: '{"decision":"high","evidence":["订单降42%"]}', agentId: 'key-a', prevHash: null, hash: 'a'.repeat(64) },
          { id: 2, userId: '42', username: 'alex', conversationId: 'c1', action: 'chat', detail: 'hi', prevHash: 'a'.repeat(64), hash: 'b'.repeat(64) },
        ]);
        const out = await service.getActionReportExport({});
        expect(out.compliance).toHaveLength(1);
        expect(out.compliance[0].summary.sentence).toContain('alex');
        expect(out.compliance[0].summary.sentence).toContain('high');
        expect(out.compliance[0].businessEvent).toBe('CustomerRiskAssessed');
        expect(out.compliance[0].identityChain.human.username).toBe('alex');
        expect(out.compliance[0].identityChain.tool.toolName).toBe('analyze_customer_risk');
      } finally {
        if (prevKey === undefined) delete process.env.AUDIT_HMAC_KEY;
        else process.env.AUDIT_HMAC_KEY = prevKey;
      }
    });
  });

  describe('getChain（§internal.16 A-5 跨系统身份链）', () => {
    it('聚合 Human→Intent→Agent→Tool→Action + 会话工具序列 + source', async () => {
      logRepo.findOne.mockResolvedValue({
        id: 1, userId: '42', username: 'bob', action: 'tool_call',
        detail: 'create_followup_task({"customerId":7})',
        businessEvent: 'FollowupTaskCreated', agentId: 'key-legacy-erp', callerAgentId: 'research',
        businessIntent: '跟进高风险客户', source: 'bridge',
        conversationId: 'c1', createdAt: new Date(),
      });
      logRepo.find.mockResolvedValue([
        { id: 1, action: 'tool_call', detail: 'create_followup_task({})', businessEvent: 'FollowupTaskCreated', agentId: 'key-legacy-erp', createdAt: new Date() },
      ]);
      const res = await service.getChain(1);
      expect(res.human.username).toBe('bob');
      expect(res.agent.agentId).toBe('key-legacy-erp');
      expect(res.agent.callerAgentId).toBe('research');
      expect(res.intent).toBe('跟进高风险客户');
      expect(res.source).toBe('bridge');
      expect(res.tool.toolName).toBe('create_followup_task');
      expect(res.action.businessEvent).toBe('FollowupTaskCreated');
      expect(res.chain).toHaveLength(1);
    });

    it('拒绝场景：解析 authorization checks 为授权依据', async () => {
      logRepo.findOne.mockResolvedValue({
        id: 2, userId: '42', action: 'tool_call', detail: 'query_evil({})',
        authorization: JSON.stringify([{ name: 'risk_policy', ok: false, note: 'R5 阻断' }]),
        createdAt: new Date(),
      });
      logRepo.find.mockResolvedValue([]);
      const res = await service.getChain(2);
      expect(res.authorization.denied).toEqual([{ name: 'risk_policy', ok: false, note: 'R5 阻断' }]);
      expect(res.authorization.allowed).toBeNull();
    });

    it('放行快照优先：allowed 用事件时点快照（不重算当前策略）', async () => {
      const snapshotChecks = [{ name: 'user_scoped', ok: true, note: '仅本人数据' }];
      logRepo.findOne.mockResolvedValue({
        id: 3, userId: '42', action: 'tool_call', detail: 'query_customers({})',
        authorization: JSON.stringify({ allowed: true, tool: 'query_customers', riskLevel: 'R1', strategy: 'auto', checks: snapshotChecks }),
        createdAt: new Date(),
      });
      logRepo.find.mockResolvedValue([]);
      const res = await service.getChain(3);
      expect(res.authorization.denied).toBeNull();
      // allowed 取快照 checks（而非 aiService.explainAuthorization 的 RECOMPUTED）→ 证明快照优先、未重算
      expect(res.authorization.allowed).toEqual({ checks: snapshotChecks, riskLevel: 'R1' });
    });

    it('§internal.17 ③ Policy Evidence：快照带 policy.revision → allowed 投影携带「哪一版规则允许」', async () => {
      logRepo.findOne.mockResolvedValue({
        id: 5, userId: '42', action: 'tool_call', detail: 'create_followup_task({})',
        authorization: JSON.stringify({
          allowed: true, tool: 'create_followup_task', riskLevel: 'R3', strategy: 'confirmation',
          checks: [{ name: 'user_scoped', ok: true, note: '仅本人数据' }],
          policy: { revision: 'a1b2c3d4e5f6', updatedAt: '2026-09-04T09:20:00.000Z' },
        }),
        createdAt: new Date(),
      });
      logRepo.find.mockResolvedValue([]);
      const res = await service.getChain(5);
      expect(res.authorization.allowed?.policy).toEqual({ revision: 'a1b2c3d4e5f6', updatedAt: '2026-09-04T09:20:00.000Z' });
      // 无版本的历史行仍不注入键（向后兼容，见放行快照测试）
    });

    it('历史数据无放行快照 → 降级当前策略重算（向后兼容）', async () => {
      logRepo.findOne.mockResolvedValue({
        id: 4, userId: '42', action: 'tool_call', detail: 'query_customers({})', authorization: null,
        createdAt: new Date(),
      });
      logRepo.find.mockResolvedValue([]);
      const res = await service.getChain(4);
      expect(res.authorization.denied).toBeNull();
      expect(res.authorization.allowed).toEqual({
        tool: 'query_customers',
        checks: [{ name: 'RECOMPUTED', ok: true }],
      });
    });
  });
});
