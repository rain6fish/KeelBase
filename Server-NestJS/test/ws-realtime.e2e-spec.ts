// SPDX-License-Identifier: Apache-2.0

import { INestApplication, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { WsAdapter } from '@nestjs/platform-ws';
import { WebSocket } from 'ws';
import { AiService } from '../src/ai/ai.service';
import { FeatureFlagsModule } from '../src/feature-flags/feature-flags.module';
import { RealtimeModule } from '../src/realtime/realtime.module';
import { RealtimeService } from '../src/realtime/realtime.service';

/** 最小 WS 测试模块：自给 JwtModule + stub AiService，不加载 AiModule/OrgModule 等全依赖图 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET', 'test-secret'),
      }),
    }),
    FeatureFlagsModule,
    RealtimeModule,
  ],
  providers: [
    {
      provide: AiService,
      useValue: {
        chatStream: async function* () {
          yield { type: 'text', content: 'hi from ws' };
          yield { type: 'done', conversationId: 'c1' };
        },
      },
    },
  ],
})
class WsTestModule {}

async function waitFor(cond: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error('timeout waiting for ws message');
    await new Promise((r) => setTimeout(r, 20));
  }
}

describe('WebSocket Realtime (e2e)', () => {
  let app: INestApplication;
  let port: number;
  let jwt: JwtService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [WsTestModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useWebSocketAdapter(new WsAdapter(app));
    await app.init();
    await app.listen(0);
    port = (app.getHttpServer().address() as { port: number }).port;
    jwt = app.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  function sign(userId = 42): string {
    return jwt.sign({ sub: userId, username: 'wsuser', role: 'user' });
  }

  function connectWs(tk: string): Promise<{ ws: WebSocket; messages: string[] }> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${port}/ws?token=${tk}`);
      const messages: string[] = [];
      ws.on('message', (data) => messages.push(String(data)));
      ws.on('open', () => resolve({ ws, messages }));
      ws.on('error', reject);
    });
  }

  it('rejects invalid token with close code 4401', (done) => {
    const ws = new WebSocket(`ws://localhost:${port}/ws?token=invalid`);
    ws.on('close', (code) => {
      try {
        expect(code).toBe(4401);
        done();
      } catch (err) {
        done(err as Error);
      }
    });
    ws.on('unexpected-response', () => {
      /* 握手拒绝即合法路径 */
      done();
    });
    ws.on('error', () => {
      /* 连接被拒触发 error + close */
    });
  });

  it('connects and receives connected envelope', async () => {
    const { ws, messages } = await connectWs(sign());
    await waitFor(() => messages.length > 0);
    const first = JSON.parse(messages[0]);
    expect(first.event).toBe('connected');
    expect(first.data.userId).toBe(42);
    ws.close();
  });

  it('streams ai:* frames for ai:chat and ends with ai:done', async () => {
    const { ws, messages } = await connectWs(sign());
    ws.send(JSON.stringify({ event: 'ai:chat', data: { message: 'hi' } }));
    await waitFor(() => messages.some((m) => m.startsWith('{"event":"ai:')));
    const types = messages.map((m) => JSON.parse(m).event);
    expect(types).toContain('ai:text');
    expect(types).toContain('ai:done');
    ws.close();
  });

  it('delivers notification frame via RealtimeService.emitToUser', async () => {
    const { ws, messages } = await connectWs(sign(7));
    await waitFor(() => messages.length > 0);
    const svc = app.get(RealtimeService);
    svc.emitToUser(7, 'notification', { id: 1, title: 'WS Hello' });
    await waitFor(() => messages.some((m) => JSON.parse(m).event === 'notification'));
    const frame = messages.map((m) => JSON.parse(m)).find((m) => m.event === 'notification');
    expect(frame.data.title).toBe('WS Hello');
    ws.close();
  });

  it('isolates users: notification to one user does not reach another（他人 room 推送越权 → 隔离）', async () => {
    const a = await connectWs(sign(7));
    const b = await connectWs(sign(8));
    await waitFor(() => a.messages.length > 0);
    await waitFor(() => b.messages.length > 0);
    const svc = app.get(RealtimeService);
    const aBefore = a.messages.length;
    svc.emitToUser(7, 'notification', { id: 1, title: 'A secret' });
    await waitFor(() => a.messages.length > aBefore);
    // B 的 socket 不应收到 A 的通知
    const bNotifs = b.messages.map((m) => JSON.parse(m)).filter((m) => m.event === 'notification');
    expect(bNotifs).toHaveLength(0);
    a.ws.close();
    b.ws.close();
  });
});
