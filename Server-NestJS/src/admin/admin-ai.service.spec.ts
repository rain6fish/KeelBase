// SPDX-License-Identifier: Apache-2.0

import { Test } from '@nestjs/testing';
import { AiService } from '../ai/ai.service';
import { ToolExposureService } from '../ai/tools/tool-exposure.service';
import { AuditStatsService } from '../ai/audit/audit-stats.service';
import { GovernancePolicyService } from '../ai/governance-bridge/governance-policy.service';
import { ADMIN_SYSTEM_PROMPT } from '../ai/constants/admin-system-prompt';
import { APP_VERSION } from '../app-version/app-version.config';
import { CapabilitiesService } from '../app-version/capabilities.service';
import { AdminService } from './admin.service';
import { AdminObservabilityService } from './admin-observability.service';
import { AdminAiService } from './admin-ai.service';
import { buildDenialExplanation } from '../common/errors/denial-guidance';

describe('AdminAiService（System AI Assistant）', () => {
  let service: AdminAiService;
  let toolExposure: { getToolInventory: jest.Mock };
  let aiService: { chat: jest.Mock; chatStream: jest.Mock };
  let adminService: { getAnalytics: jest.Mock };
  let adminObservability: { getMonitorSummary: jest.Mock };
  // 成本聚合在拆分后来自 AuditStatsService（阶段 3）
  let auditStats: { getCostBreakdown: jest.Mock };
  let capabilitiesService: { getCapabilities: jest.Mock };
  let governancePolicy: { getPolicy: jest.Mock };

  beforeEach(async () => {
    toolExposure = {
      getToolInventory: jest.fn().mockResolvedValue([
        {
          name: 'query_events',
          description: '查询事件',
          enabled: true,
          requiresConfirmation: false,
          allowedRoles: [],
        },
        {
          name: 'create_todo',
          description: '创建待办',
          enabled: false,
          requiresConfirmation: true,
          allowedRoles: [],
        },
      ]),
    };

    aiService = {
      chat: jest.fn().mockResolvedValue({
        reply: '平台状态良好',
        conversationId: 'c1',
        provider: 'deepseek',
        model: 'deepseek-v4-flash',
        navigateTo: '/system',
        toolCalls: ['navigate_admin_page'],
      }),
      chatStream: jest.fn(),
    };
    adminService = {
      getAnalytics: jest.fn().mockResolvedValue({
        activeUsers: { totalUsers: 50, wau: 8, mau: 20 },
        retention: { ratePct: 33.33 },
        errors: { aiErrors: 3 },
      }),
    };
    // 平台观测域（阶段 3 第十四刀）：监控摘要已独立
    adminObservability = {
      getMonitorSummary: jest.fn().mockResolvedValue({
        counts: { events: 100, notifications: 20 },
      }),
    };
    auditStats = {
      getCostBreakdown: jest.fn().mockResolvedValue({ summary: { totalCalls: 10, totalTokens: 5000 } }),
    };
    capabilitiesService = {
      getCapabilities: jest.fn().mockReturnValue({
        preset: 'full',
        features: {},
        businessModules: [
          { id: 'events', label: '事件', description: '日历事件与提醒' },
          { id: 'crm', label: '客户管理', description: 'AI CRM' },
        ],
      }),
    };
    governancePolicy = {
      getPolicy: jest.fn().mockResolvedValue({
        tools: { create_todo: { enabled: false } },
        audit: { granularity: 'all' },
      }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminAiService,
        { provide: AiService, useValue: aiService },
        { provide: ToolExposureService, useValue: toolExposure },
        { provide: AdminService, useValue: adminService },
        { provide: AdminObservabilityService, useValue: adminObservability },
        { provide: AuditStatsService, useValue: auditStats },
        { provide: CapabilitiesService, useValue: capabilitiesService },
        { provide: GovernancePolicyService, useValue: governancePolicy },
      ],
    }).compile();
    service = moduleRef.get(AdminAiService);
  });

  it('以真实管理员身份调用 AiService，注入管理端提示词与 adminMode，消息保持干净提问', async () => {
    await service.assistantChat(5, { message: '平台活跃度如何？' });

    expect(aiService.chat).toHaveBeenCalledTimes(1);
    const [userId, req] = aiService.chat.mock.calls[0];
    expect(userId).toBe('5');
    expect(req.systemPrompt).toContain(ADMIN_SYSTEM_PROMPT);
    expect(req.adminMode).toBe(true);
    expect(req.message).toBe('平台活跃度如何？');
  });

  it('平台实时上下文拼入 systemPrompt（能力清单/版本/工具清单/治理/实时统计），不进对话历史', async () => {
    await service.assistantChat(5, { message: 'hi' });
    const msg: string = aiService.chat.mock.calls[0][1].systemPrompt;

    expect(msg).toContain('能力清单');
    expect(msg).toContain('事件-日历事件与提醒');
    expect(msg).toContain('客户管理-AI CRM');
    expect(msg).toContain(`应用版本: ${APP_VERSION.latestVersion}`);
    expect(msg).toContain('AI 工具:');
    expect(msg).toContain('治理策略:');
    expect(msg).toContain('create_todo'); // 禁用工具列出
    expect(msg).toContain('平台统计(近30天)');
    expect(msg).toContain('总用户50');
    expect(msg).toContain('AI用量');
    expect(msg).toContain('内容统计');
    // 上下文不污染历史消息
    expect(aiService.chat.mock.calls[0][1].message).toBe('hi');
  });

  it('消息包含来源身份（manifest 来源清单，答「这是什么系统」）', async () => {
    await service.assistantChat(5, { message: '这是什么系统？' });
    const msg: string = aiService.chat.mock.calls[0][1].systemPrompt;

    expect(msg).toContain('来源身份:');
    expect(msg).toContain('protocol'); // manifest protocol 版本
    expect(msg).toContain('来源模块:');
  });

  it('透出 navigateTo/toolCalls', async () => {
    const result = await service.assistantChat(5, { message: '打开系统信息页' });

    expect(result.navigateTo).toBe('/system');
    expect(result.toolCalls).toContain('navigate_admin_page');
    expect(result.conversationId).toBe('c1');
  });

  it('assistantChat 把请求语言透传给 AiService.chat', async () => {
    await service.assistantChat(5, { message: 'hi' }, 'zh');
    expect(aiService.chat.mock.calls[0][2]).toBe('zh');

    await service.assistantChat(5, { message: 'hi' }, 'en');
    expect(aiService.chat.mock.calls[1][2]).toBe('en');
  });

  it('assistantChatStream 透传语言：同一拒绝的 reason 随 lang 为中文/英文', async () => {
    aiService.chatStream.mockImplementation(
      (_id: string, _req: unknown, lang: 'zh' | 'en' = 'en') =>
        (async function* () {
          yield {
            type: 'tool_end',
            toolCall: { name: 'delete_customer' },
            explanation: buildDenialExplanation('risk_r5', { tool: 'delete_customer' }, lang),
          };
        })(),
    );

    const zh: any[] = [];
    for await (const chunk of service.assistantChatStream(5, { message: 'hi' }, 'zh')) {
      zh.push(chunk);
    }
    expect(zh[0].explanation.reason).toContain('风险级');
    expect(zh[0].explanation.reasonKey).toBe('ai.deny.risk_r5.reason');

    const en: any[] = [];
    for await (const chunk of service.assistantChatStream(5, { message: 'hi' }, 'en')) {
      en.push(chunk);
    }
    expect(en[0].explanation.reason).toContain('risk level');
    expect(en[0].explanation.reasonKey).toBe('ai.deny.risk_r5.reason');
  });

  it('上下文收集失败时静默降级仍对话', async () => {
    adminService.getAnalytics.mockRejectedValue(new Error('db down'));
    capabilitiesService.getCapabilities.mockImplementation(() => {
      throw new Error('manifest down');
    });

    const result = await service.assistantChat(5, { message: 'hi' });

    expect(result.reply).toBeDefined();
    const req = aiService.chat.mock.calls[0][1];
    expect(req.message).toBe('hi');
    // 失败子项（能力清单/实时统计）被跳过：仅上下文出现的片段不应出现
    expect(req.systemPrompt).not.toContain('事件-日历事件与提醒');
    expect(req.systemPrompt).not.toContain('总用户50');
  });
});
