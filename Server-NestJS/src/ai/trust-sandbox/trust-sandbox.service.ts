// SPDX-License-Identifier: Apache-2.0

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiService } from '../ai.service';
import { CrmService } from '../../crm/crm.service';
import { UsersService } from '../../users/users.service';
import { AiToolEffectsService } from '../tool-effects/ai-tool-effects.service';
import { User } from '../../common/entities/user.entity';
import { CaslAbilityFactory } from '../../common/casl/casl-ability.factory';
import { SettingsService } from '../../settings/settings.service';

/** Trust 旅程一键连跑（P0-2）的编排步骤：Ask → 人工确认 → 越权拒绝 → 高风险阻断 */
export interface TrustSandboxJourneyStep {
  step: 'ask' | 'act' | 'break_deny' | 'break_block';
  scenario: string;
  outcome: string;
  detail?: string;
  conversationId?: string;
  resultType?: string;
  resultId?: number;
  requiresConfirmation?: boolean;
  /** 仅当 resultType/resultId 对应真实 AI 工具副作用/业务动作时 true（否则「业务动作治理详情」是死链） */
  governed?: boolean;
}

/**
 * Trust 沙盘（internal-roadmap §internal.15 可视化 P0）：评审/集成商在工作台一键重放
 * Trust 证明包六场景（Business-safe Trust 链路），返回可渲染的活数据
 * （conversationId/resultType/resultId → 前端拉 trace / 治理详情）。
 *
 * 场景（对齐 Server-NestJS/scripts/verify-trust-proof.mjs）：
 *   s1_normal   正常成功：建客户+逾期订单 → AI 风险分析（conversation 留痕）
 *   s2_denied   越权拒绝：注册 bob → bob 越权读当前用户客户 → 403 语义
 *   s3_r5_block 高风险动作：AI 尝试删除客户 → R5 阻断
 *   s4_confirm  人工确认：写工具确认门控触发（返回门控语义 + 指引）
 *   s5_revoke   撤销：指引（确认落库后到 Copilot 实际批准 → 撤销）
 *   s6_java     Java 存量系统：引导到 java-starter（verify-*-e2e.mjs）
 *
 * 确定性演示依赖 demo provider（provider:'demo'），无 LLM key 也可跑。
 */
@Injectable()
export class TrustSandboxService {
  constructor(
    private readonly aiService: AiService,
    private readonly crmService: CrmService,
    private readonly usersService: UsersService,
    private readonly effectsService: AiToolEffectsService,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    private readonly abilityFactory: CaslAbilityFactory,
    private readonly settingsService: SettingsService,
  ) {}

  /** 场景清单（前端沙盘卡渲染用） */
  get scenarios(): Array<{ id: string; title: string; outcome: string }> {
    return [
      { id: 's1_normal', title: 'AI 分析真实客户风险（正常成功）', outcome: 'Risk analysis succeeds' },
      { id: 's2_denied', title: '他人访问你的客户被拒（越权 403）', outcome: 'Access denied' },
      { id: 's3_r5_block', title: 'AI 尝试删除客户被阻断（R5）', outcome: 'R5 BLOCKED' },
      { id: 's4_confirm', title: 'AI 写操作需人工确认（R3 门控）', outcome: 'Confirmation required' },
      { id: 's5_revoke', title: '撤销 AI 副作用（软删可恢复）', outcome: 'Revoked' },
      { id: 's6_java', title: '存量 Java 系统接入（Java Starter）', outcome: 'Guide' },
    ];
  }

  async run(
    scenarioId: string,
    userId: string,
    opts: { confirm?: boolean } = {},
  ): Promise<Record<string, unknown>> {
    const ts = Date.now() % 1_000_000;
    switch (scenarioId) {
      case 's1_normal':
        return this.s1(userId, ts);
      case 's2_denied':
        return this.s2(userId, ts);
      case 's3_r5_block':
        return this.s3(userId, ts);
      case 's4_confirm':
        return this.s4(userId, ts);
      case 's5_revoke':
        return this.s5(userId, opts?.confirm === true);
      case 's6_java':
        return {
          scenario: 's6_java',
          outcome: 'guide',
          detail:
            'Java 存量系统接入验证在 keelbase-java-starter 仓库（keelbase-java-crm/pm/approval-example + verify-*-e2e.mjs）独立运行；' +
            '主仓侧由 B 路径 AI Bridge（--import-openapi-proxy）对接存量系统。接入状态见管理台监控中心「外部系统接入（Java 集成）」卡。',
        };
      default:
        return { scenario: scenarioId, outcome: 'unknown' };
    }
  }

