// SPDX-License-Identifier: Apache-2.0

/**
 * BA 异常行为基线（docs/ai-behavior-baseline.spec.md）：规则型检测器。
 *
 * 定位是 **Authorization → Behavior 升维**——权限已经允许了，但行为模式偏离阈值时照样告警。
 * **只观测、不阻断**：本服务不参与任何门控决策，也不改 AI 调用热路径（只在定时扫描里读既有数据）。
 *
 * 三条规则（规格 §2）：
 * - R-1 单会话工具调用密集（读 `ai_audit_logs`，按会话计数）
 * - R-2 高危工具被拒后反复尝试（读审计 + 工具注册表判 R4/R5）——**权限说不行、还在反复试**，比「删了多少次」更准
 * - R-3 短时写入规模异常（读 `ai_tool_side_effects`，按会话计行数）
 *
 * 三条都只**读**既有数据，唯一写入是告警表本身。
 */
import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { AiAuditLog } from '../audit/ai-audit-log.entity';
import { AiToolSideEffect } from '../tool-effects/ai-tool-side-effect.entity';
import { extractToolName } from '../audit/tool-name';
import { ToolRegistry } from '../tools/tool-registry';
import { SettingsService, SETTING_KEYS } from '../../settings/settings.service';
import { AiBehaviorAlert } from './behavior-alert.entity';

/**
 * 管理端对外形状（wire 契约 specs/protocol/schemas/v1/ai-behavior-alert.schema.json）。
 * 与实体不同的两点：`subject` 收成对象（实体是两列）、`evidence` 是**对象**（实体存 JSON 字符串）。
 * 对外一律给这个形状——契约里 evidence 就是对象，让前端去 parse JSON 是把契约当摆设。
 */
export interface BehaviorAlertItem {
  id: number;
  rule: string;
  level: string;
  subject: { kind: string; id: string };
  conversationId: string | null;
  title: string;
  detail: string;
  evidence: { count: number; threshold: number; windowMinutes: number; sampleRowIds?: number[]; toolName?: string };
  status: string;
  createdAt: string;
  decidedAt: string | null;
}

/** 规则 ID（与规格 §2 同一 ID；落进告警便于对账） */
export type BehaviorRule = 'R-1' | 'R-2' | 'R-3';

/** 落库前的候选告警（还要过冷却去重） */
interface AlertCandidate {
  rule: BehaviorRule;
  level: 'warning' | 'critical';
  subjectKind: 'conversation' | 'user';
  subjectId: string;
  conversationId: string | null;
  title: string;
  detail: string;
  evidence: {
    count: number;
    threshold: number;
    windowMinutes: number;
    sampleRowIds?: number[];
    toolName?: string;
  };
}

/** 级别由**超出阈值的倍数**决定：< 2× warning，≥ 2× critical（规格 §6）。 */
function levelFor(count: number, threshold: number): 'warning' | 'critical' {
  return count >= threshold * 2 ? 'critical' : 'warning';
}

export interface BehaviorScanConfig {
  enabled: boolean;
  windowMinutes: number;
  maxToolsPerConversation: number;
  maxFailedHighRisk: number;
  maxSideEffects: number;
  cooldownMinutes: number;
}

@Injectable()
export class BehaviorBaselineService {
  private readonly logger = new Logger(BehaviorBaselineService.name);

  constructor(
    @InjectRepository(AiAuditLog) private readonly logRepo: Repository<AiAuditLog>,
    @InjectRepository(AiToolSideEffect) private readonly effectsRepo: Repository<AiToolSideEffect>,
    @InjectRepository(AiBehaviorAlert) private readonly alertRepo: Repository<AiBehaviorAlert>,
    @Optional() private readonly settingsService?: SettingsService,
    @Optional() private readonly toolRegistry?: ToolRegistry,
  ) {}

