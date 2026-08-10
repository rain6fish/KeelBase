import { Test } from '@nestjs/testing';
import { AiService } from '../ai/ai.service';
import { AuditService } from '../ai/audit/audit.service';
import { AdminService } from './admin.service';
import { AdminAiController } from './admin-ai.controller';

describe('AdminAiController（AI-22）', () => {
  let controller: AdminAiController;
  let aiService: { chat: jest.Mock };
  let adminService: { getAnalytics: jest.Mock; getMonitorSummary: jest.Mock };
  let auditService: { getCostBreakdown: jest.Mock };

  beforeEach(async () => {
    aiService = { chat: jest.fn().mockResolvedValue({ reply: '平台状态良好', conversationId: 'c1' }) };
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

    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminAiController,
        { provide: AiService, useValue: aiService },
        { provide: AdminService, useValue: adminService },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();
    controller = moduleRef.get(AdminAiController);
  });

  it('注入平台上下文并转发到 AiService', async () => {
    const result = await controller.chat({ message: '平台活跃度如何？' });

    expect(result.reply).toBe('平台状态良好');
    expect(aiService.chat).toHaveBeenCalledTimes(1);
    const [userId, req] = aiService.chat.mock.calls[0];
    expect(userId).toBe('0');
    expect(req.message).toContain('平台统计(近30天)');
    expect(req.message).toContain('总用户50');
    expect(req.message).toContain('月活20');
    expect(req.message).toContain('AI用量');
    expect(req.message).toContain('管理员提问：平台活跃度如何？');
  });

  it('上下文收集失败时静默降级仍对话', async () => {
    adminService.getAnalytics.mockRejectedValue(new Error('db down'));
    auditService.getCostBreakdown.mockRejectedValue(new Error('err'));

    const result = await controller.chat({ message: 'hi' });

    expect(result.reply).toBeDefined();
    expect(aiService.chat.mock.calls[0][1].message).toContain('管理员提问：hi');
  });
});
