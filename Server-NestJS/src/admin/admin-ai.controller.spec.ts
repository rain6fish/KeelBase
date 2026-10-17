// SPDX-License-Identifier: Apache-2.0

import { Test } from '@nestjs/testing';
import { AdminAiService } from './admin-ai.service';
import { AdminAiController } from './admin-ai.controller';
import { buildDenialExplanation } from '../common/errors/denial-guidance';

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

  it('chat：Accept-Language zh-CN 时复用共享判定，把 zh 交给服务', async () => {
    await controller.chat(
      { message: 'hi' },
      { sub: 5, username: 'admin5', role: 'admin' } as any,
      'zh-CN,zh;q=0.9',
    );

    expect(adminAiService.assistantChat).toHaveBeenCalledWith(5, { message: 'hi' }, 'zh');
  });

  it('chat：Accept-Language en 时把 en 交给服务', async () => {
    await controller.chat(
      { message: 'hi' },
      { sub: 5, username: 'admin5', role: 'admin' } as any,
      'en-US,en;q=0.9',
    );

    expect(adminAiService.assistantChat).toHaveBeenCalledWith(5, { message: 'hi' }, 'en');
  });

  it('chat/stream：Accept-Language zh-CN 时把 zh 交给服务（与用户端同一判定）', async () => {
    async function* fakeStream() {
      yield { type: 'done', conversationId: 'c3' };
    }
    (adminAiService.assistantChatStream as jest.Mock).mockImplementation(() => fakeStream());
    const res = {
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      write: jest.fn().mockReturnValue(true),
      end: jest.fn(),
      destroyed: false,
      on: jest.fn(),
    };

    await controller.chatStream(
      { message: 'hi' },
      { sub: 5, username: 'admin5', role: 'admin' } as any,
      res as any,
      'zh-CN,zh;q=0.9',
    );

    expect(adminAiService.assistantChatStream).toHaveBeenCalledWith(5, { message: 'hi' }, 'zh');
  });

  it('chat/stream：不带 Accept-Language 时保持两参调用（默认语言由服务层定）', async () => {
    async function* fakeStream() {
      yield { type: 'done', conversationId: 'c4' };
    }
    (adminAiService.assistantChatStream as jest.Mock).mockImplementation(() => fakeStream());
    const res = {
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      write: jest.fn().mockReturnValue(true),
      end: jest.fn(),
      destroyed: false,
      on: jest.fn(),
    };

    await controller.chatStream(
      { message: 'hi' },
      { sub: 5, username: 'admin5', role: 'admin' } as any,
      res as any,
    );

    expect(adminAiService.assistantChatStream).toHaveBeenCalledWith(5, { message: 'hi' });
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

  it('成对读数：同一拒绝在 zh-CN / en 下 tool_end.explanation.reason 为中文 / 英文（真服务装配）', async () => {
    const aiService = {
      chat: jest.fn(),
      chatStream: jest.fn(
        (_id: string, _req: unknown, lang: 'zh' | 'en' = 'en') =>
          (async function* () {
            yield {
              type: 'tool_end',
              toolCall: { name: 'delete_customer' },
              explanation: buildDenialExplanation('risk_r5', { tool: 'delete_customer' }, lang),
            };
          })(),
      ),
    };
    const service = new AdminAiService(
      aiService as any,
      { getToolInventory: jest.fn().mockResolvedValue([]) } as any,
      { getAnalytics: jest.fn().mockResolvedValue(null) } as any,
      { getMonitorSummary: jest.fn().mockResolvedValue(null) } as any,
      { getCostBreakdown: jest.fn().mockResolvedValue(null) } as any,
      { getCapabilities: jest.fn().mockReturnValue({ preset: 'full', businessModules: [] }) } as any,
      { getPolicy: jest.fn().mockResolvedValue({ tools: {}, audit: { granularity: 'all' } }) } as any,
    );
    const wired = new AdminAiController(service);

    const run = async (acceptLanguage?: string) => {
      const writes: string[] = [];
      const res = {
        setHeader: jest.fn(),
        flushHeaders: jest.fn(),
        write: (c: string) => { writes.push(c); return true; },
        end: jest.fn(),
        destroyed: false,
        on: jest.fn(),
      };
      await wired.chatStream(
        { message: 'hi' },
        { sub: 5, username: 'admin5', role: 'admin' } as any,
        res as any,
        acceptLanguage,
      );
      return writes.join('');
    };

    const zh = await run('zh-CN,zh;q=0.9');
    expect(zh).toContain('风险级');

    const en = await run('en-US,en;q=0.9');
    expect(en).toContain('risk level');
    expect(en).not.toContain('风险级');

    const fallback = await run();
    expect(fallback).toContain('risk level');
  });
});
