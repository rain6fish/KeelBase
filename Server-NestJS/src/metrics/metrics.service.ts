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
   * 这个区别**不由此计数器回答**，而由紧邻它的 `toolGateFixtureCasesTotal` 回答（REV-15 ⑤）——
   * 两个计数器连读，才分得出「跑了没拒」与「没跑」。
   *
   * 来源判据是 `isFixtureUser`（夹具身份单源，见 `ai/constants/fixture-identity.ts`）。
   */
  readonly toolGateRefusalsTotal: client.Counter<'reason' | 'source'>;

  /**
   * REV-15 ⑤：**夹具到底跑没跑** —— `toolGateRefusalsTotal` 的读数只有在夹具确实跑过时才有意义，
   * 而「跑了、没拒过」与「压根没跑」在它上面**同形**（都是没有 series）。本计数器把这两者分开。
   *
   * 两个取值：
   * - `outcome="ran"` —— 该用例以**夹具身份**真的被执行了（**不论通过与否**：跑了才算数）；
   * - `outcome="skipped"` —— 夹具用例存在但被跳过（`enabled=false`），即**没有被覆盖到**。
   *
   * **四种读法**（与 `toolGateRefusalsTotal` 的三种读法连读）：
   * - 本计数器**没有任何 series** ⇒ 夹具从未跑过（被关掉），或**根本没有夹具用例** —— 两种都表示
   *   「没有夹具证据」，故此时 `refusals{source="fixture"}` 的缺失**没有信息量**；
   * - `{outcome="ran"}` 有 series、`{outcome="skipped"}` 无 ⇒ 夹具**跑全了**；
   * - `{outcome="skipped"}` 有 series ⇒ **有用例没被覆盖**，于是「夹具没拒过」**不得**读成
   *   「闸门对那几项没意见」；
   * - `{outcome="ran"}` 有 series 而 `refusals{source="fixture"}` 无 ⇒ 夹具跑了、闸门确实没拒过。
   *
   * ⚠ **这不是第二个「拒绝」计数器**：拒绝仍只进 `toolGateRefusalsTotal` 一处（REV-15 ①）；本计数器
   * 记的是**另一件事**（夹具的运行与覆盖），两者在暴露面上相邻、语义上不重叠。
   *
   * ⚠ **`admin-assistant` 类用例不计入**：它走系统账号 `'0'`，在 `toolGateRefusalsTotal` 上被记成
   * `production`（见 `fixture-identity.ts`）——若在这里算作夹具，就会声称一份拒绝计数器归给别人的覆盖。
   * 判据与运行期的身份选择**同源**（`runsAsFixture`），故两者不可能漂移。
   *
   * ⚠ 与 `toolGateRefusalsTotal` 同一条实测教训：零样本时暴露面上**只有 `# HELP`/`# TYPE`、没有
   * series**，故核验存在性的判据是那一**行**样本，不是指标名字出现。
   */
  readonly toolGateFixtureCasesTotal: client.Counter<'outcome'>;

  /**
   * CONF-1 的**可观测性那一半**：**同一工具在一个时间窗口内被重复确认了多少次**。
   *
   * 它存在，是因为确认**绑精确参数**（见 `docs/authorization-architecture.md` §6 的 CONF-1 边界）——
   * 参数一变就得重新问一次。那条边界是**选择**，但它有一个**可测的代价：批准疲劳**。此前没人答得上
   * 「这个工具今天被问了几次」，于是「疲劳」是一句说法而不是一个读数。
   *
   * **读法**（写在这里，因为读法是这个计数器契约的一部分）：窗口内的重复次数**由 Prometheus 侧算**，
   * 不在服务端算 —— `sum by (tool) (increase(tool_confirmations_total[1h]))`。
   *
   * - 标签 `tool` 取**被确认的那个工具名**；**run 级确认记作 `tool="run"`**（与落库时用的 `toolName`
   *   同值，故两边不可能漂移）。**一次 run 只算一次询问**，即便它覆盖多个动作 —— 按动作数记会把
   *   疲劳放大成假读数。
   * - 记的是**询问的次数**，不是**结果**：人怎么答（批准 / 拒绝 / 超时）在 `confirmation_decision`
   *   的审计里，不在本计数器上。**不按身份打标签**（那会爆高基数）。
   *
   * ⚠ 与 `toolGateRefusalsTotal` 同一条实测教训：零样本时暴露面上**只有 `# HELP` / `# TYPE`、没有
   * series**，故「有没有」要看那一**行**样本，不是指标名字出现。
   */
  readonly toolConfirmationsTotal: client.Counter<'tool'>;

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

    this.toolGateFixtureCasesTotal = new client.Counter({
      name: 'tool_gate_fixture_cases_total',
      help: 'Eval-suite cases, by outcome: ran (executed as the fixture identity) | skipped (disabled)',
      labelNames: ['outcome'],
    });

    this.toolConfirmationsTotal = new client.Counter({
      name: 'tool_confirmations_total',
      help: 'Write-tool confirmations asked of a human, by tool (a run-level confirmation counts once, as tool="run")',
      labelNames: ['tool'],
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