  /**
   * 跑一轮扫描：三条规则 → 去重 → 落库。返回本轮**新落**的告警（被冷却挡掉的不在其中）。
   * 窗口是**固定**的 `[now - window, now]`——幂等，重复扫描同一段数据结论不变（规格 §5）。
   */
  async scan(now: Date = new Date()): Promise<AiBehaviorAlert[]> {
    const cfg = await this.config();
    if (!cfg.enabled) return [];
    const since = new Date(now.getTime() - cfg.windowMinutes * 60_000);
    const [r1, r2, r3] = await Promise.all([
      this._ruleToolsPerConversation(since, cfg),
      this._ruleDeniedHighRiskRetries(since, cfg),
      this._ruleSideEffectBurst(since, cfg),
    ]);
    const saved: AiBehaviorAlert[] = [];
    for (const candidate of [...r1, ...r2, ...r3]) {
      const row = await this._persist(candidate, cfg, now);
      if (row) saved.push(row);
    }
    if (saved.length > 0) {
      this.logger.warn(`异常行为基线：本轮新告警 ${saved.length} 条（${saved.map((a) => a.rule).join(', ')}）`);
    }
    return saved;
  }

  /**
   * 管理台列表：默认只给**未处理**的（`'all'` 表示不过滤状态），按时间倒序。
   * 默认「只看未处理」是刻意的——处理完的告警不该继续占版面。
   */
  async list(
    opts: { status?: 'open' | 'acknowledged' | 'all'; level?: string; limit?: number } = {},
  ): Promise<BehaviorAlertItem[]> {
    const status = opts.status ?? 'open';
    const rows = await this.alertRepo.find({
      where: {
        ...(status === 'all' ? {} : { status }),
        ...(opts.level ? { level: opts.level } : {}),
      },
      order: { createdAt: 'DESC' },
      take: opts.limit ?? 50,
    });
    return rows.map((r) => this._toItem(r));
  }

  /** 实体 → 契约形状（evidence 字符串按契约还原成对象）。 */
  private _toItem(row: AiBehaviorAlert): BehaviorAlertItem {
    let evidence: BehaviorAlertItem['evidence'] = { count: 0, threshold: 1, windowMinutes: 0 };
    try {
      evidence = JSON.parse(row.evidenceJson) as BehaviorAlertItem['evidence'];
    } catch {
      // 存进去的是我们自己写的 JSON；解析不了就如实给零值，不外抛打断列表
    }
    return {
      id: row.id,
      rule: row.rule,
      level: row.level,
      subject: { kind: row.subjectKind, id: row.subjectId },
      conversationId: row.conversationId ?? null,
      title: row.title,
      detail: row.detail,
      evidence,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
    };
  }

  /** 标记已处理（人工动作；本能力不自动处置）。返回是否真的改到了行（幂等）。 */
  async acknowledge(id: number): Promise<boolean> {
    const res = await this.alertRepo.update({ id, status: 'open' }, { status: 'acknowledged', decidedAt: new Date() });
    return (res.affected ?? 0) > 0;
  }

  /** 阈值与开关（规格 §4）：全部经 Settings 可配，缺席/配错时回落到规格默认值。 */
  async config(): Promise<BehaviorScanConfig> {
    const num = async (key: string, fallback: number): Promise<number> => {
      const raw = this.settingsService ? Number(await this.settingsService.getWithDefault(key, fallback)) : Number.NaN;
      return Number.isFinite(raw) && raw > 0 ? raw : fallback;
    };
    const flag = async (key: string, fallback: boolean): Promise<boolean> => {
      if (!this.settingsService) return fallback;
      const raw = await this.settingsService.getWithDefault(key, fallback);
      return typeof raw === 'boolean' ? raw : fallback;
    };
    return {
      enabled: await flag(SETTING_KEYS.AI_BEHAVIOR_SCAN_ENABLED, true),
      windowMinutes: await num(SETTING_KEYS.AI_BEHAVIOR_WINDOW_MINUTES, 10),
      maxToolsPerConversation: await num(SETTING_KEYS.AI_BEHAVIOR_MAX_TOOLS_PER_CONVERSATION, 20),
      maxFailedHighRisk: await num(SETTING_KEYS.AI_BEHAVIOR_MAX_FAILED_HIGHRISK, 3),
      maxSideEffects: await num(SETTING_KEYS.AI_BEHAVIOR_MAX_SIDE_EFFECTS, 30),
      cooldownMinutes: await num(SETTING_KEYS.AI_BEHAVIOR_COOLDOWN_MINUTES, 60),
    };
  }

