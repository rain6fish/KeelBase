// SPDX-License-Identifier: Apache-2.0

import { createServer, type Server } from 'node:net';
import { probeRedisReachable } from './redis-probe';

describe('probeRedisReachable（TCP 探活）', () => {
  let server: Server | undefined;
  let port = 0;

  afterEach(() => {
    server?.close();
    server = undefined;
  });

  async function listen(): Promise<void> {
    server = createServer();
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    port = (server.address() as { port: number }).port;
  }

  it('端口有监听 → true', async () => {
    await listen();
    await expect(probeRedisReachable(`redis://127.0.0.1:${port}`, 1000)).resolves.toBe(true);
  });

  it('端口无监听 → false（Redis 未起时不建客户端，避免后台无限重连刷屏）', async () => {
    await listen();
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    await expect(probeRedisReachable(`redis://127.0.0.1:${port}`, 1000)).resolves.toBe(false);
  });

  it('URL 无法解析 → null（未知，不据此降级，交调用方处置）', async () => {
    await expect(probeRedisReachable('not-a-url')).resolves.toBeNull();
  });
});
