// SPDX-License-Identifier: Apache-2.0

import { CircuitBreakerService, CircuitOpenException } from './circuit-breaker.service';

const CFG = { failThreshold: 3, timeoutMs: 50, successThreshold: 2 };

describe('CircuitBreakerService', () => {
  it('初始状态 closed', () => {
    const cb = new CircuitBreakerService(CFG);
    expect(cb.getState('mail')).toBe('closed');
    expect(cb.isOpen('mail')).toBe(false);
  });

  it('连续失败达阈值后打开，fire 立即抛 CircuitOpenException', async () => {
    const cb = new CircuitBreakerService(CFG);
    const boom = async () => {
      throw new Error('upstream down');
    };
    for (let i = 0; i < CFG.failThreshold; i++) {
      await expect(cb.fire('mail', boom)).rejects.toThrow('upstream down');
    }
    expect(cb.getState('mail')).toBe('open');
    await expect(cb.fire('mail', boom)).rejects.toBeInstanceOf(CircuitOpenException);
  });

  it('冷却结束后转 half-open，放行探测请求', async () => {
    const cb = new CircuitBreakerService(CFG);
    const boom = async () => {
      throw new Error('down');
    };
    for (let i = 0; i < CFG.failThreshold; i++) {
      await cb.fire('mail', boom).catch(() => undefined);
    }
    expect(cb.getState('mail')).toBe('open');

    await new Promise((r) => setTimeout(r, 60));
    expect(cb.isOpen('mail')).toBe(false);
    expect(cb.getState('mail')).toBe('half-open');
  });

  it('half-open 连续成功达阈值后关闭', async () => {
    const cb = new CircuitBreakerService(CFG);
    const boom = async () => {
      throw new Error('down');
    };
    const ok = async () => 'ok';
    for (let i = 0; i < CFG.failThreshold; i++) {
      await cb.fire('mail', boom).catch(() => undefined);
    }
    await new Promise((r) => setTimeout(r, 60));

    await cb.fire('mail', ok);
    await cb.fire('mail', ok);
    expect(cb.getState('mail')).toBe('closed');
  });

  it('half-open 探测失败立即回到 open', async () => {
    const cb = new CircuitBreakerService(CFG);
    const boom = async () => {
      throw new Error('down');
    };
    for (let i = 0; i < CFG.failThreshold; i++) {
      await cb.fire('mail', boom).catch(() => undefined);
    }
    await new Promise((r) => setTimeout(r, 60));
    cb.isOpen('mail'); // 触发 open → half-open 转换
    expect(cb.getState('mail')).toBe('half-open');

    await cb.fire('mail', boom).catch(() => undefined);
    expect(cb.getState('mail')).toBe('open');
  });

  it('成功后重置失败计数（closed 态），不误开', async () => {
    const cb = new CircuitBreakerService(CFG);
    const boom = async () => {
      throw new Error('down');
    };
    const ok = async () => 'ok';
    await cb.fire('mail', boom).catch(() => undefined);
    await cb.fire('mail', boom).catch(() => undefined);
    await cb.fire('mail', ok);
    await cb.fire('mail', boom).catch(() => undefined);
    expect(cb.getState('mail')).toBe('closed');
  });

  it('getStatus 汇总全部状态', async () => {
    const cb = new CircuitBreakerService(CFG);
    const boom = async () => {
      throw new Error('down');
    };
    await cb.fire('sms', boom).catch(() => undefined);
    cb.recordFailure('push');
    expect(cb.getStatus()).toMatchObject({ sms: 'closed', push: 'closed' });
  });
});