  /**
   * P0-2 旅程一键连跑（首次评审 3 分钟闭环）：Ask → 人工确认 → 越权拒绝 → 高风险阻断，
   * 一次返回四步（确定性 demo provider，无 LLM key）。结尾由前端用 ask 的 conversation/resultId
   * 直达执行轨迹与业务动作治理详情。
   */
  async journey(userId: string): Promise<{ journey: 'trust'; steps: TrustSandboxJourneyStep[] }> {
    const ts = Date.now() % 1_000_000;
    const toStep = (
      step: TrustSandboxJourneyStep['step'],
      r: Record<string, unknown>,
    ): TrustSandboxJourneyStep => ({
      step,
      scenario: String(r.scenario),
      outcome: String(r.outcome),
      detail: r.detail as string | undefined,
      conversationId: r.conversationId as string | undefined,
      resultType: r.resultType as string | undefined,
      resultId: r.resultId as number | undefined,
      requiresConfirmation: r.requiresConfirmation as boolean | undefined,
      governed: r.governed as boolean | undefined,
    });
    const steps: TrustSandboxJourneyStep[] = [
      toStep('ask', await this.s1(userId, ts)),
      toStep('act', await this.s4(userId, ts)),
      toStep('break_deny', await this.s2(userId, ts)),
      toStep('break_block', await this.s3(userId, ts)),
    ];
    return { journey: 'trust', steps };
  }

  /**
   * P0-2 ④ 沙盘数据自清理（手动按钮）：删除当前用户沙盘运行产生的合成行——沙盘客户/越权目标
   * （订单先行软删客户，CRM 列表自动隐藏）与 bob 演示账号。守卫：
   * - 只动本人客户（crmService owner 域）；名字必须匹配 沙盘客户/越权目标 + 数字 的合成模式；
   * - 客户若有真实子行（AI 跟进任务/活动/商机/联系人/风险）→ 视为「做」成果，跳过不删；
   * - 保留 AI 对话留痕/审计与真实副作用。
   * - 授权边界：bob 只删 role!=admin；非 admin 仅删本人归属前缀 bob_sandbox_<userId>_%（杜绝跨用户删号），
   *   admin 可清全量 bob_sandbox_% 残留（§5.5 用户删除不落入普通用户端点）。
   */
  async cleanup(userId: string, isAdmin: boolean): Promise<{
    removedCustomers: string[];
    skippedCustomers: string[];
    removedBobUsers: number;
  }> {
    const uid = Number(userId);
    const ability = this.abilityFactory.createForUser({
      sub: uid,
      username: '',
      role: 'user' as never,
    });
    const removedCustomers: string[] = [];
    const skippedCustomers: string[] = [];
    for (const kw of ['沙盘客户', '越权目标']) {
      const { items } = await this.crmService.listCustomers(uid, {
        keyword: kw,
        limit: 100,
        page: 1,
      });
      for (const c of items) {
        if (!/^(沙盘客户|越权目标)\d+/.test(c.name)) continue;
        const data = await this.crmService.getCustomer360Data(c.id, uid).catch(() => null);
        if (!data) continue;
        if (
          data.tasks.length ||
          data.activities.length ||
          data.opportunities.length ||
          data.contacts.length ||
          data.risks.length
        ) {
          skippedCustomers.push(c.name);
          continue;
        }
        await this.crmService.removeCustomer(c.id, ability).catch(() => {});
        removedCustomers.push(c.name);
      }
    }
    let removedBobUsers = 0;
    // 非 admin 只删本人归属前缀 bob_sandbox_<userId>_%，admin 清全量 bob_sandbox_% 残留
    const prefix = isAdmin ? 'bob_sandbox_%' : `bob_sandbox_${userId}_%`;
    const bobs = await this.usersRepo
      .createQueryBuilder('u')
      .where('u.username LIKE :p', { p: prefix })
      .andWhere('u.role != :admin', { admin: 'admin' })
      .getMany()
      .catch(() => [] as User[]);
    for (const b of bobs) {
      if (String(b.id) === userId) continue;
      await this.usersService.remove(b.id).catch(() => {});
      removedBobUsers++;
    }
    return { removedCustomers, skippedCustomers, removedBobUsers };
  }

  /** P2 ③ 旅程完成计数 settings 键：值为 Record<北京日 yyyy-mm-dd, number> JSON（跨访客按北京日聚合） */
  private static readonly JOURNEY_COMPLETED_KEY = 'trust_journey_completed';

  /** P2 ③ 旅程完成去重 settings 键：值为 Record<userId, 最后完成北京日>——同用户同日只计一次，计数不可刷（1.0.8 review-deferred） */
  private static readonly JOURNEY_COMPLETED_USERS_KEY = 'trust_journey_completed_users';

