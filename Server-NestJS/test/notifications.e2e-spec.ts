// SPDX-License-Identifier: Apache-2.0

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, registerUser, authHeader } from './helpers';
import { NotificationsGateway } from '../src/notifications/notifications.gateway';

/**
 * 通知 SSE 越权隔离（security-verification-matrix §2 待补项）：
 * 「他人订阅自己流」断言——A 的 SSE 通知流只收到自己的通知，收不到 B 的。
 *
 * 机制：POST /api/v1/notifications/stream 用 JWT 认证，@CurrentUser 决定订阅挂到哪个 userId；
 * NotificationsGateway.connections 按 userId 隔离。本测试经真实 HTTP 流验证：
 *   先 emitToUser(B) 再 emitToUser(A)，阻塞读 A 的流直到 A 的通知到达，
 *   断言 A 收到的数据含自己的通知、不含 B 的（隔离）。
 */
describe('Notifications SSE 越权隔离 (e2e)', () => {
  let app: INestApplication;
  let port: number;
  let tokenA: string;
  let userIdA: number;
  let userIdB: number;

  beforeAll(async () => {
    app = await createTestApp();
    await app.listen(0);
    port = (app.getHttpServer().address() as { port: number }).port;

    const a = await registerUser(app, {
      username: 'sse_a',
      email: 'sse_a@test.com',
      password: 'SseAa1234',
      nickname: 'SseA',
    });
    const b = await registerUser(app, {
      username: 'sse_b',
      email: 'sse_b@test.com',
      password: 'SseBb1234',
      nickname: 'SseB',
    });
    tokenA = a.accessToken;
    userIdA = (
      await request(app.getHttpServer()).get('/api/v1/auth/me').set(authHeader(a.accessToken)).expect(200)
    ).body.data.id;
    userIdB = (
      await request(app.getHttpServer()).get('/api/v1/auth/me').set(authHeader(b.accessToken)).expect(200)
    ).body.data.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('SSE 通知流越权隔离：A 的流只收到自己的通知，收不到 B 的（他人订阅自己流）', async () => {
    const ctrl = new AbortController();
    const res = await fetch(`http://localhost:${port}/api/v1/notifications/stream`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`stream status ${res.status} ${res.statusText} body=${body}`);
    }
    expect(res.headers.get('content-type')).toContain('text/event-stream');

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    const gateway = app.get(NotificationsGateway);
    // 先给 B 发（A 不应收到），再给 A 发（A 应收到）——若泄漏，B 的会先于 A 的到达
    gateway.emitToUser(userIdB, { id: 1, title: 'B secret', type: 'system' });
    gateway.emitToUser(userIdA, { id: 2, title: 'A notify', type: 'system' });

    const deadline = Date.now() + 5000;
    while (!buf.includes('A notify') && Date.now() < deadline) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
    }

    expect(buf).toContain('A notify'); // A 收到自己的通知
    expect(buf).not.toContain('B secret'); // 收不到 B 的（隔离）

    ctrl.abort();
  });
});