  // ───────────────────────────── R-1 ─────────────────────────────

  /** R-1：扫描窗口内同一会话的工具调用数超阈值。 */
  private async _ruleToolsPerConversation(since: Date, cfg: BehaviorScanConfig): Promise<AlertCandidate[]> {
    const rows = await this.logRepo
      .createQueryBuilder('l')
      .select('l.conversationId', 'cid')
      .addSelect('COUNT(*)', 'cnt')
      .addSelect('MIN(l.id)', 'sampleId')
      .where('l.action = :action', { action: 'tool_call' })
      .andWhere('l.createdAt >= :since', { since })
      .andWhere('l.conversationId IS NOT NULL')
      .groupBy('l.conversationId')
      .having('COUNT(*) > :threshold', { threshold: cfg.maxToolsPerConversation })
      .getRawMany<{ cid: string; cnt: string; sampleId: string }>();

    return rows.map((r) => {
      const count = Number(r.cnt);
      return {
        rule: 'R-1' as const,
        level: levelFor(count, cfg.maxToolsPerConversation),
        subjectKind: 'conversation' as const,
        subjectId: String(r.cid),
        conversationId: String(r.cid),
        title: '单会话工具调用密集',
        detail: `${cfg.windowMinutes} 分钟内该会话调用工具 ${count} 次，超过阈值 ${cfg.maxToolsPerConversation}`,
        evidence: {
          count,
          threshold: cfg.maxToolsPerConversation,
          windowMinutes: cfg.windowMinutes,
          sampleRowIds: r.sampleId ? [Number(r.sampleId)] : [],
        },
      };
    });
  }

  // ───────────────────────────── R-2 ─────────────────────────────

  /**
   * R-2：扫描窗口内同一用户对**同一高危工具**（R4/R5）的失败调用反复超过阈值。
   *
   * 为什么必须取回行而不是纯 SQL：工具名不在任何列里，只存在于 `detail` 文本
   * （`extractToolName` 还原），所以只能拉回窗口内的失败行再在内存分组。
   */
  private async _ruleDeniedHighRiskRetries(since: Date, cfg: BehaviorScanConfig): Promise<AlertCandidate[]> {
    if (!this.toolRegistry) return [];
    const rows = await this.logRepo.find({
      where: { action: 'tool_call', isError: true, createdAt: MoreThanOrEqual(since) },
      select: { id: true, userId: true, detail: true, conversationId: true },
      order: { id: 'ASC' },
    });

    const groups = new Map<string, { userId: string; toolName: string; ids: number[]; conversationId: string | null }>();
    for (const row of rows) {
      const toolName = extractToolName(row.detail);
      if (!toolName || !this._isHighRisk(toolName)) continue;
      const key = `${row.userId}::${toolName}`;
      const g = groups.get(key) ?? { userId: row.userId, toolName, ids: [], conversationId: row.conversationId ?? null };
      g.ids.push(row.id);
      groups.set(key, g);
    }

    const out: AlertCandidate[] = [];
    for (const g of groups.values()) {
      if (g.ids.length <= cfg.maxFailedHighRisk) continue;
      out.push({
        rule: 'R-2',
        level: levelFor(g.ids.length, cfg.maxFailedHighRisk),
        subjectKind: 'user',
        subjectId: g.userId,
        conversationId: g.conversationId,
        title: '高危工具被拒后反复尝试',
        detail: `${cfg.windowMinutes} 分钟内 ${g.ids.length} 次调用 ${g.toolName} 均未成功，超过阈值 ${cfg.maxFailedHighRisk}`,
        evidence: {
          count: g.ids.length,
          threshold: cfg.maxFailedHighRisk,
          windowMinutes: cfg.windowMinutes,
          sampleRowIds: g.ids.slice(0, 10),
          toolName: g.toolName,
        },
      });
    }
    return out;
  }

