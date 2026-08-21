import { Test } from '@nestjs/testing';
import { AdminAiService } from './admin-ai.service';
import { AdminAiController } from './admin-ai.controller';

describe('AdminAiController（System AI Assistant）', () => {
  let controller: AdminAiController;
  let adminAiService: { assistantChat: jest.Mock };

  beforeEach(async () => {
    adminAiService = {
      assistantChat: jest.fn().mockResolvedValue({
        reply: '已打开系统信息页',
        conversationId: 'c1',
        navigateTo: '/system',
        toolCalls: ['navigate_admin_page'],
      }),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [AdminAiController],
      providers: [{ provide: AdminAiService, useValue: adminAiService }],
    }).compile();
    controller = moduleRef.get(AdminAiController);
  });

  it('委托 AdminAiService.assistantChat 并透出 navigateTo/toolCalls', async () => {
    const result = await controller.chat({ message: '打开系统信息页' });

    expect(adminAiService.assistantChat).toHaveBeenCalledWith({
      message: '打开系统信息页',
    });
    expect(result.reply).toBe('已打开系统信息页');
    expect(result.conversationId).toBe('c1');
    expect(result.navigateTo).toBe('/system');
    expect(result.toolCalls).toContain('navigate_admin_page');
  });
});
