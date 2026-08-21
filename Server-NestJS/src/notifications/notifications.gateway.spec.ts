import { NotificationsGateway } from './notifications.gateway';
import type { Response } from 'express';

function mockResponse() {
  const writes: string[] = [];
  return {
    writes,
    writableEnded: false,
    write: jest.fn((chunk: string) => {
      writes.push(chunk);
      return true;
    }),
    on: jest.fn(),
  } as unknown as Response & { writes: string[] };
}

describe('NotificationsGateway', () => {
  let gateway: NotificationsGateway;

  beforeEach(() => {
    gateway = new NotificationsGateway();
  });

  describe('emitToUser', () => {
    it('pushes notification to subscribed user connections', () => {
      const res = mockResponse();
      gateway.subscribe(1, res);

      gateway.emitToUser(1, { id: 1, title: 'Hi', type: 'system' });

      const joined = res.writes.join('');
      expect(joined).toContain('event: notification');
      expect(joined).toContain('"title":"Hi"');
      expect(joined).toContain('"id":1');
    });

    it('does nothing when user has no subscriptions', () => {
      // 不应抛错
      gateway.emitToUser(999, { id: 1, title: 'x', type: 'system' });
    });

    it('does not write to ended connections', () => {
      const res = mockResponse();
      res.writableEnded = true;
      gateway.subscribe(1, res);

      gateway.emitToUser(1, { id: 1, title: 'x', type: 'system' });

      expect(res.write).not.toHaveBeenCalled();
    });

    it('isolates users: emitting to one user does not reach another（他人订阅自己流 → 收不到）', () => {
      const a = mockResponse();
      const b = mockResponse();
      gateway.subscribe(1, a);
      gateway.subscribe(2, b);

      gateway.emitToUser(2, { id: 1, title: 'B only', type: 'system' });

      expect(a.write).not.toHaveBeenCalled();
      expect(b.writes.join('')).toContain('"title":"B only"');
    });

    it('isolates users: subscribed user receives only own notifications', () => {
      const a = mockResponse();
      const b = mockResponse();
      gateway.subscribe(1, a);
      gateway.subscribe(2, b);

      gateway.emitToUser(1, { id: 1, title: 'A only', type: 'system' });

      expect(a.writes.join('')).toContain('"title":"A only"');
      expect(b.write).not.toHaveBeenCalled();
    });
  });

  describe('subscribe', () => {
    it('cleans up connection on close', () => {
      const res = mockResponse();
      // capture close handler
      let closeHandler: (() => void) | null = null;
      (res as any).on = jest.fn((event: string, cb: () => void) => {
        if (event === 'close') closeHandler = cb;
      });

      gateway.subscribe(1, res);
      gateway.emitToUser(1, { id: 1, title: 'a', type: 'system' });
      expect(res.write).toHaveBeenCalled();

      // 模拟断开
      closeHandler?.();
      // 重新 emit，连接已清理 → 不再写（新连接无，旧连接已移除）
      gateway.emitToUser(1, { id: 2, title: 'b', type: 'system' });
      // 旧连接只收到第一次
      const joined = res.writes.join('');
      expect(joined).not.toContain('"title":"b"');
    });
  });
});