  /** 进程内串行化计数写（防 Settings read-modify-write 并发丢更新）；跨进程仍为 best-effort */
  private _completeTail: Promise<void> = Promise.resolve();

  /** 北京日（服务容器多用 UTC；计数口径与全仓一致按 UTC+8） */
  private _beijingDay(d = new Date()): string {
    const b = new Date(d.getTime() + 8 * 3600 * 1000);
    const y = b.getUTCFullYear();
    const m = String(b.getUTCMonth() + 1).padStart(2, '0');
    const day = String(b.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private async _readMap<T>(key: string): Promise<Record<string, T>> {
    const raw = (await this.settingsService.getWithDefault(key, '{}')) as string;
    try {
      const m = JSON.parse(raw) as Record<string, T>;
      return m && typeof m === 'object' ? m : {};
    } catch {
      return {};
    }
  }

  private _readCompletedMap(): Promise<Record<string, number>> {
    return this._readMap<number>(TrustSandboxService.JOURNEY_COMPLETED_KEY);
  }

  /** P2 ③：记一次旅程完成（同用户同北京日幂等——重复/重放上报不重复计数） */
  async recordJourneyCompleted(userId: string): Promise<void> {
    const run = this._completeTail.then(async () => {
      const users = await this._readMap<string>(TrustSandboxService.JOURNEY_COMPLETED_USERS_KEY);
      const today = this._beijingDay();
      if (users[userId] === today) return; // 同用户同日已完成 → 幂等忽略
      const map = await this._readCompletedMap();
      map[today] = (Number(map[today]) || 0) + 1;
      // 去重表裁剪：只保留「今日」条目（旧日条目永不再读，留着只让 JSON 随用户数无限增长、抬高每次读写成本）
      const prunedUsers: Record<string, string> = {};
      for (const [u, d] of Object.entries(users)) if (d === today) prunedUsers[u] = d;
      prunedUsers[userId] = today;
      await this.settingsService.set(
        TrustSandboxService.JOURNEY_COMPLETED_KEY,
        JSON.stringify(map),
      );
      await this.settingsService.set(
        TrustSandboxService.JOURNEY_COMPLETED_USERS_KEY,
        JSON.stringify(prunedUsers),
      );
    });
    this._completeTail = run.catch(() => {});
    await run;
  }

  /** P2 ③：旅程完成统计（今日 + 累计） */
  async journeyStats(): Promise<{ today: number; total: number; todayDate: string }> {
    const map = await this._readCompletedMap();
    const today = this._beijingDay();
    const total = Object.values(map).reduce((s, n) => s + (Number(n) || 0), 0);
    return { today: Number(map[today]) || 0, total, todayDate: today };
  }

  /** S1 正常成功：建客户+2 笔逾期订单 → AI 风险分析（critical） */
  private async s1(userId: string, ts: number): Promise<Record<string, unknown>> {
    const uid = Number(userId);
    const name = `沙盘客户${ts}`;
    const cus = await this.crmService.createCustomer(
      { name, company: '沙盘集团', status: 'active', riskLevel: 'low' } as never,
      uid,
    );
    await this.crmService.createOrder(cus.id, { amount: 2800000, status: 'overdue', dueDate: '2026-09-01' } as never, uid);
    await this.crmService.createOrder(cus.id, { amount: 800000, status: 'overdue', dueDate: '2026-09-10' } as never, uid);
    const chat = await this.aiService.chat(userId, {
      message: `查一下客户「${name}」的风险`,
      provider: 'demo',
    });
    const passed = /critical|风险等级/i.test(chat.reply);
    return {
      scenario: 's1_normal',
      outcome: passed ? 'passed' : 'check',
      detail: chat.reply.slice(0, 220),
      conversationId: chat.conversationId,
      resultType: 'crm_customer',
      resultId: cus.id,
      // 客户为确定性演示直接建（非 AI 工具副作用），无独立「业务动作治理详情」可看（防死链）
      governed: false,
    };
  }

  /** S2 越权拒绝：注册 bob → bob 越权读当前用户客户 → 拒绝语义 */
  private async s2(userId: string, ts: number): Promise<Record<string, unknown>> {
    // 当前用户建一个客户（供越权目标）
    const uid = Number(userId);
    const target = await this.crmService.createCustomer(
      { name: `越权目标${ts}`, company: 'X', status: 'active', riskLevel: 'low' } as never,
      uid,
    );
    // 注册 bob（归属命名 bob_sandbox_<userId>_<ts>：自清理只删本人前缀，杜绝跨用户删号）
    const bobName = `bob_sandbox_${userId}_${ts}`;
    const bob = await this.usersService.create({
      username: bobName,
      nickname: 'Bob',
      password: 'BobSandbox1',
      email: `${bobName}@example.com`,
    } as never);
    const bobId = (bob as { id: number }).id;
    // bob 越权读 alex 的客户（getCustomer360Data 以 userId 校验归属）
    let denied = false;
    let detail = '';
    try {
      await this.crmService.getCustomer360Data(target.id, bobId);
      detail = 'bob 意外读到了目标客户（不应发生）';
    } catch (err) {
      denied = true;
      detail = `bob（${bobName}）访问客户 #${target.id} 被拒：${(err as Error).message}`;
    }
    return {
      scenario: 's2_denied',
      outcome: denied ? 'passed' : 'check',
      detail,
      resultType: 'crm_customer',
      resultId: target.id,
      // 越权目标为确定性演示直接建（非 AI 工具副作用），无独立「业务动作治理详情」可看
      governed: false,
    };
  }

  /** S3 高风险动作：AI 尝试删除客户 → R5 阻断 */
  private async s3(userId: string, ts: number): Promise<Record<string, unknown>> {
    const chat = await this.aiService.chat(userId, {
      message: `查一下删除客户「沙盘客户${ts}」`,
      provider: 'demo',
    });
    const blocked = /blocked \(risk level R5\)|风险级 R5|阻断/i.test(chat.reply);
    return {
      scenario: 's3_r5_block',
      outcome: blocked ? 'passed' : 'check',
      detail: chat.reply.slice(0, 220),
      conversationId: chat.conversationId,
    };
  }

  /** S4 人工确认：写工具确认门控语义（真实确认请到 AI Copilot 完成流式批准） */
  private async s4(userId: string, _ts: number): Promise<Record<string, unknown>> {
    const gated = await this.aiService.executeToolForExternal(
      'create_followup_task',
      { customerId: 1, title: '沙盘确认演示' },
      userId,
    );
    return {
      scenario: 's4_confirm',
      outcome: gated.requiresConfirmation ? 'passed' : 'check',
      detail: gated.requiresConfirmation
        ? '写工具 create_followup_task 触发确认门控（R3）：未经人工确认不会执行。到工作台 AI Copilot 说「为某客户创建跟进任务」→ 确认卡批准 → 落库，可查看完整决策轨迹。'
        : '未触发确认门控（检查工具/策略）',
      requiresConfirmation: gated.requiresConfirmation,
    };
  }

  /** S5 撤销：命中真实 AI 副作用须显式 confirm（不静默撤销真实效果）；无副作用给指引 */
  private async s5(userId: string, confirm = false): Promise<Record<string, unknown>> {
    const owned = await this.effectsService.listOwned(userId, { limit: 5 }).catch(() => null);
    const items = owned?.items ?? [];
    const effect = items.find((e: { resultType?: string }) => e.resultType !== 'proxy_call');
    if (!effect) {
      return {
        scenario: 's5_revoke',
        outcome: 'guide',
        detail:
          '尚无本人可撤销的 AI 副作用。先到 AI Copilot 确认创建一个跟进任务，再到 AI 轨迹页撤销（软删，可经回收站恢复）。',
      };
    }
    const id = (effect as { id: number }).id;
    const title = (effect as { targetTitle?: string | null }).targetTitle ?? null;
    // 1.0.8 deferred：沙盘不静默撤销真实效果——须调用方显式 confirm（软删虽可恢复，仍先确认）
    if (!confirm) {
      return {
        scenario: 's5_revoke',
        outcome: 'guide',
        effectId: id,
        detail: title
          ? `找到本人最近真实 AI 副作用 #${id}「${title}」（软删可恢复）——沙盘不自动撤销真实效果。演示撤销：到「我的 AI 行为」执行（带确认），或再跑本场景并在弹窗确认。`
          : `找到本人最近真实 AI 副作用 #${id}（软删可恢复）——沙盘不自动撤销真实效果。演示撤销：到「我的 AI 行为」执行（带确认），或再跑本场景并在弹窗确认。`,
      };
    }
    const res = await this.effectsService.revokeOwned(id, userId);
    const revoked = Boolean(res?.revoked);
    return {
      scenario: 's5_revoke',
      outcome: revoked ? 'passed' : 'check',
      detail: revoked
        ? `撤销 AI 副作用 effect #${id} 成功：目标软删（可经回收站恢复），AI 轨迹与审计保持完整。`
        : `撤销 effect #${id} 未生效（该副作用不可本地撤销，按其撤销档位处理）；未做破坏性操作。`,
      effectId: id,
      revoked,
    };
  }
}
