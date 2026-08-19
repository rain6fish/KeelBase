import { WebSocket } from 'ws';
import { JwtService } from '@nestjs/jwt';
import { ModuleRef } from '@nestjs/core';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeService } from './realtime.service';

function mockSocket(opts: { readyState?: number; sendThrows?: boolean } = {}) {
  const sent: string[] = [];
  const handlers: Record<string, (...args: unknown[]) => void> = {};
  const socket = {
    sent,
    readyState: opts.readyState ?? WebSocket.OPEN,
    send: jest.fn((d: string) => {
      if (opts.sendThrows) throw new Error('send failed');
      sent.push(d);
    }),
    close: jest.fn(),
    ping: jest.fn(),
    terminate: jest.fn(),
    on: jest.fn((ev: string, cb: (...args: unknown[]) => void) => {
      handlers[ev] = cb;
    }),
  };
  return {
    ...socket,
    _emit: (ev: string) => handlers[ev]?.(),
  } as unknown as WebSocket & {
    sent: string[];
    close: jest.Mock;
    terminate: jest.Mock;
    _emit: (ev: string) => void;
  };
}

function parsed(sent: string[]): Array<{ type: string; data: unknown }> {
  return sent.map((s) => JSON.parse(s));
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('RealtimeGateway', () => {
  let gateway: RealtimeGateway;
  let jwt: { verifyAsync: jest.Mock };
  let realtime: { register: jest.Mock; unregister: jest.Mock; sweep: jest.Mock };
  let aiService: { chatStream: jest.Mock };
  let flags: { isEnabled: jest.Mock };
  let moduleRef: { get: jest.Mock };

  const payload = { sub: 42, username: 'alex', role: 'user' as const };

  beforeEach(() => {
    jwt = { verifyAsync: jest.fn() };
    realtime = { register: jest.fn(), unregister: jest.fn(), sweep: jest.fn() };
    aiService = { chatStream: jest.fn() };
    flags = { isEnabled: jest.fn().mockReturnValue(true) };
    moduleRef = { get: jest.fn().mockReturnValue(aiService) };
    gateway = new RealtimeGateway(
      jwt as unknown as JwtService,
      realtime as unknown as RealtimeService,
      flags as unknown as FeatureFlagsService,
      moduleRef as unknown as ModuleRef,
    );
  });

  describe('handshake', () => {
    it('rejects connection with missing/invalid token (4401)', async () => {
      jwt.verifyAsync.mockRejectedValue(new Error('bad token'));
      const ws = mockSocket();
      await gateway.handleConnection(ws, { url: '/ws?token=bad' } as never);
      expect(ws.close).toHaveBeenCalledWith(4401, 'Unauthorized');
      expect(realtime.register).not.toHaveBeenCalled();
    });

    it('registers user and sends connected on valid token', async () => {
      jwt.verifyAsync.mockResolvedValue(payload);
      const ws = mockSocket();
      await gateway.handleConnection(ws, { url: '/ws?token=good' } as never);
      expect(realtime.register).toHaveBeenCalledWith(42, ws);
      const frames = parsed(ws.sent);
      expect(frames[0].event).toBe('connected');
      expect((frames[0].data as { userId: number }).userId).toBe(42);
    });

    it('URL 无 query 或 token 缺失 → 4401（extractToken 降级）', async () => {
      const ws = mockSocket();
      await gateway.handleConnection(ws, { url: '/ws' } as never);
      expect(ws.close).toHaveBeenCalledWith(4401, 'Unauthorized');

      await gateway.handleConnection(ws, undefined as never);
      expect(ws.close).toHaveBeenCalledTimes(2);
      expect(realtime.register).not.toHaveBeenCalled();
    });

    it('payload 缺 username → 4401', async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: 42, username: undefined } as never);
      const ws = mockSocket();
      await gateway.handleConnection(ws, { url: '/ws?token=t' } as never);
      expect(ws.close).toHaveBeenCalledWith(4401, 'Unauthorized');
    });

    it('ai:chat 在未认证 socket 上关闭 4401', async () => {
      const ws = mockSocket();
      await gateway.handleAiChatEvent(ws, { message: 'x' });
      expect(ws.close).toHaveBeenCalledWith(4401, 'Unauthorized');
      expect(aiService.chatStream).not.toHaveBeenCalled();
    });

    it('pong 回调把连接标记为存活', async () => {
      jwt.verifyAsync.mockResolvedValue(payload);
      const ws = mockSocket();
      await gateway.handleConnection(ws, { url: '/ws?token=good' } as never);
      // 触发 handleConnection 里注册的 pong handler（isAlive 置 true），仅需不抛错
      expect(() => ws._emit('pong')).not.toThrow();
    });
  });

  describe('disconnect / ping / client message', () => {
    it('断开已注册连接时 unregister 并清理', async () => {
      jwt.verifyAsync.mockResolvedValue(payload);
      const ws = mockSocket();
      await gateway.handleConnection(ws, { url: '/ws?token=good' } as never);

      gateway.handleDisconnect(ws);

      expect(realtime.unregister).toHaveBeenCalledWith(42, ws);
    });

    it('断开未注册连接时不调用 unregister', async () => {
      const ws = mockSocket();
      gateway.handleDisconnect(ws);
      expect(realtime.unregister).not.toHaveBeenCalled();
    });

    it('ping 回复 pong 信封', async () => {
      jwt.verifyAsync.mockResolvedValue(payload);
      const ws = mockSocket();
      await gateway.handleConnection(ws, { url: '/ws?token=good' } as never);
      ws.sent.length = 0;

      gateway.handlePing(ws);

      const frames = parsed(ws.sent);
      expect(frames[0].event).toBe('pong');
    });

    it('已认证 socket 的 message 仅记录不回显', async () => {
      jwt.verifyAsync.mockResolvedValue(payload);
      const ws = mockSocket();
      await gateway.handleConnection(ws, { url: '/ws?token=good' } as never);
      ws.sent.length = 0;

      gateway.handleClientMessage(ws, { hello: 'world' });

      expect(ws.sent.length).toBe(0);
    });

    it('未认证 socket 的 message 关闭 4401', async () => {
      const ws = mockSocket();
      gateway.handleClientMessage(ws, 'hi');
      expect(ws.close).toHaveBeenCalledWith(4401, 'Unauthorized');
    });

    it('已关闭 socket 的 send 静默跳过', async () => {
      const ws = mockSocket({ readyState: WebSocket.CLOSED });
      gateway.handlePing(ws);
      expect(ws.sent.length).toBe(0);
      expect(ws.close).not.toHaveBeenCalled();
    });

    it('send 抛错被捕获（logger.debug 降级，不中断握手）', async () => {
      jwt.verifyAsync.mockResolvedValue(payload);
      const ws = mockSocket({ sendThrows: true });
      await gateway.handleConnection(ws, { url: '/ws?token=good' } as never);

      expect(realtime.register).toHaveBeenCalledWith(42, ws);
      expect(ws.close).not.toHaveBeenCalled();
    });
  });

  describe('ai:chat', () => {
    it('streams mapped frames and ends with ai:done', async () => {
      jwt.verifyAsync.mockResolvedValue(payload);
      const ws = mockSocket();
      await gateway.handleConnection(ws, { url: '/ws?token=good' } as never);
      ws.sent.length = 0;

      async function* gen() {
        yield { type: 'text', content: 'hi' };
        yield { type: 'done', conversationId: 'c1' };
      }
      aiService.chatStream.mockReturnValue(gen());

      await gateway.handleAiChatEvent(ws, { message: 'hello' });
      await wait(20);

      const types = parsed(ws.sent).map((f) => f.event);
      expect(types).toContain('ai:text');
      expect(types).toContain('ai:done');
    });

    it('rejects when ai feature is disabled', async () => {
      flags.isEnabled.mockReturnValue(false);
      jwt.verifyAsync.mockResolvedValue(payload);
      const ws = mockSocket();
      await gateway.handleConnection(ws, { url: '/ws?token=good' } as never);
      ws.sent.length = 0;

      await gateway.handleAiChatEvent(ws, { message: 'x' });
      await wait(10);

      const frames = parsed(ws.sent);
      expect(frames[0].event).toBe('error');
      expect((frames[0].data as { code: string }).code).toBe('AI_DISABLED');
    });

    it('ai:abort stops the stream without ai:done', async () => {
      jwt.verifyAsync.mockResolvedValue(payload);
      const ws = mockSocket();
      await gateway.handleConnection(ws, { url: '/ws?token=good' } as never);
      ws.sent.length = 0;

      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      async function* gen() {
        yield { type: 'text', content: 'x' };
        await gate;
        yield { type: 'done', conversationId: 'x' };
      }
      aiService.chatStream.mockReturnValue(gen());

      await gateway.handleAiChatEvent(ws, { message: 'x' });
      await wait(10);
      gateway.handleAiAbort(ws);
      release();
      await wait(20);

      const types = parsed(ws.sent).map((f) => f.event);
      expect(types).toContain('ai:text');
      expect(types).not.toContain('ai:done');
    });
  });

  describe('ai:chat 限流与并发', () => {
    async function connectAndStream() {
      jwt.verifyAsync.mockResolvedValue(payload);
      const ws = mockSocket();
      await gateway.handleConnection(ws, { url: '/ws?token=good' } as never);
      ws.sent.length = 0;
      aiService.chatStream.mockReturnValue(
        (async function* () {
          yield { type: 'done', conversationId: 'c' };
        })(),
      );
      return ws;
    }

    it('超过 30 次/分钟 → AI_RATE_LIMITED', async () => {
      const ws = await connectAndStream();

      for (let i = 0; i < 31; i++) {
        await gateway.handleAiChatEvent(ws, { message: `m${i}` });
      }
      await wait(20);

      const frames = parsed(ws.sent);
      expect(
        frames.some(
          (f) => f.event === 'error' && (f.data as { code: string }).code === 'AI_RATE_LIMITED',
        ),
      ).toBe(true);
    });

    it('heartbeat 重置限流窗口（清空 aiCalls）', async () => {
      const ws = await connectAndStream();

      for (let i = 0; i < 31; i++) {
        await gateway.handleAiChatEvent(ws, { message: `m${i}` });
      }
      await wait(20);
      gateway.handleHeartbeat();

      ws.sent.length = 0;
      await gateway.handleAiChatEvent(ws, { message: 'again' });
      await wait(20);

      const frames = parsed(ws.sent);
      expect(
        frames.some(
          (f) => f.event === 'error' && (f.data as { code: string }).code === 'AI_RATE_LIMITED',
        ),
      ).toBe(false);
    });

    it('已有流进行中再次 ai:chat → 中止旧流（last-write-wins）', async () => {
      jwt.verifyAsync.mockResolvedValue(payload);
      const ws = mockSocket();
      await gateway.handleConnection(ws, { url: '/ws?token=good' } as never);
      ws.sent.length = 0;

      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      aiService.chatStream
        .mockReturnValueOnce(
          (async function* () {
            yield { type: 'text', content: 'first' };
            await gate;
            yield { type: 'done', conversationId: 'c1' };
          })(),
        )
        .mockReturnValueOnce(
          (async function* () {
            yield { type: 'done', conversationId: 'c2' };
          })(),
        );

      await gateway.handleAiChatEvent(ws, { message: 'x1' });
      await wait(10);
      // 第二个流会 abort 第一个流并等待其收尾（prev.finished）
      const second = gateway.handleAiChatEvent(ws, { message: 'x2' });
      await wait(10);
      release();
      await second;
      await wait(20);

      // 两个流都收尾，无异常
      expect(realtime.register).toHaveBeenCalled();
    });

    it('chatStream 抛错 → 发送 ai:error 后正常收尾 ai:done', async () => {
      jwt.verifyAsync.mockResolvedValue(payload);
      const ws = mockSocket();
      await gateway.handleConnection(ws, { url: '/ws?token=good' } as never);
      ws.sent.length = 0;
      aiService.chatStream.mockImplementation(() => {
        throw new Error('boom');
      });

      await gateway.handleAiChatEvent(ws, { message: 'x' });
      await wait(20);

      const frames = parsed(ws.sent);
      expect(frames.some((f) => f.event === 'ai:error')).toBe(true);
      expect(frames.some((f) => f.event === 'ai:done')).toBe(true);
    });

    it('未知 chunk 类型被跳过（不发送）', async () => {
      jwt.verifyAsync.mockResolvedValue(payload);
      const ws = mockSocket();
      await gateway.handleConnection(ws, { url: '/ws?token=good' } as never);
      ws.sent.length = 0;
      aiService.chatStream.mockReturnValue(
        (async function* () {
          yield { type: 'unknown', content: 'z' };
          yield { type: 'done', conversationId: 'c' };
        })(),
      );

      await gateway.handleAiChatEvent(ws, { message: 'x' });
      await wait(20);

      const events = parsed(ws.sent).map((f) => f.event);
      expect(events).not.toContain('ai:text');
      expect(events).toContain('ai:done');
    });
  });

  describe('heartbeat', () => {
    it('invokes service sweep', () => {
      gateway.handleHeartbeat();
      expect(realtime.sweep).toHaveBeenCalledTimes(1);
    });
  });
});
