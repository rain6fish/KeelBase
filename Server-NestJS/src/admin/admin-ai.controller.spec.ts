import { Test } from '@nestjs/testing';
import { AdminAiService } from './admin-ai.service';
import { AdminAiController } from './admin-ai.controller';

describe('AdminAiController（System AI Assistant）', () => {
  let controller: AdminAiController;
  let adminAiService: { assistantChat: jest.Mock; assistantChatStream: jest.Mock };

  beforeEach(async () => {
    adminAiService = {
      assistantChat: jest.fn().mockResolvedValue({
        reply: '已打开系统信息页',
        conversationId: 'c1',
        navigateTo: '/system',
        toolCalls: ['navigate_admin_page'],
      }),
      assistantChatStream: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [AdminAiController],
      providers: [{ provide: AdminAiService, useValue: adminAiService }],
    }).compile();
    controller = moduleRef.get(AdminAiController);
  });

  it('以真实管理员身份委托 AdminAiService.assistantChat 并透出 navigateTo/toolCalls', async () => {
    const result = await controller.chat({ message: '打开系统信息页' }, { sub: 5, username: 'admin5', role: 'admin' } as any);

    expect(adminAiService.assistantChat).toHaveBeenCalledWith(
      5,
      { message: '打开系统信息页' },
    );
    expect(result.reply).toBe('已打开系统信息页');
    expect(result.conversationId).toBe('c1');
    expect(result.navigateTo).toBe('/system');
    expect(result.toolCalls).toContain('navigate_admin_page');
  });

  it('chat/stream：SSE 流式委托 assistantChatStream 并写事件（写工具确认通道基础）', async () => {
    async function* fakeStream() {
      yield { type: 'text', content: '创建事件需要确认' };
      yield { type: 'confirmation_request', confirmation: { token: 't-1', toolName: 'create_event' } };
      yield { type: 'done', conversationId: 'c2' };
    }
    (adminAiService.assistantChatStream as jest.Mock).mockImplementation(() => fakeStream());
    const writes: string[] = [];
    const res = {
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      write: (c: string) => { writes.push(c); return true; },
      end: jest.fn(),
      destroyed: false,
      on: jest.fn(),
    };

    await controller.chatStream({ message: '建个事件' }, { sub: 5, username: 'admin5', role: 'admin' } as any, res as any);

    expect(adminAiService.assistantChatStream).toHaveBeenCalledWith(5, { message: '建个事件' });
    const all = writes.join('');
    expect(all).toContain('event: text');
    expect(all).toContain('创建事件需要确认');
    expect(all).toContain('event: confirmation_request'); // 写确认通道（管理端写工具可用）
    expect(all).toContain('t-1');
    expect(res.end).toHaveBeenCalled();
  });
});
