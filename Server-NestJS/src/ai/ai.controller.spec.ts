import { NotFoundException } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService, ChatResponse } from './ai.service';
import { ConversationService } from './conversation/conversation.service';
import { StreamChunk } from './interfaces/llm-provider.interface';

describe('AiController', () => {
  let controller: AiController;
  let mockChat: jest.Mock;
  let mockChatStream: jest.Mock;
  let mockGetUserConversations: jest.Mock;
  let mockGetConversation: jest.Mock;
  let mockDeleteConversation: jest.Mock;
  let mockDeleteAllUserConversations: jest.Mock;
  let mockGetConversationTrace: jest.Mock;
  let mockRevokeOwned: jest.Mock;
  let mockConfirmResolve: jest.Mock;
  let mockDeleteAllForUser: jest.Mock;
  let mockGetToolInventory: jest.Mock;
  let mockListToolEffects: jest.Mock;
  let mockRevokeToolEffect: jest.Mock;
  let mockAbility: any;

  const mockUser = { sub: 1, username: 'alex' };

  beforeEach(() => {
    mockChat = jest.fn();
    mockChatStream = jest.fn();
    mockGetUserConversations = jest.fn();
    mockGetConversation = jest.fn();
    mockDeleteConversation = jest.fn();
    mockDeleteAllUserConversations = jest.fn();
    mockGetConversationTrace = jest.fn();
    mockRevokeOwned = jest.fn();
    mockConfirmResolve = jest.fn().mockReturnValue(true);
    mockDeleteAllForUser = jest.fn();
    mockGetToolInventory = jest.fn();
    mockListToolEffects = jest.fn();
    mockRevokeToolEffect = jest.fn();
    mockAbility = { cannot: () => false };
    const mockAiService = { chat: mockChat, chatStream: mockChatStream, getToolInventory: mockGetToolInventory } as unknown as AiService;
    const mockConversationService = {
      getUserConversations: mockGetUserConversations,
      getConversation: mockGetConversation,
      deleteConversation: mockDeleteConversation,
      deleteAllUserConversations: mockDeleteAllUserConversations,
    } as unknown as ConversationService;
    const mockConfirmationStore = {
      resolve: mockConfirmResolve,
      create: jest.fn(),
    } as any;
    const mockMemoriesService = { deleteAllForUser: mockDeleteAllForUser } as any;
    const mockToolEffectsService = { list: mockListToolEffects, revoke: mockRevokeToolEffect, revokeOwned: mockRevokeOwned } as any;
    const mockDecisionTraceService = { getConversationTrace: mockGetConversationTrace } as any;
    controller = new AiController(
      mockAiService,
      mockConversationService,
      mockConfirmationStore,
      mockMemoriesService,
      mockToolEffectsService,
      mockDecisionTraceService,
    );
  });

  describe('POST /ai/chat', () => {
    const mockResponse: ChatResponse = {
      conversationId: 'conv-1',
      reply: '本月有 5 个事件',
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
    };

    it('should call aiService.chat with user.sub as userId', async () => {
      mockChat.mockResolvedValue(mockResponse);

      const result = await controller.chat(
        { message: '本月有哪些事件？', provider: 'deepseek', model: 'deepseek-v4-flash', conversationId: 'conv-1' },
        mockUser as any,
      );

      expect(mockChat).toHaveBeenCalledWith('1', {
        message: '本月有哪些事件？',
        provider: 'deepseek',
        model: 'deepseek-v4-flash',
        conversationId: 'conv-1',
      });
      expect(result).toEqual(mockResponse);
    });

    it('should work with minimal input (message only)', async () => {
      mockChat.mockResolvedValue({ ...mockResponse, conversationId: 'conv-2' });

      const result = await controller.chat(
        { message: 'Hi' },
        mockUser as any,
      );

      expect(mockChat).toHaveBeenCalledWith('1', { message: 'Hi' });
      expect(result.reply).toBe('本月有 5 个事件');
    });

    it('should propagate errors from aiService', async () => {
      mockChat.mockRejectedValue(new Error('Provider unavailable'));

      await expect(
        controller.chat({ message: 'Hi' }, mockUser as any),
      ).rejects.toThrow('Provider unavailable');
    });
  });

  describe('POST /ai/chat/stream (SSE)', () => {
    it('should set SSE headers on response', async () => {
      async function* mockStream(): AsyncIterable<StreamChunk> {
        yield { type: 'text' as const, content: 'Hello' };
        yield { type: 'done' as const };
      }
      mockChatStream.mockReturnValue(mockStream());

      const setHeaders: Record<string, string> = {};
      const mockRes: any = {
        setHeader: jest.fn((k: string, v: string) => { setHeaders[k] = v; }),
        flushHeaders: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
        on: jest.fn().mockReturnThis(),
        destroyed: false,
      };

      await controller.chatStream(
        { message: 'Hi' },
        mockUser as any,
        mockRes,
      );

      expect(setHeaders['Content-Type']).toBe('text/event-stream');
      expect(setHeaders['Cache-Control']).toBe('no-cache');
      expect(setHeaders['Connection']).toBe('keep-alive');
      expect(mockRes.flushHeaders).toHaveBeenCalled();
    });

    it('should write SSE formatted events', async () => {
      async function* mockStream(): AsyncIterable<StreamChunk> {
        yield { type: 'text' as const, content: 'Hello' };
        yield { type: 'done' as const };
      }
      mockChatStream.mockReturnValue(mockStream());

      const chunks: string[] = [];
      const mockRes: any = {
        setHeader: jest.fn(),
        flushHeaders: jest.fn(),
        write: jest.fn((chunk: string) => chunks.push(chunk)),
        end: jest.fn(),
        on: jest.fn().mockReturnThis(),
        destroyed: false,
      };

      await controller.chatStream(
        { message: 'Hi' },
        mockUser as any,
        mockRes,
      );

      expect(chunks.length).toBeGreaterThanOrEqual(2);
      expect(chunks.some((c) => c.includes('event: text'))).toBe(true);
      expect(chunks.some((c) => c.includes('data:'))).toBe(true);
    });

    it('should handle client disconnect gracefully', async () => {
      let closeHandler: (() => void) | undefined;
      const mockRes: any = {
        setHeader: jest.fn(),
        flushHeaders: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
        on: jest.fn((_event: string, fn: () => void) => { closeHandler = fn; }),
        destroyed: false,
      };

      async function* slowStream(): AsyncIterable<StreamChunk> {
        yield { type: 'text' as const, content: 'A' };
        closeHandler?.();
        yield { type: 'text' as const, content: 'B' };
      }
      mockChatStream.mockReturnValue(slowStream());

      await controller.chatStream(
        { message: 'Hi' },
        mockUser as any,
        mockRes,
      );

      // Should not crash — when client disconnects, aborted flag breaks the loop
      expect(mockRes.end).not.toHaveBeenCalled();
    });

    it('should handle stream error gracefully', async () => {
      async function* errorStream(): AsyncIterable<StreamChunk> {
        throw new Error('Stream crashed');
      }
      mockChatStream.mockReturnValue(errorStream());

      const mockRes: any = {
        setHeader: jest.fn(),
        flushHeaders: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
        on: jest.fn().mockReturnThis(),
        destroyed: false,
      };

      await expect(
        controller.chatStream({ message: 'Hi' }, mockUser as any, mockRes),
      ).resolves.toBeUndefined();
    });
  });

  describe('Conversation management', () => {
    it('GET conversations should return user conversations', async () => {
      const mockConvs = [{ id: 'conv-1', userId: '1', messages: [] }];
      mockGetUserConversations.mockResolvedValue(mockConvs);

      const result = await controller.getConversations(mockUser as any, {});

      expect(mockGetUserConversations).toHaveBeenCalledWith('1');
      expect(result).toEqual(mockConvs);
    });

    it('GET conversations/:id should return full conversation with userId', async () => {
      const mockConv = { id: 'conv-1', userId: '1', messages: [{ role: 'user', content: 'hi' }] };
      mockGetConversation.mockResolvedValue(mockConv);

      const result = await controller.getConversation('conv-1', mockUser as any, mockAbility);

      expect(mockGetConversation).toHaveBeenCalledWith('conv-1', '1', mockAbility);
      expect(result).toEqual(mockConv);
    });

    it('DELETE conversation should call deleteConversation with userId', async () => {
      mockDeleteConversation.mockResolvedValue(undefined);

      await controller.deleteConversation('conv-1', mockUser as any, mockAbility);

      expect(mockDeleteConversation).toHaveBeenCalledWith('conv-1', '1', mockAbility);
    });

    it('DELETE conversations should clear all user conversations', async () => {
      mockDeleteAllUserConversations.mockResolvedValue(undefined);

      await controller.clearConversations(mockUser as any);

      expect(mockDeleteAllUserConversations).toHaveBeenCalledWith('1');
    });

    it('GET conversations/:id/trace should delegate with user + ability', async () => {
      const mockTrace = { conversation: { id: 'conv-1' }, steps: [] };
      mockGetConversationTrace.mockResolvedValue(mockTrace);

      const result = await controller.getConversationTrace('conv-1', mockUser as any, mockAbility);

      expect(mockGetConversationTrace).toHaveBeenCalledWith('conv-1', '1', mockAbility);
      expect(result).toEqual(mockTrace);
    });

    it('DELETE my/tool-effects/:id 本人撤销（P0-15）→ 委托 revokeOwned + 非本人 404', async () => {
      mockRevokeOwned.mockResolvedValue({ revoked: true, effectId: 7 });
      const ok = await controller.revokeMyToolEffect(7, mockUser as any);
      expect(mockRevokeOwned).toHaveBeenCalledWith(7, '1');
      expect(ok).toEqual({ revoked: true, effectId: 7 });

      mockRevokeOwned.mockResolvedValue(null);
      await expect(controller.revokeMyToolEffect(7, mockUser as any)).rejects.toThrow(NotFoundException);
    });
  });

  describe('POST /ai/confirmations/:token', () => {
    it('确认成功 → 返回 ok 与 trustTool', async () => {
      mockConfirmResolve.mockReturnValue(true);
      const result = await controller.confirm('tok-1', { decision: 'approve', trustTool: true }, mockUser as any);
      expect(mockConfirmResolve).toHaveBeenCalledWith('tok-1', '1', 'approve', true);
      expect(result).toEqual({ ok: true, trustTool: true });
    });

    it('确认失败（不存在/已过期）→ 404', async () => {
      mockConfirmResolve.mockReturnValue(false);
      await expect(
        controller.confirm('tok-1', { decision: 'approve', trustTool: false }, mockUser as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('decision 为 reject 时透传 trustTool 默认 false', async () => {
      mockConfirmResolve.mockReturnValue(true);
      const result = await controller.confirm('tok-2', { decision: 'reject' }, mockUser as any);
      expect(mockConfirmResolve).toHaveBeenCalledWith('tok-2', '1', 'reject', undefined);
      expect(result).toEqual({ ok: true, trustTool: false });
    });
  });

  describe('DELETE /ai/memory', () => {
    it('清除当前用户长期记忆 → 调用 deleteAllForUser 并返回 null', async () => {
      mockDeleteAllForUser.mockResolvedValue(undefined);
      const result = await controller.clearMemory(mockUser as any);
      expect(mockDeleteAllForUser).toHaveBeenCalledWith('1');
      expect(result).toBeNull();
    });
  });

  describe('管理员治理端点（HS-2/HS-3）', () => {
    it('GET /ai/tools 委托 getToolInventory', () => {
      const inventory = [{ name: 'create_event', risk: 'write' }];
      mockGetToolInventory.mockReturnValue(inventory);
      expect(controller.getTools()).toEqual(inventory);
    });

    it('GET /ai/tool-effects 无 userId → 不过滤', () => {
      mockListToolEffects.mockReturnValue({ items: [], total: 0 });
      controller.getToolEffects(undefined, 1, 20);
      expect(mockListToolEffects).toHaveBeenCalledWith({ userId: undefined, page: 1, limit: 20 });
    });

    it('GET /ai/tool-effects 带 userId（字符串）→ 转数字过滤', () => {
      controller.getToolEffects('42', 1, 20);
      expect(mockListToolEffects).toHaveBeenCalledWith({ userId: 42, page: 1, limit: 20 });
    });

    it('DELETE /ai/tool-effects/:id 撤销成功 → 返回结果', async () => {
      mockRevokeToolEffect.mockResolvedValue({ revoked: true, effectId: 1 });
      const result = await controller.revokeToolEffect(1);
      expect(mockRevokeToolEffect).toHaveBeenCalledWith(1);
      expect(result).toEqual({ revoked: true, effectId: 1 });
    });

    it('DELETE /ai/tool-effects/:id 不存在 → 404', async () => {
      mockRevokeToolEffect.mockResolvedValue(null);
      await expect(controller.revokeToolEffect(1)).rejects.toThrow(NotFoundException);
    });
  });
});
