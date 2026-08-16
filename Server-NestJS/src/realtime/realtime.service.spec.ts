import { WebSocket } from 'ws';
import { RealtimeService } from './realtime.service';

function mockSocket() {
  const sent: string[] = [];
  const socket = {
    sent,
    readyState: WebSocket.OPEN,
    isAlive: true,
    send: jest.fn((d: string) => sent.push(d)),
    ping: jest.fn(),
    terminate: jest.fn(),
    on: jest.fn(),
  };
  return socket as unknown as WebSocket & { sent: string[]; isAlive: boolean; terminate: jest.Mock };
}

describe('RealtimeService', () => {
  let service: RealtimeService;

  beforeEach(() => {
    service = new RealtimeService();
  });

  describe('emitToUser', () => {
    it('sends JSON envelope to registered user connections', () => {
      const ws = mockSocket();
      service.register(1, ws);

      service.emitToUser(1, 'notification', { title: 'Hi' });

      expect(ws.send).toHaveBeenCalledTimes(1);
      expect(ws.sent[0]).toBe(JSON.stringify({ event: 'notification', data: { title: 'Hi' } }));
    });

    it('does nothing when user has no connections', () => {
      const ws = mockSocket();
      service.register(2, ws);
      service.emitToUser(999, 'notification', { title: 'x' });
      expect(ws.send).not.toHaveBeenCalled();
    });

    it('skips non-open connections', () => {
      const ws = mockSocket();
      (ws as { readyState: number }).readyState = WebSocket.CLOSED;
      service.register(1, ws);
      service.emitToUser(1, 'notification', { title: 'x' });
      expect(ws.send).not.toHaveBeenCalled();
    });

    it('does not send after unregister', () => {
      const ws = mockSocket();
      service.register(1, ws);
      service.unregister(1, ws);
      service.emitToUser(1, 'notification', { title: 'x' });
      expect(ws.send).not.toHaveBeenCalled();
    });
  });

  describe('broadcast', () => {
    it('sends to all registered connections', () => {
      const a = mockSocket();
      const b = mockSocket();
      service.register(1, a);
      service.register(2, b);
      service.broadcast('message', { hello: true });
      expect(a.send).toHaveBeenCalledTimes(1);
      expect(b.send).toHaveBeenCalledTimes(1);
    });
  });

  describe('sweep', () => {
    it('terminates connections that missed pong', () => {
      const dead = mockSocket();
      dead.isAlive = false;
      service.register(1, dead);
      service.sweep();
      expect(dead.terminate).toHaveBeenCalledTimes(1);
    });

    it('pings alive connections and marks them not-alive', () => {
      const ws = mockSocket();
      ws.isAlive = true;
      service.register(1, ws);
      service.sweep();
      expect(ws.ping).toHaveBeenCalledTimes(1);
      expect(ws.isAlive).toBe(false);
    });
  });
});
