// SPDX-License-Identifier: Apache-2.0

import { Injectable } from '@nestjs/common';
import { AiService } from '../ai.service';
import { CrmService } from '../../crm/crm.service';
import { UsersService } from '../../users/users.service';
import { AiToolEffectsService } from '../tool-effects/ai-tool-effects.service';

/**
 * Trust 沙盘（roadmap §22.15 可视化 P0）：评审/集成商在工作台一键重放
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

  async run(scenarioId: string, userId: string): Promise<Record<string, unknown>> {
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
        return this.s5(userId);
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
    // 注册 bob
    const bobName = `bob_sandbox_${ts}`;
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

  /** S5 撤销：指引（有副作用时列出最近可撤销项） */
  private async s5(userId: string): Promise<Record<string, unknown>> {
    const owned = await this.effectsService.listOwned(userId, { limit: 5 }).catch(() => null);
    const items = owned?.items ?? [];
    const effect = items.find((e: { resultType?: string }) => e.resultType !== 'proxy_call');
    if (effect) {
      const id = (effect as { id: number }).id;
      const revoked = await this.effectsService.revokeOwned(id, userId);
      return {
        scenario: 's5_revoke',
        outcome: revoked ? 'passed' : 'check',
        detail: `撤销 AI 副作用 effect #${id} → 目标软删（可经回收站恢复）。`,
        effectId: id,
      };
    }
    return {
      scenario: 's5_revoke',
      outcome: 'guide',
      detail:
        '尚无本人可撤销的 AI 副作用。先到 AI Copilot 确认创建一个跟进任务，再到 AI 轨迹页撤销（软删，可经回收站恢复）。',
    };
  }
}