  /**
   * 高危 = 风险级 R4/R5（规格 §2）。
   * 未注册的工具（如代理工具）**不判高危**——宁可漏检也不误报，与规格 §3.2 的取向一致。
   */
  private _isHighRisk(toolName: string): boolean {
    try {
      return ['R4', 'R5'].includes(this.toolRegistry!.riskLevel(toolName));
    } catch {
      return false;
    }
  }

  // ───────────────────────────── R-3 ─────────────────────────────

  /** R-3：扫描窗口内同一会话产生的副作用行数超阈值（真实写入规模；审计里没有这一度量）。 */
  private async _ruleSideEffectBurst(since: Date, cfg: BehaviorScanConfig): Promise<AlertCandidate[]> {
    const rows = await this.effectsRepo
      .createQueryBuilder('e')
      .select('e.conversationId', 'cid')
      .addSelect('COUNT(*)', 'cnt')
      .addSelect('MIN(e.id)', 'sampleId')
      .where('e.createdAt >= :since', { since })
      .andWhere('e.conversationId IS NOT NULL')
      .groupBy('e.conversationId')
      .having('COUNT(*) > :threshold', { threshold: cfg.maxSideEffects })
      .getRawMany<{ cid: string; cnt: string; sampleId: string }>();

    return rows.map((r) => {
      const count = Number(r.cnt);
      return {
        rule: 'R-3' as const,
        level: levelFor(count, cfg.maxSideEffects),
        subjectKind: 'conversation' as const,
        subjectId: String(r.cid),
        conversationId: String(r.cid),
        title: '短时写入规模异常',
        detail: `${cfg.windowMinutes} 分钟内该会话产生 ${count} 条写入记录，超过阈值 ${cfg.maxSideEffects}`,
        evidence: {
          count,
          threshold: cfg.maxSideEffects,
          windowMinutes: cfg.windowMinutes,
          sampleRowIds: r.sampleId ? [Number(r.sampleId)] : [],
        },
      };
    });
  }

  // ─────────────────────────── 落库与去重 ───────────────────────────

  /**
   * 冷却去重：同一 (规则 × 主体) 在冷却期内已有告警则**不重复落库**——
   * 否则一个持续异常每轮扫描都会刷一条，把告警流变成噪音（规格 §5）。
   */
  private async _persist(candidate: AlertCandidate, cfg: BehaviorScanConfig, now: Date): Promise<AiBehaviorAlert | null> {
    const cooldownStart = new Date(now.getTime() - cfg.cooldownMinutes * 60_000);
    const existing = await this.alertRepo.findOne({
      where: {
        rule: candidate.rule,
        subjectKind: candidate.subjectKind,
        subjectId: candidate.subjectId,
        createdAt: MoreThanOrEqual(cooldownStart),
      },
    });
    if (existing) return null;
    const entity: AiBehaviorAlert = this.alertRepo.create({
      rule: candidate.rule,
      level: candidate.level,
      subjectKind: candidate.subjectKind,
      subjectId: candidate.subjectId,
      // 列是可空 varchar：null 与 undefined 在库里同义，但实体的可选类型只接受 undefined
      conversationId: candidate.conversationId ?? undefined,
      title: candidate.title,
      detail: candidate.detail,
      evidenceJson: JSON.stringify(candidate.evidence),
      status: 'open',
    });
    return this.alertRepo.save(entity);
  }
}
