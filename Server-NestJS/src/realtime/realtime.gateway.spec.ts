import { WebSocket } from 'ws';
import { JwtService } from '@nestjs/jwt';
import { ModuleRef } from '@nestjs/core';
import { AiService } from '../ai/ai.service';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeService } from './realtime.service';

function mockSocket() {
  const sent: string[] = [];
  const socket = {
    sent,
    readyState: WebSocket.OPEN,
    send: jest.fn((d: string) => sent.push(d)),
    close: jest.fn(),
    ping: jest.fn(),
    terminate: jest.fn(),
    on: jest.fn(),
  };
  return socket as unknown as WebSocket & {
    sent: string[];
    close: jest.Mock;
    terminate: jest.Mock;
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

  describe('heartbeat', () => {
    it('invokes service sweep', () => {
      gateway.handleHeartbeat();
      expect(realtime.sweep).toHaveBeenCalledTimes(1);
    });
  });
});
