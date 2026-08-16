import { Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Interval } from '@nestjs/schedule';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import { AiService } from '../ai/ai.service';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { RealtimeService } from './realtime.service';
import {
  AI_CHUNK_TO_WS,
  WS_EVENTS,
  WsAiChatRequest,
} from './realtime.types';

const HEARTBEAT_INTERVAL_MS = 30000;
const AI_CHAT_LIMIT_PER_MIN = 30;

interface ActiveStream {
  aborted: boolean;
  finished: Promise<void>;
  abort: () => void;
}

/**
 * WebSocket 双向通道网关（原生 ws，路径 /ws）。
 * 握手：query ?token=<jwt> 校验，失败 4401；成功后注册用户连接并回发 connected。
 * 协议：JSON 信封 { type, data }，详见 docs/ws-realtime.spec.md。
 */
@WebSocketGateway({ path: '/ws' })
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);

  private readonly userBySocket = new WeakMap<WebSocket, JwtPayload>();
  private readonly activeStream = new WeakMap<WebSocket, ActiveStream>();
  /** 每 socket 的 ai:chat 节流计数（心跳周期重置） */
  private readonly aiCalls = new Map<WebSocket, number>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly realtime: RealtimeService,
    private readonly featureFlags: FeatureFlagsService,
    private readonly moduleRef: ModuleRef,
  ) {}

  async handleConnection(client: WebSocket, request?: IncomingMessage): Promise<void> {
    try {
      const token = this.extractToken(request?.url);
      if (!token) throw new Error('missing token');
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
      if (!payload.sub || !payload.username) throw new Error('invalid payload');

      this.userBySocket.set(client, payload);
      (client as { isAlive?: boolean }).isAlive = true;
      this.realtime.register(payload.sub, client);
      client.on('pong', () => {
        (client as { isAlive?: boolean }).isAlive = true;
      });
      this.send(client, WS_EVENTS.CONNECTED, { userId: payload.sub, ts: new Date().toISOString() });
    } catch {
      client.close(4401, 'Unauthorized');
    }
  }

  handleDisconnect(client: WebSocket): void {
    const user = this.userBySocket.get(client);
    if (user) {
      this.realtime.unregister(user.sub, client);
      this.userBySocket.delete(client);
    }
    this.abortStream(client);
  }

  @SubscribeMessage('ping')
  handlePing(client: WebSocket): void {
    this.send(client, WS_EVENTS.PONG, null);
  }

  @SubscribeMessage('ai:chat')
  async handleAiChatEvent(client: WebSocket, data: unknown): Promise<void> {
    const user = this.userBySocket.get(client);
    if (!user) {
      client.close(4401, 'Unauthorized');
      return;
    }
    await this.handleAiChat(client, user, (data as WsAiChatRequest) ?? { message: '' });
  }

  @SubscribeMessage('ai:abort')
  handleAiAbort(client: WebSocket): void {
    this.abortStream(client);
  }

  @SubscribeMessage('message')
  handleClientMessage(client: WebSocket, data: unknown): void {
    const user = this.userBySocket.get(client);
    if (!user) {
      client.close(4401, 'Unauthorized');
      return;
    }
    // 双向 message 能力预留（IM/协同）；一期仅记录，不回显
    this.logger.debug(`ws message from user ${user.sub}: ${JSON.stringify(data ?? null)}`);
  }

  /** 心跳 sweep：30s 一次，清除无 pong 的连接并重置 ai:chat 节流窗口 */
  @Interval(HEARTBEAT_INTERVAL_MS)
  handleHeartbeat(): void {
    this.realtime.sweep();
    for (const client of this.aiCalls.keys()) {
      this.aiCalls.delete(client);
    }
  }

  // ---- private ----

  private extractToken(url?: string): string | null {
    if (!url) return null;
    const qIndex = url.indexOf('?');
    if (qIndex === -1) return null;
    return new URLSearchParams(url.slice(qIndex + 1)).get('token');
  }

  private send(client: WebSocket, event: string, data: unknown): void {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(JSON.stringify({ event, data }));
      } catch (err) {
        this.logger.debug(`ws send ${event} failed: ${(err as Error).message}`);
      }
    }
  }

  private abortStream(client: WebSocket): void {
    const stream = this.activeStream.get(client);
    if (stream) stream.abort();
  }

  private async handleAiChat(client: WebSocket, user: JwtPayload, req: WsAiChatRequest): Promise<void> {
    if (!this.featureFlags.isEnabled('ai')) {
      this.send(client, WS_EVENTS.ERROR, { code: 'AI_DISABLED', message: 'ai feature is disabled' });
      return;
    }
    const calls = (this.aiCalls.get(client) ?? 0) + 1;
    this.aiCalls.set(client, calls);
    if (calls > AI_CHAT_LIMIT_PER_MIN) {
      this.send(client, WS_EVENTS.ERROR, { code: 'AI_RATE_LIMITED', message: 'ai:chat rate limit exceeded' });
      return;
    }
    // 单 socket 单流：已有流先中止并等待其收尾（last-write-wins）
    const prev = this.activeStream.get(client);
    if (prev) {
      prev.abort();
      await prev.finished.catch(() => undefined);
    }

    let finishResolve!: () => void;
    const stream: ActiveStream = {
      aborted: false,
      finished: new Promise<void>((resolve) => {
        finishResolve = resolve;
      }),
      abort: () => {
        stream.aborted = true;
      },
    };
    this.activeStream.set(client, stream);

    void (async () => {
      try {
        const aiService = this.moduleRef.get(AiService, { strict: false });
        const gen = aiService.chatStream(String(user.sub), {
          message: req.message ?? '',
          provider: req.provider,
          model: req.model,
          conversationId: req.conversationId,
          images: req.images,
        });
        for await (const chunk of gen) {
          if (stream.aborted) break;
          const type = AI_CHUNK_TO_WS[chunk.type];
          if (type) this.send(client, type, chunk);
          if (chunk.type === 'done') break;
        }
      } catch (err) {
        this.send(client, 'ai:error', { error: (err as Error)?.message ?? 'stream error' });
      } finally {
        if (!stream.aborted) this.send(client, 'ai:done', {});
        this.activeStream.delete(client);
        finishResolve();
      }
    })();
  }
}
