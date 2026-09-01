// SPDX-License-Identifier: Apache-2.0

import { Injectable, Optional, Inject } from '@nestjs/common';

/** 熔断配置注入 token；未提供时用 DEFAULT_CONFIG。 */
export const CIRCUIT_BREAKER_CONFIG = 'CIRCUIT_BREAKER_CONFIG';

/** 熔断打开时抛出的异常：调用方应快速失败（降级/重试策略由上层决定）。 */
export class CircuitOpenException extends Error {
  constructor(readonly serviceName: string) {
    super(`Circuit open for ${serviceName}`);
    this.name = 'CircuitOpenException';
  }
}

type BreakerState = 'closed' | 'open' | 'half-open';

interface Breaker {
  state: BreakerState;
  failures: number;
  successes: number;
  openedAt: number;
}

export interface CircuitBreakerConfig {
  /** 连续失败 N 次后打开 */
  failThreshold: number;
  /** 打开后多久进入 half-open 尝试恢复（ms） */
  timeoutMs: number;
  /** half-open 中连续成功 N 次后关闭 */
  successThreshold: number;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failThreshold: 5,
  timeoutMs: 30_000,
  successThreshold: 2,
};

/**
 * 外部依赖熔断器（RG-1）。
 * 对 AI / 邮件 / 短信 / 推送等外部调用，连续失败后快速失败（open），
 * 经冷却后 half-open 探测恢复，防止级联拖垮服务。
 */
@Injectable()
export class CircuitBreakerService {
  private breakers = new Map<string, Breaker>();

  constructor(
    @Optional() @Inject(CIRCUIT_BREAKER_CONFIG)
    private readonly config: CircuitBreakerConfig = DEFAULT_CONFIG,
  ) {}

  isOpen(name: string): boolean {
    const b = this.breakers.get(name);
    if (!b) return false;
    if (b.state === 'open') {
      if (Date.now() - b.openedAt >= this.config.timeoutMs) {
        // 冷却结束 → 转 half-open 放一个探测请求
        b.state = 'half-open';
        b.successes = 0;
        return false;
      }
      return true;
    }
    return false;
  }

  /** 执行受熔断保护的外部调用；熔断打开时立即抛 CircuitOpenException。 */
  async fire<T>(name: string, fn: () => Promise<T>): Promise<T> {
    if (this.isOpen(name)) {
      throw new CircuitOpenException(name);
    }
    try {
      const result = await fn();
      this.recordSuccess(name);
      return result;
    } catch (err) {
      this.recordFailure(name);
      throw err;
    }
  }

  recordSuccess(name: string): void {
    const b = this.getOrCreate(name);
    if (b.state === 'half-open') {
      b.successes += 1;
      if (b.successes >= this.config.successThreshold) {
        this.close(name);
      }
      return;
    }
    if (b.state === 'closed') {
      b.failures = 0;
    }
  }

  recordFailure(name: string): void {
    const b = this.getOrCreate(name);
    if (b.state === 'closed') {
      b.failures += 1;
      if (b.failures >= this.config.failThreshold) {
        this.open(name);
      }
      return;
    }
    if (b.state === 'half-open') {
      // 探测失败 → 立即回到 open
      this.open(name);
    }
  }

  getState(name: string): BreakerState {
    return this.breakers.get(name)?.state ?? 'closed';
  }

  getStatus(): Record<string, BreakerState> {
    const out: Record<string, BreakerState> = {};
    for (const [name, b] of this.breakers) {
      out[name] = b.state;
    }
    return out;
  }

  private getOrCreate(name: string): Breaker {
    let b = this.breakers.get(name);
    if (!b) {
      b = { state: 'closed', failures: 0, successes: 0, openedAt: 0 };
      this.breakers.set(name, b);
    }
    return b;
  }

  private open(name: string): void {
    const b = this.getOrCreate(name);
    b.state = 'open';
    b.failures = 0;
    b.successes = 0;
    b.openedAt = Date.now();
  }

  private close(name: string): void {
    const b = this.getOrCreate(name);
    b.state = 'closed';
    b.failures = 0;
    b.successes = 0;
    b.openedAt = 0;
  }
}
