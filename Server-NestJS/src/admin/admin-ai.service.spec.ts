import { Test } from '@nestjs/testing';
import { AiService } from '../ai/ai.service';
import { AuditService } from '../ai/audit/audit.service';
import { GovernancePolicyService } from '../ai/governance/governance-policy.service';
import { ADMIN_SYSTEM_PROMPT } from '../ai/constants/admin-system-prompt';
import { APP_VERSION } from '../app-version/app-version.config';
import { CapabilitiesService } from '../app-version/capabilities.service';
import { AdminService } from './admin.service';
import { AdminAiService } from './admin-ai.service';

describe('AdminAiService（System AI Assistant）', () => {
  let service: AdminAiService;
  let aiService: { chat: jest.Mock };
  let adminService: { getAnalytics: jest.Mock; getMonitorSummary: jest.Mock };
  let auditService: { getCostBreakdown: jest.Mock };
  let capabilitiesService: { getCapabilities: jest.Mock };
  let governancePolicy: { getPolicy: jest.Mock };

  beforeEach(async () => {
    aiService = {
      chat: jest.fn().mockResolvedValue({
        reply: '平台状态良好',
        conversationId: 'c1',
        provider: 'deepseek',
        model: 'deepseek-v4-flash',
        navigateTo: '/system',
        toolCalls: ['navigate_admin_page'],
      }),
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
    adminService = {
      getAnalytics: jest.fn().mockResolvedValue({
        activeUsers: { totalUsers: 50, wau: 8, mau: 20 },
        retention: { ratePct: 33.33 },
        errors: { aiErrors: 3 },
      }),
      getMonitorSummary: jest.fn().mockResolvedValue({
        counts: { events: 100, notifications: 20 },
      }),
    };
    auditService = {
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
        { provide: AdminService, useValue: adminService },
        { provide: AuditService, useValue: auditService },
        { provide: CapabilitiesService, useValue: capabilitiesService },
        { provide: GovernancePolicyService, useValue: governancePolicy },
      ],
    }).compile();
    service = moduleRef.get(AdminAiService);
  });

  it('以真实管理员身份调用 AiService，注入管理端提示词与 adminMode', async () => {
    await service.assistantChat(5, { message: '平台活跃度如何？' });

    expect(aiService.chat).toHaveBeenCalledTimes(1);
    const [userId, req] = aiService.chat.mock.calls[0];
    expect(userId).toBe('5');
    expect(req.systemPrompt).toBe(ADMIN_SYSTEM_PROMPT);
    expect(req.adminMode).toBe(true);
    expect(req.message).toContain('管理员提问：平台活跃度如何？');
  });

  it('消息包含能力清单/版本/工具清单/治理/实时统计', async () => {
    await service.assistantChat(5, { message: 'hi' });
    const msg: string = aiService.chat.mock.calls[0][1].message;

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
  });

  it('透出 navigateTo/toolCalls', async () => {
    const result = await service.assistantChat(5, { message: '打开系统信息页' });

    expect(result.navigateTo).toBe('/system');
    expect(result.toolCalls).toContain('navigate_admin_page');
    expect(result.conversationId).toBe('c1');
  });

  it('上下文收集失败时静默降级仍对话', async () => {
    adminService.getAnalytics.mockRejectedValue(new Error('db down'));
    capabilitiesService.getCapabilities.mockImplementation(() => {
      throw new Error('manifest down');
    });

    const result = await service.assistantChat(5, { message: 'hi' });

    expect(result.reply).toBeDefined();
    const msg: string = aiService.chat.mock.calls[0][1].message;
    expect(msg).toContain('管理员提问：hi');
    expect(msg).not.toContain('能力清单'); // 失败子项被跳过
  });
});
