// SPDX-License-Identifier: Apache-2.0

import { Injectable, OnModuleInit } from '@nestjs/common';
import client from 'prom-client';

@Injectable()
export class MetricsService implements OnModuleInit {
  readonly httpRequestsTotal: client.Counter<'method' | 'route' | 'status'>;
  readonly httpRequestDurationSeconds: client.Histogram<
    'method' | 'route' | 'status'
  >;
  readonly httpRequestsInFlight: client.Gauge<'method' | 'route'>;

  /**
   * REV-15：工具闸门的**拒绝计数**（单一计数器；按检查项与身份来源分标签）。
   *
   * 它存在的理由不是「仪表盘想要一个数」，而是**「门在守」这件事此前拿不出证据**——拒绝是抛异常，
   * 抛完就散了，生产上没人能回答「这个闸门到底拒绝过真实调用吗」。
   *
   * **三种读法**（写在这里，因为读法是这个计数器契约的一部分）：
   * - `source="production"` 有 series 且 > 0 → 闸门确实拒绝过真实调用（**有证据在守**）；
   * - `production` 无 series 而 `fixture` 有 → 闸门装着且拒得动（夹具证明），但生产还没被拒过；
   * - **两者都没有 series → 无证据**（既不能说明在守，也不能说明失守）——**不得读成「一切正常」**。
   *
   * ⚠ **「名字在」不是证据**（实测）：计数器零样本时，暴露面上**只有 `# HELP` / `# TYPE` 两行、
   * 没有任何 series**。故核验存在性的判据是 `tool_gate_refusals_total{...} N` 这一**行**，
   * 不是名字出现——只看名字的话，「从未拒绝过」与「守得很好」读数完全相同。
   *
   * ⚠ `fixture` 只在夹具**确实跑过**时才有意义；夹具没跑时它与「夹具跑了但没拒过」同形。
   * 夹具跑没跑由评测运行自身的记录回答（不由此计数器回答）——**刻意的分工，不是遗漏**。
   *
   * 来源判据是 `isFixtureUser`（夹具身份单源，见 `ai/constants/fixture-identity.ts`）。
   */
  readonly toolGateRefusalsTotal: client.Counter<'reason' | 'source'>;

  constructor() {
    this.httpRequestsTotal = new client.Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status'],
    });

    this.toolGateRefusalsTotal = new client.Counter({
      name: 'tool_gate_refusals_total',
      help: 'Tool-gate refusals, by check (reason) and by identity source (fixture|production)',
      labelNames: ['reason', 'source'],
    });

    this.httpRequestDurationSeconds = new client.Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'route', 'status'],
      buckets: [0.005, 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    });

    this.httpRequestsInFlight = new client.Gauge({
      name: 'http_requests_in_flight',
      help: 'Number of HTTP requests currently being handled',
      labelNames: ['method', 'route'],
    });
  }

  onModuleInit(): void {
    client.collectDefaultMetrics();
  }

  async getMetrics(): Promise<string> {
    return client.register.metrics();
  }
}
