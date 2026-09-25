// SPDX-License-Identifier: Apache-2.0

/**
 * 审计证据与报表（从 `AuditService` 拆出的第三个领域，健康清单 §3 阶段 3）。
 *
 * 这一刀与「写入」切开的是**读侧的举证能力**：合规报表（Action Report）、证据包导出（/2、/3）、
 * 决策解释、跨系统身份链、以及**链完整性校验**。它们此前与写链、每日配额挤在同一个 1300 行的类里。
 *
 * `verifyChain` 一并迁入：它被报表调用，本身是**读侧校验**（写入路径只是失效它的缓存，见 `cache-keys.ts`）。
 * 若把它留在写入侧，本服务就得反向依赖那个更大的类——正是健康清单警告的「跨类调用爆炸」。
 *
 * **行为与拆分前逐字一致**——搬迁不改逻辑（阶段 3 纪律：行为不变，测试作护栏）。
 */
import { Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { createHash, createHmac } from 'crypto';
import { AiAuditLog } from './ai-audit-log.entity';
import { AiToolSideEffect } from '../tool-effects/ai-tool-side-effect.entity';
import { AuditChainService, ChainVerification } from '../../common/audit-chain/audit-chain.service';
import { CacheService } from '../../common/cache/cache.service';
import { AuthorizationExplainerService } from '../authorization-explainer.service';
import { AiAgentService } from '../agents/ai-agent.service';
import { OperationAuditService } from '../../operation-audit/operation-audit.service';
import { GovernancePolicyService } from '../governance/governance-policy.service';
import {
  summarizeAudit,
  AuditInterpretation,
  AuditInterpretationRow,
  AuditInterpreterStats,
} from './audit-interpreter.service';
import { extractToolName } from './tool-name';
import { buildPayload } from './payload';
import { AUDIT_VERIFY_CACHE_KEY } from './cache-keys';
import { AuditByDayBucket, byDayAggregation } from './by-day';
import { Sm2SignatureBlock, buildSm2Block, sm2ConfigFromEnv } from '../../common/crypto/sm2';

export interface ActionReport {
  period: { since: string | null; to: string };
  summary: {
    executed: number; // 工具执行（含写）
    approved: number; // 写操作人工批准
    rejected: number; // 写操作人工拒绝/超时
    blocked: number; // 工具被拒（治理/越权/R5）
    errors: number; // 全部 error
    effects: number; // 可撤销副作用记录数
  };
  byAction: Array<{ action: string; count: number }>;
  /** B3 时间趋势：按 UTC 日聚合执行/批准/拒绝/阻断/错误（升序），合规报告可看趋势 */
  byDay: AuditByDayBucket[];
  hashChain: { valid: boolean; checked: number; brokenIndex: number | null };
  samples: Array<{
    id: number;
    action: string;
    toolName: string | null;
    isError: boolean;
    errorMessage?: string | null;
    /** §internal.16 A-6 合规：Decision Evidence + 责任链展示字段 */
    businessEvent?: string | null;
    evidence?: string | null;
    agentId?: string | null;
    createdAt: Date;
  }>;
  /** E-1 字段级变更审计：副作用 before/after 快照（limit 50，供证据包人工复核） */
  effectDiffs: Array<{
    id: number;
    toolName: string;
    resultType: string;
    resultId: number;
    createdAt: Date;
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
  }>;
}

/** A2 证据包 v2：链上原始行（payload 供离线重算），审计机构可独立机器验证 */
export interface EvidenceChainRow {
  /** 链序号（1 起，沿 id 升序） */
  seq: number;
  id: number;
  prevHash: string | null;
  hash: string;
  /** 链 payload（canonical 输入，与写入侧一致——verify-evidence.mjs 离线重算用） */
  payload: Record<string, unknown>;
}

/**
 * 证据包签名段（docs/evidence-root.spec.md §3 / §11）。
 * - `hmac`：对称，仅应用内可验（快验路径）；未配 AUDIT_HMAC_KEY/ENCRYPTION_KEY 但配了 SM2 私钥时为 null。
 * - `sm2`：非对称，第三方持公钥即可离线独立验签（国密 SM2-with-SM3）；未配 SM2_PRIVATE_KEY 时缺席。
 * 两者并存（双签），不互相替代。历史包该字段为字符串 HMAC —— 契约 v3 的 oneOf 同时接纳旧形态。
 */
export interface EvidenceSignature {
  hmac: string | null;
  sm2?: Sm2SignatureBlock;
}

/** D4 审计证据包：可提交审计机构的合规证据（报告 + 哈希链校验 + 导出时间戳 + 签名） */
export interface ActionReportExport {
  /** 证据包生成时间（ISO 8601） */
  exportedAt: string;
  /** 生成的工具（AUDIT_HMAC_KEY 或 ENCRYPTION_KEY，非空时） */
  generator: string;
  /** A2：证据包格式版本（'keelbase-audit-evidence/2'——A-6 含 compliance 段） */
  format: string;
  /** ActionReport 全量（含 hashChain verify） */
  report: ActionReport;
  /** §internal.16 A-6 合规：samples 每条的业务摘要 + 责任链 + 授权依据（签名覆盖防篡改） */
  compliance: Array<{
    id: number;
    businessEvent: string | null;
    evidence: string | null;
    summary: { sentence: string; stats: unknown } | null;
    /** D-3 人读「决策说明」（凭什么允许 / 为何拒绝；无授权快照为 null） */
    decisionNote: unknown | null;
    identityChain: unknown | null;
  }>;
  /** A2：链上原始行全量（id/prevHash/hash + payload），供 verify-evidence.mjs 离线重算 */
  chain: EvidenceChainRow[];
  /** 证据包签名（§3 / §11）：{hmac=HMAC-SHA256 应用内快验, sm2=非对称第三方独立验签}；未配任何密钥时为 null */
  signature: EvidenceSignature | null;
}

/** ① 证据根（§internal.17 ①，keelbase-audit-evidence/3）：单条 Business Action 跨链证据根（AUDIT-ID），离线整包验 */
export interface EvidenceRootExport {
  exportedAt: string;
  generator: string;
  format: string;
  action: { id: string; resultType: string; resultId: number; effectId: number; userId: string; conversationId: string | null };
  authorization: { denied: unknown; allowed: unknown } | null;
  decision: { businessEvent: string | null; evidence: string | null };
  effect: { id: number; toolName: string; before: unknown; after: unknown };
  chains: {
    aiAudit: EvidenceChainRow[];
    operationAudit: EvidenceChainRow[];
  };
  root: {
    algorithm: string;
    anchors: Array<{ kind: string; rowId: number; hash: string }>;
    digest: string;
  };
  /** ① spec 对齐：业务摘要（trigger 存在时经 summarizeAudit，可读叙事） */
  summary?: { sentence: string; stats: AuditInterpreterStats } | null;
  /** ① spec 装配：授权快照 policy.revision 下的决策可复现重放（governancePolicy 注入时） */
  replay?: Record<string, unknown> | null;
  signature: EvidenceSignature | null;
}

/** E-2 哈希链可视化：逐行链节点（verify 端点返回的切片） */
export interface AuditChainNode {
  id: number;
  createdAt: Date;
  action: string;
  toolName: string | null;
  prevHash: string | null;
  hash: string | null;
  isError: boolean;
  /** 断链行（prevHash 不连续 / hash 不符） */
  broken?: boolean;
}

@Injectable()
export class AuditEvidenceService {
  constructor(
    @InjectRepository(AiAuditLog)
    private readonly logRepo: Repository<AiAuditLog>,
    @InjectRepository(AiToolSideEffect)
    private readonly effectsRepo: Repository<AiToolSideEffect>,
    private readonly auditChain: AuditChainService,
    // 链校验结果 60s 缓存（消除 action-report 的二次全表扫描）
    @Optional() private readonly cacheService?: CacheService,
    // §internal.16 A-5 跨系统身份链：授权依据（缺失降级）
    @Optional() private readonly authorizationExplainer?: AuthorizationExplainerService,
    @Optional() private readonly agentService?: AiAgentService,
    // ① 证据根（§internal.17 ①）：operation-audit 链行（缺失降级）
    @Optional() private readonly operationAudit?: OperationAuditService,
    // ① replay wire：证据根装配点调 replayDecision（缺失降级 → replay 段省略）
    @Optional() private readonly governancePolicy?: GovernancePolicyService,
  ) {}

  /** HS-11：沿 id 升序校验审计哈希链完整性。返回含逐行链明细（切片，供 E-2 哈希链可视化）。60s 缓存（消除 action-report 二次全表扫描）。 */
  async verifyChain(): Promise<ChainVerification & { chain: AuditChainNode[] }> {
    const cached = await this.cacheService?.get<ChainVerification & { chain: AuditChainNode[] }>(AUDIT_VERIFY_CACHE_KEY);
    if (cached) return cached;
    // 只取**已入链**的行：`hash` 为 null 的行从未入链（AddAuditHashChain 迁移前的历史行；
    // 以及测试/工具直插的行）。让它们参与校验会让 genesis 检查在**第 1 行**即失败
    // （_matches(null, …) 恒 false）→ 整条链被误判 invalid，而链实际未被破坏。
    // 与副作用链 verifySideEffectChain 的 `filter(r => r.hash)` **同口径**：两条链对
    // 「未入链的行不参与校验」必须一致，否则同一份数据在两条链上会得出相反结论。
    const rows = (await this.logRepo.find({ order: { id: 'ASC' } })).filter((r) => r.hash);
    const result = this.auditChain.verifyChain(rows, (row) => buildPayload(row));
    const detailed = { ...result, chain: this._chainSlice(rows, result) };
    await this.cacheService?.set(AUDIT_VERIFY_CACHE_KEY, detailed, 60_000);
    return detailed;
  }

  /** E-2：把全量链切成可视窗口——valid 取最近 N；broken 以断点为中心窗口（断点行标 broken）。 */
  private _chainSlice(rows: AiAuditLog[], result: ChainVerification): AuditChainNode[] {
    const CHAIN_SLICE = 24;
    const b = result.brokenIndex ? result.brokenIndex - 1 : -1;
    let window: AiAuditLog[];
    let brokenOffset = -1;
    if (result.valid || b < 0) {
      window = rows.slice(-CHAIN_SLICE);
    } else {
      const start = Math.max(0, b - 6);
      const end = Math.min(rows.length, b + 4);
      window = rows.slice(start, end);
      brokenOffset = b - start;
    }
    return window.map((row, i) => ({
      id: row.id,
      createdAt: row.createdAt,
      action: row.action,
      toolName: extractToolName(row.detail),
      prevHash: row.prevHash ?? null,
      hash: row.hash ?? null,
      isError: row.isError ?? false,
      broken: i === brokenOffset,
    }));
  }


  /**
   * §10 P1 AI Action Report：合规证据包——聚合 AI 行为（执行/批准/拒绝/阻断）+ 副作用 + 审计哈希链。
   * 回答「AI 执行了什么写操作 / 谁批准 / 哪些被拒 / 审计链是否可验证」，作为 Business-safe 合规证据。
   */
  async getActionReport(
    options: { userId?: string; since?: Date; limit?: number } = {},
    fresh = false,
  ): Promise<ActionReport> {
    // E-3 聚合缓存：60s TTL；证据包导出（fresh）绕缓存直算（hashChain 必须当前）
    const sinceDay = options.since ? options.since.toISOString().slice(0, 10) : 'all';
    const cacheKey = `audit:report:${options.userId ?? 'all'}:${sinceDay}:${options.limit ?? 10}`;
    if (!fresh) {
      const cached = await this.cacheService?.get<ActionReport>(cacheKey);
      if (cached) return cached;
    }
    const where: Record<string, unknown> = {};
    if (options.userId) where.userId = options.userId;
    if (options.since) where.createdAt = Between(options.since, new Date());
    // E-3 列投影：只载聚合所需列（detail/errorMessage/authorization 保留——samples 工具名解析 + blocked 正则）
    // §internal.16 A-6 合规：补 businessEvent/evidence/agentId（Decision Evidence + 责任链）
    const logs = await this.logRepo.find({
      where,
      order: { createdAt: 'DESC' },
      select: {
        id: true, action: true, detail: true, isError: true, errorMessage: true, authorization: true,
        businessEvent: true, evidence: true, agentId: true, createdAt: true,
      },
    });

    let executed = 0;
    let approved = 0;
    let rejected = 0;
    let blocked = 0;
    let errors = 0;
    const byAction = new Map<string, number>();
    for (const l of logs) {
      byAction.set(l.action, (byAction.get(l.action) ?? 0) + 1);
      if (l.isError) { errors++; }
      if (l.action === 'tool_call') {
        // blocked = 工具被拒（authorization 标记或 errorMessage 含拒绝标记：R5/越权/禁用/权限）；
        // 执行失败（无拒绝标记）只算 error，不计 blocked
        if (l.isError && (l.authorization || /blocked|denied|拒绝|越权|R5|禁用|禁止|无权/i.test(l.errorMessage ?? ''))) { blocked++; }
        else if (!l.isError) { executed++; }
      } else if (l.action === 'tool_confirmation') {
        if (l.isError) { rejected++; }
        // R4 高影响动作等待审批（pending_approval）既非 approved 也非 rejected——不计入，防合规报告虚报
        else if (!l.detail?.includes('pending_approval')) { approved++; }
      }
    }
    // B3 时间趋势：按 UTC 日聚 5 段（与 getAllStats 共享 _byDayAggregation，避免重复聚合逻辑）
    const byDay = byDayAggregation(logs);

    const effWhere: Record<string, unknown> = {};
    if (options.userId) effWhere.userId = options.userId;
    if (options.since) effWhere.createdAt = Between(options.since, new Date());
    const effects = await this.effectsRepo.count({ where: effWhere });
    // E-1 字段级变更审计：副作用 before/after 快照示例（证据包人工复核；解析失败降级 null）
    const effectRows = await this.effectsRepo.find({
      where: effWhere,
      order: { createdAt: 'DESC' },
      take: 50,
    });
    const effectDiffs = effectRows.map((e) => ({
      id: e.id,
      toolName: e.toolName,
      resultType: e.resultType,
      resultId: e.resultId,
      createdAt: e.createdAt,
      before: parseSnapshot(e.beforeSnapshot),
      after: parseSnapshot(e.afterSnapshot),
    }));

    const chain = await this.verifyChain();
    const limit = Math.min(options.limit ?? 10, 50);
    const samples = logs.slice(0, limit).map((l) => ({
      id: l.id,
      action: l.action,
      toolName: extractToolName(l.detail),
      isError: l.isError,
      errorMessage: l.errorMessage,
      businessEvent: l.businessEvent ?? null,
      evidence: l.evidence ?? null,
      agentId: l.agentId ?? null,
      createdAt: l.createdAt,
    }));

    const result = {
      period: { since: options.since ? options.since.toISOString() : null, to: new Date().toISOString() },
      summary: { executed, approved, rejected, blocked, errors, effects },
      byAction: Array.from(byAction.entries())
        .map(([action, count]) => ({ action, count }))
        .sort((a, b) => b.count - a.count),
      byDay,
      hashChain: { valid: chain.valid, checked: chain.checked, brokenIndex: chain.brokenIndex ?? null },
      samples,
      effectDiffs,
    };
    if (!fresh) await this.cacheService?.set(cacheKey, result, 60_000);
    return result;
  }

  /** D4 审计证据包导出：ActionReport + 哈希链校验 + 导出时间戳 + 签名（可提交审计机构）。A2：含全量链原始行，可离线机器验证。 */
  async getActionReportExport(
    options: { userId?: string; since?: Date; limit?: number } = {},
  ): Promise<ActionReportExport> {
    const report = await this.getActionReport(options, true);
    const exportedAt = new Date().toISOString();
    const signingKey = process.env.AUDIT_HMAC_KEY || process.env.ENCRYPTION_KEY || '';
    // A2：全量链原始行（payload 与写入侧 _payload 一致，供 scripts/verify-evidence.mjs 离线重算）
    // 只取**已入链**的行：`hash` 为 null 的行从未入链（AddAuditHashChain 迁移前的历史行；
    // 以及测试/工具直插的行）。让它们参与校验会让 genesis 检查在**第 1 行**即失败
    // （_matches(null, …) 恒 false）→ 整条链被误判 invalid，而链实际未被破坏。
    // 与副作用链 verifySideEffectChain 的 `filter(r => r.hash)` **同口径**：两条链对
    // 「未入链的行不参与校验」必须一致，否则同一份数据在两条链上会得出相反结论。
    const rows = (await this.logRepo.find({ order: { id: 'ASC' } })).filter((r) => r.hash);
    const chain: EvidenceChainRow[] = rows.map((row, i) => ({
      seq: i + 1,
      id: row.id,
      prevHash: row.prevHash ?? null,
      hash: row.hash ?? '',
      payload: buildPayload(row),
    }));
    // §internal.16 A-6 合规：内存批建（byId/byConv/agentCache，零额外查询）——samples 每条出业务摘要 + 责任链 + 授权依据
    const byId = new Map(rows.map((r) => [r.id, r]));
    const byConv = new Map<string, AiAuditLog[]>();
    for (const r of rows) {
      if (r.conversationId) {
        const list = byConv.get(r.conversationId) ?? [];
        list.push(r);
        byConv.set(r.conversationId, list);
      }
    }
    const agentCache = new Map<string, { name: string; trustLevel: string; purpose?: string | null } | null>();
    const compliance = [];
    for (const s of report.samples ?? []) {
      const row = byId.get(s.id);
      if (!row) {
        compliance.push({ id: s.id, businessEvent: null, evidence: null, summary: null, decisionNote: null, identityChain: null });
        continue;
      }
      const convRows = row.conversationId ? (byConv.get(row.conversationId) ?? []) : [];
      const summary = summarizeAudit(row, convRows);
      compliance.push({
        id: s.id,
        businessEvent: row.businessEvent ?? null,
        evidence: row.evidence ?? null,
        summary: { sentence: summary.sentence, stats: summary.stats },
        // D-3 人读「决策说明」（凭什么允许 / 为何拒绝）；无授权快照为 null
        decisionNote: summary.decisionNote ?? null,
        identityChain: await this._identityChainFromRow(row, agentCache),
      });
    }
    const canonical = JSON.stringify({
      summary: report.summary,
      hashChain: report.hashChain,
      effectDiffs: report.effectDiffs,
      compliance,
      chain,
      exportedAt,
    });
    const signature = this._buildSignature(canonical, signingKey);
    return {
      exportedAt,
      generator: 'keelbase-audit-export',
      format: 'keelbase-audit-evidence/2',
      report,
      compliance,
      chain,
      signature,
    };
  }

  /**
   * ① 证据根（§internal.17 ①，docs/evidence-root.spec.md）：单条 Business Action（resultType:resultId）→ keelbase-audit-evidence/3
   * 跨链证据根——授权快照(含 policy.revision) + Decision Evidence + AI 审计链行 + 副作用行 + operation_audit 链行 + 跨链根锚。
   * 鉴权：本人（effect.userId===viewer）或管理员；无副作用 404、非本人非 admin 403。
   */
  async getEvidenceRoot(
    resultType: string,
    resultId: number,
    viewerUserId: string,
    isAdmin: boolean,
  ): Promise<EvidenceRootExport> {
    // A8: the same narrowing as the governance view — a non-admin reads only their own row, so
    // "exists but is not yours" is an honest 404 rather than a 403 that would confirm the row exists.
    // `order` keeps the answer deterministic when the pair is not unique (rows written before the
    // proxy identity carried a user dimension can share it across users).
    //
    // A8：与治理视图同一收窄 —— 非管理员只读自己的行，「存在但不属于你」如实落 404，
    // 而不是会确认其存在的 403。`order` 在二元组不唯一时（代理身份带上用户维度之前写入的行
    // 可能跨用户共享它）让答案确定。
    const where: Record<string, unknown> = { resultType, resultId };
    if (!isAdmin) where.userId = viewerUserId;
    const effect = await this.effectsRepo.findOne({ where: where as any, order: { id: 'ASC' } });
    if (!effect) throw new NotFoundException('AI 副作用记录不存在');
    const exportedAt = new Date().toISOString();
    const signingKey = process.env.AUDIT_HMAC_KEY || process.env.ENCRYPTION_KEY || '';

    const convRows: AiAuditLog[] = effect.conversationId
      ? await this.logRepo.find({ where: { conversationId: effect.conversationId }, order: { id: 'ASC' } })
      : [];
    const trigger =
      convRows.find(
        (l) => l.action === 'tool_call' && !l.isError && extractToolName(l.detail) === effect.toolName,
      ) ??
      [...convRows].reverse().find((l) => !l.isError && l.action === 'tool_call') ??
      null;
    const agentCache = new Map<string, { name: string; trustLevel: string; purpose?: string | null } | null>();
    const identity = trigger ? await this._identityChainFromRow(trigger, agentCache) : null;

    const aiChain: EvidenceChainRow[] = convRows.map((row, i) => ({
      seq: i + 1,
      id: row.id,
      prevHash: row.prevHash ?? null,
      hash: row.hash ?? '',
      payload: buildPayload(row),
    }));

    let opChain: EvidenceChainRow[] = [];
    const opPaths = this._evidenceRootRestPaths(resultType);
    if (this.operationAudit && opPaths) {
      opChain = await this.operationAudit.chainRowsByTarget(String(resultId), opPaths);
    }

    // 副作用锚（无链）：bundle 自洽摘要（投影 canonical；JSON.stringify 键序固定）
    const effectProj = {
      id: effect.id,
      toolName: effect.toolName,
      before: parseSnapshot(effect.beforeSnapshot),
      after: parseSnapshot(effect.afterSnapshot),
    };
    const sideHash = createHash('sha256').update(JSON.stringify(effectProj)).digest('hex');

    const anchors = [
      ...(trigger ? [{ kind: 'ai-audit', rowId: trigger.id, hash: trigger.hash ?? '' }] : []),
      { kind: 'side-effect', rowId: effect.id, hash: sideHash },
      ...opChain.filter((r) => r.hash).map((r) => ({ kind: 'op-audit', rowId: r.id, hash: r.hash })),
    ].sort((a, b) => (a.kind + ':' + a.rowId).localeCompare(b.kind + ':' + b.rowId));
    const root = {
      algorithm: 'keelbase-evidence-root/1',
      anchors,
      digest: createHash('sha256').update(JSON.stringify(anchors)).digest('hex'),
    };

    const action = {
      id: `${resultType}:${resultId}`,
      resultType,
      resultId,
      effectId: effect.id,
      userId: effect.userId,
      conversationId: effect.conversationId ?? null,
    };
    const decision = { businessEvent: trigger?.businessEvent ?? null, evidence: trigger?.evidence ?? null };
    const chains = { aiAudit: aiChain, operationAudit: opChain };

    // ① spec 对齐：业务摘要（复用 summarizeAudit，trigger 存在时给「这条 AI 行为做了什么」可读叙事）
    let summary: EvidenceRootExport['summary'] = null;
    if (trigger) {
      try {
        const s = summarizeAudit(
          trigger as unknown as AuditInterpretationRow,
          convRows as unknown as AuditInterpretationRow[],
        );
        summary = { sentence: s.sentence, stats: s.stats };
      } catch {
        summary = null;
      }
    }

    // ① replay wire（装配点，policy-history spec §4）：授权快照携带的 policy.revision 下重放该放行——决策是否仍可复现
    let replay: EvidenceRootExport['replay'] = null;
    const allowedObj = identity?.authorization && typeof identity.authorization === 'object'
      ? (identity.authorization as { allowed?: { tool?: string; checks?: Array<{ name: string }>; policy?: { revision?: string } } }).allowed
      : undefined;
    if (this.governancePolicy && allowedObj && effect.toolName && allowedObj.policy?.revision) {
      try {
        // tool 从副作用行取（授权快照 allowed 未必携带 tool，effect.toolName 是真实触发工具）
        replay = (await this.governancePolicy.replayDecision({
          tool: effect.toolName,
          checks: allowedObj.checks as Array<{ name: string; ok?: boolean }>,
          policyRevision: allowedObj.policy.revision,
        })) as unknown as Record<string, unknown>;
      } catch {
        replay = null;
      }
    }

    // v3 canonical（与 scripts/verify-evidence.mjs 严格一致）：action/authorization/decision/effect/chains/root/exportedAt + summary/replay（存在才含，向后兼容已导出无新段的 v3）
    const canonicalObj: Record<string, unknown> = {
      action,
      authorization: identity?.authorization ?? null,
      decision,
      effect: effectProj,
      chains,
      root,
      exportedAt,
    };
    if (summary) canonicalObj.summary = summary;
    if (replay) canonicalObj.replay = replay;
    const canonical = JSON.stringify(canonicalObj);
    const signature = this._buildSignature(canonical, signingKey);
    return {
      exportedAt,
      generator: 'keelbase-audit-export',
      format: 'keelbase-audit-evidence/3',
      action,
      authorization: identity?.authorization ?? null,
      decision,
      effect: effectProj,
      chains,
      root,
      summary,
      replay,
      signature,
    };
  }

  /**
   * 证据包签名段（§11 双签）：HMAC（应用内快验）+ SM2（第三方持公钥独立验签）并存，互不替代。
   * 两者皆未配置 → null（与历史「无签名包」行为一致）。SM2 已配置但 openssl 不可用 / 签名失败 → **抛错**，
   * 绝不产出「看起来已签名」的包（执行包 §6.4「缺库不静默」）。
   */
  private _buildSignature(canonical: string, hmacKey: string): EvidenceSignature | null {
    const sm2 = buildSm2Block(canonical, sm2ConfigFromEnv());
    const hmac = hmacKey ? createHmac('sha256', hmacKey).update(canonical).digest('hex') : null;
    if (!hmac && !sm2) return null;
    return { hmac, ...(sm2 ? { sm2 } : {}) };
  }

  /**
   * ① 证据根：resultType → 该业务对象在 operation_audit 里的 path 子串（对齐 business-history REST_RESOURCE_PATHS；
   * 未知类型不反查）。除 REST 资源路径外还须含**补偿锚** `/ai/tool-effects/compensate`——
   * 级联补偿行（docs/cascade-compensation.spec.md §6）的 targetId 记的是根业务 id，不在此列则
   * 证据包会漏掉「这条业务动作被补偿过」这一事实。
   */
  private _evidenceRootRestPaths(resultType: string): string[] | null {
    const compensate = '/ai/tool-effects/compensate';
    const map: Record<string, string[]> = {
      crm_task: ['/crm/tasks/', compensate],
      pm_task: ['/pm/tasks/', compensate],
      pm_project: ['/pm/projects/', compensate],
      app_request: ['/approval/requests/', compensate],
      event: ['/api/v1/events/', '/events/', compensate],
      contract: ['/contracts/', compensate],
      todo: ['/todos/', compensate],
    };
    return map[resultType] ?? null;
  }

  /**
   * AI-21 成本看板：按 用户×模型×意图 聚合 tokens（复用 ai_audit_logs）。
   * 不含 error 日志；token 计费近似（prompt 单价低于 completion，此处给出原始量）。
   */
  /** §internal.16 A-4 审计解释器：单行审计 + 同对话上下文 → 业务摘要 + 证据统计（demo 可用，无 LLM 依赖） */
  async getInterpretation(id: number): Promise<{
    row: AiAuditLog;
    summary: AuditInterpretation;
    conversation: Array<{
      id: number; action: string; detail?: string | null; businessEvent?: string | null;
      evidence?: string | null; isError: boolean; errorMessage?: string | null; createdAt: Date;
    }>;
  }> {
    const row = await this.logRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('审计记录不存在');
    const where = row.conversationId ? { conversationId: row.conversationId } : {};
    const convRows = await this.logRepo.find({
      where,
      select: {
        id: true, userId: true, username: true, action: true, detail: true,
        businessEvent: true, evidence: true, isError: true, errorMessage: true, createdAt: true,
        // D-3：带出授权快照 → summary.decisionNote（凭什么允许 / 为何拒绝）
        authorization: true,
      },
      order: { createdAt: 'ASC' },
    });
    const summary = summarizeAudit(row, convRows as unknown as AuditInterpretationRow[]);
    return { row, summary, conversation: convRows };
  }

  /** §internal.16 A-5 跨系统身份链：审计行 → Human→Intent→Agent→Tool→Action + 授权依据（拒绝 checks / 放行 explain）+ 同会话工具序列 */
  async getChain(id: number): Promise<{
    row: { id: number; userId: string; username?: string | null; action: string; createdAt: Date };
    human: { userId: string; username: string | null };
    intent: string | null;
    agent: { agentId: string | null; agentName: string | null; trustLevel: string | null; callerAgentId: string | null };
    tool: { toolName: string | null };
    action: { businessEvent: string | null; evidence: string | null };
    source: string | null;
    authorization: { denied: Array<{ name: string; ok: boolean; note?: string }> | null; allowed: Record<string, unknown> | null };
    chain: Array<{ id: number; action: string; toolName: string | null; businessEvent?: string | null; agentId?: string | null; createdAt: Date }>;
  }> {
    const row = await this.logRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('审计记录不存在');
    const convRows = row.conversationId
      ? await this.logRepo.find({ where: { conversationId: row.conversationId }, order: { createdAt: 'ASC' }, take: 50 })
      : [];
    const identity = await this._identityChainFromRow(row);
    return {
      row: { id: row.id, userId: row.userId, username: row.username ?? null, action: row.action, createdAt: row.createdAt },
      ...identity,
      chain: convRows.map((r) => ({
        id: r.id,
        action: r.action,
        toolName: extractToolName(r.detail),
        businessEvent: r.businessEvent ?? null,
        agentId: r.agentId ?? null,
        createdAt: r.createdAt,
      })),
    };
  }

  /** §internal.16 A-6 合规：从行构建身份链（Human→Agent→Tool→Action + 授权依据）；agentCache 供批量复用去重 */
  private async _identityChainFromRow(
    row: AiAuditLog,
    agentCache?: Map<string, { name: string; trustLevel: string; purpose?: string | null } | null>,
  ): Promise<{
    human: { userId: string; username: string | null };
    intent: string | null;
    agent: { agentId: string | null; agentName: string | null; trustLevel: string | null; callerAgentId: string | null };
    tool: { toolName: string | null };
    action: { businessEvent: string | null; evidence: string | null };
    source: string | null;
    authorization: { denied: Array<{ name: string; ok: boolean; note?: string }> | null; allowed: Record<string, unknown> | null };
  }> {
    const toolName = extractToolName(row.detail);
    // agentCache 可能缓存 null（未知 agent）——用 has() 区分「缓存 miss」与「已缓存 null」，避免每样本重复查库
    const agent = row.agentId
      ? agentCache?.has(row.agentId)
        ? (agentCache.get(row.agentId) ?? null)
        : ((await this.agentService?.findByAgentId(row.agentId)) ?? null)
      : null;
    if (row.agentId && agentCache && !agentCache.has(row.agentId)) agentCache.set(row.agentId, agent ?? null);
    const denied = parseChecks(row.authorization);
    let allowed: Record<string, unknown> | null = null;
    if (!denied) {
      // §internal.16 A-5 事件时点放行快照优先（写入侧已存 allowed:true 对象）——证据包「为什么允许」是事发时真实评估；
      // 历史数据无快照 → 降级为当前策略重算（向后兼容）
      const snap = parseAllowedSnapshot(row.authorization);
      if (snap) {
        // §internal.17 ③ Policy Evidence：快照带策略版本（policy.revision）时，allowed 投影携带（evidence/合规「哪一版规则允许」）；
        // 历史行无版本 → 不注入键（向后兼容，消费端可选）
        allowed = snap.policy
          ? { checks: snap.checks, riskLevel: snap.riskLevel, policy: snap.policy }
          : { checks: snap.checks, riskLevel: snap.riskLevel };
      } else if (toolName) {
        try {
          allowed = (await this.authorizationExplainer?.explainAuthorization(toolName, row.userId)) ?? null;
        } catch {
          allowed = null;
        }
      }
    }
    return {
      human: { userId: row.userId, username: row.username ?? null },
      intent: row.businessIntent ?? null,
      agent: {
        agentId: row.agentId ?? null,
        agentName: agent?.name ?? null,
        trustLevel: agent?.trustLevel ?? null,
        callerAgentId: row.callerAgentId ?? null,
      },
      tool: { toolName },
      action: { businessEvent: row.businessEvent ?? null, evidence: row.evidence ?? null },
      source: row.source ?? null,
      authorization: { denied, allowed },
    };
  }
}

/** §internal.16 A-5：authorization 列 checks[] JSON 安全解析（非法/非数组降级 null） */
function parseChecks(raw?: string | null): Array<{ name: string; ok: boolean; note?: string }> | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Array<{ name: string; ok: boolean; note?: string }>) : null;
  } catch {
    return null;
  }
}

/** §internal.16 A-5 放行授权快照解析：对象含 allowed:true（事件时点 checks/riskLevel/policy.revision）；拒绝数组/非放行/非法 → null */
function parseAllowedSnapshot(
  raw?: string | null,
): { checks: unknown; riskLevel?: string; policy?: { revision: string; updatedAt?: string | null } } | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      const o = parsed as {
        allowed?: boolean;
        checks?: unknown;
        riskLevel?: string;
        policy?: { revision?: string; updatedAt?: string | null } | null;
      };
      return o.allowed === true
        ? {
            checks: o.checks,
            riskLevel: o.riskLevel,
            ...(o.policy?.revision
              ? { policy: { revision: o.policy.revision, updatedAt: o.policy.updatedAt ?? null } }
              : {}),
          }
        : null;
    }
    return null;
  } catch {
    return null;
  }
}

/** E-1：副作用快照 JSON 安全解析（非法/非对象降级 null） */
function parseSnapshot(raw?: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
