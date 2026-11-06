// SPDX-License-Identifier: Apache-2.0

/**
 * B 路径 ProxyTool（AI Bridge §4）：把已有系统 REST 端点暴露为 AI 工具。
 *
 * 由 ProxyToolRegistryService 从 Settings `ai_proxy_tools` 配置动态创建；
 * execute 时签发委托 token（DelegationTokenService，audience=目标系统）注入
 * `Authorization: Bearer`，过治理层（读 R1 自动 / 写 R3 确认 / 审计）。
 * 错误语义：目标 4xx/5xx 透传为工具失败原因，供 Agent 回退。
 */

import {
  AiTool,
  ToolDefinition,
  ToolResult,
  ToolParameter,
  ToolRiskLevel,
  RevokeClass,
} from '../interfaces/tool.interface';
import { DelegationTokenService } from '../../auth/delegation-token.service';
import { proxyFetch, proxyErrorText } from './proxy-http';
// ACT-9b：出站写携带账本同款幂等键（一次逻辑调用、两侧同一个键），见该模块头注
import { outboundIdempotencyKey } from './outbound-idempotency';

export interface ProxyToolConfig {
  name: string;
  description: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** 目标路径（相对 baseUrl），支持 `{param}` 占位（从 args 取，URL 编码） */
  path: string;
  parameters: ToolParameter[];
  /** W5 风险级：缺省读=R1 / 写=R3；显式覆盖 */
  riskLevel?: ToolRiskLevel;
  /** query 参数名（写方法时拼 URL query string，不塞进 body） */
  queryParams?: string[];
  /** Java 端补偿端点路径（相对 baseUrl）——撤销时调用（带委托身份），`{param}` 占位取自副作用 resultId；缺省无本地撤销（AI Bridge §4） */
  revokePath?: string;
  /**
   * AW-17: the target's **read-only status endpoint**, e.g. `GET /contracts/status/{key}`, used by a
   * one-shot reconciliation after a write's outcome became unknown. `{key}` is the write's idempotency
   * key — the one identity both sides already agree on. Only `GET` is accepted: a status query must not
   * be able to write. Absent = the target cannot be asked, and the ledger stays `unknown`.
   *
   * Same config shape as `revokePath` (`[METHOD] path`, `{placeholder}`), for the same reason: an
   * integrator learns one convention, not two.
   *
   * AW-17：目标的**只读状态端点**，如 `GET /contracts/status/{key}`，供一次写在结局未知后做一次性
   * 对账。`{key}` 就是这次写的幂等键 —— 两侧已经认同的那一个身份。**只接受 `GET`**：状态查询不能有写
   * 的可能。缺省 = 问不到目标，账照样留 `unknown`。
   *
   * 配置形状与 `revokePath` 相同（`[METHOD] path`、`{占位}`），理由相同：接入方学一套约定，不是两套。
   */
  statusPath?: string;
  /** KB-6：撤销能力档位显式覆盖；缺省按 method/revokePath 派生（写+revokePath→governed_external，读恒 none，写无 revokePath→none） */
  revokeClass?: RevokeClass;
}

const WRITE_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

/**
 * Whether a B-path method writes. Exported so the AW-17 coverage fact asks the **same** predicate the
 * tool uses to decide "write" — a second copy would let a method be a write in one place and a read in
 * the other, and the fact would then quietly skip a target that can go unknown.
 *
 * B 路径方法是否为写。导出它是为了让 AW-17 的覆盖事实问**同一个**判据 —— 抄第二份会让某个方法在一处
 * 是写、在另一处是读，于是事实会悄悄跳过一条可能变成 unknown 的目标。
 */
export function isProxyWriteMethod(method: string): boolean {
  return WRITE_METHODS.includes(method);
}

export class ProxyTool implements AiTool {
  readonly name: string;
  readonly description: string;
  readonly parameters: ToolParameter[];
  readonly riskLevel?: ToolRiskLevel;
  readonly requiresConfirmation: boolean;
  /**
   * AW-18: every proxy call is outbound HTTP. AW-14 hands the signal to `proxyFetch`, so a cancelled
   * read does stop its own request — but the declaration stays `no`: for a **write**, aborting our
   * socket says nothing about whether the target already applied it, and one tool instance serves
   * both methods. `no` is the honest reading for the write case, and it is also the conservative one
   * for the read case: a cancelled proxy call is `abandoned` with an unknown outcome, never `aborted`.
   *
   * AW-18：代理调用都是出站 HTTP。AW-14 把信号交给了 `proxyFetch`，所以被取消的**读**确实会停掉
   * 自己的请求 —— 但声明仍是 `no`：对**写**而言，断开我们这侧的连接并不能说明目标是否已经落了库，
   * 而同一个工具实例同时服务两类方法。`no` 对写是诚实的读法，对读也是保守的：被取消的代理调用记
   * `abandoned`、结局未知，绝不会是 `aborted`。
   */
  readonly abortable = 'no' as const;
  readonly revokePath?: string;
  readonly revokeClass: RevokeClass;
  /** AW-17：目标只读状态端点（`[METHOD] path`，`{key}` 占位为幂等键）；缺省 = 问不到。 */
  readonly statusPath?: string;
  /** 出站方法（对账/事实派生要看「这是不是写」）。 */
  readonly method: ProxyToolConfig['method'];

  constructor(
    private readonly cfg: ProxyToolConfig,
    private readonly delegationService: DelegationTokenService,
    /** 目标系统 baseUrl（撤销时 revoker 读取调补偿端点） */
    readonly baseUrl: string,
    /** 目标系统 audience（委托 token 限定） */
    readonly audience: string,
    /** 外部调用超时（ms）；缺省 PROXY_TIMEOUT_MS（KB-4 FP-3） */
    readonly timeoutMs?: number,
  ) {
    this.name = cfg.name;
    this.description = cfg.description;
    this.parameters = cfg.parameters ?? []; // 无参端点配置缺 parameters → 默认空，防 toToolDefinition 迭代 undefined 崩溃
    this.method = cfg.method;
    this.riskLevel = cfg.riskLevel ?? (WRITE_METHODS.includes(cfg.method) ? 'R3' : 'R1');
    this.requiresConfirmation = this.riskLevel === 'R3' || this.riskLevel === 'R4';
    this.revokePath = cfg.revokePath;
    this.statusPath = cfg.statusPath;
    // KB-6 撤销能力档位（语义源 protocol-trust-proof-card R9）：
    // 显式覆盖优先；读恒 none；写 + revokePath → governed_external（补偿 2xx 仅"已请求"，结果以目标为准）；
    // 写无 revokePath → none（诚实：有撤销钮却只能失败即真缺陷源）。transactional 不用——REST 代理无法表达目标事务内回滚。
    this.revokeClass =
      cfg.revokeClass ??
      (!WRITE_METHODS.includes(cfg.method) || !cfg.revokePath
        ? 'none'
        : 'governed_external');
  }

  toToolDefinition(): ToolDefinition {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const p of this.parameters) {
      properties[p.name] = { type: p.type, description: p.description };
      if (p.required) required.push(p.name);
    }
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: { type: 'object', properties, ...(required.length ? { required } : {}) },
      },
    };
  }

  /**
   * AW-14: the signal is handed to `proxyFetch`, which aborts the outbound request when it fires.
   * That stops **our** work; the classification stays `no` because a write's target-side effect
   * cannot be confirmed from here (see `abortable`).
   *
   * AW-14：信号交给 `proxyFetch`，触发时中止这次出站请求。被停掉的是**我们这侧**的工作；分类仍是
   * `no`，因为写的目标侧效果无法从这里确认（见 `abortable`）。
   */
  async execute(
    args: Record<string, unknown>,
    userId: string,
    signal?: AbortSignal,
  ): Promise<ToolResult> {
    // 1. 路径模板 `{param}` 替换（从 args 取，URL 编码）；未提供 → 失败
    let path = this.cfg.path;
    // SSRF 防护（M0）：path 必须相对——禁止 `//` 前缀与绝对 URL 前缀（防绕过 baseUrl）
    if (path.startsWith('//') || /^https?:\/\//i.test(path)) {
      return { success: false, error: '非法目标路径' };
    }
    // 占位符用任意非花括号字符（生成器 sanitize 后参数名含 _，OpenAPI path 可能是 {customer-id} 等非 \w 形式）
    const pathParams = [...this.cfg.path.matchAll(/\{([^{}]+)\}/g)].map((m) => m[1]);
    for (const p of pathParams) {
      const val = args[p];
      if (val === undefined || val === null || val === '') {
        return { success: false, error: `缺少路径参数 ${p}` };
      }
      path = path.replace(`{${p}}`, encodeURIComponent(String(val)));
    }

    // 2. 签发委托 token（audience=目标系统，短时）
    let token: string;
    try {
      token = (await this.delegationService.sign(userId, this.audience)).token;
    } catch (err) {
      return { success: false, error: `委托 token 签发失败: ${(err as Error).message}` };
    }

    // 3. 非路径参数分流：读 → 全拼 query string；写 → queryParams 拼 query、其余进 body
    const isWrite = WRITE_METHODS.includes(this.cfg.method);
    const body: Record<string, unknown> = {};
    const query: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(args)) {
      if (pathParams.includes(k)) continue;
      if (isWrite && this.cfg.queryParams?.includes(k)) query[k] = v;
      else if (isWrite) body[k] = v;
      else query[k] = v;
    }
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
    // ACT-9b：**写**请求带上这次调用的账本幂等键（docs/ai-agent.spec.md §6.6）—— 认这个头的目标把
    // 携带同一键的两次请求当作**同一次操作**，可以回放第一次的结果而不再写一遍；忽略它的目标行为与
    // 今天完全一致。两个边界都是**有意**的：读请求不带（幂等键是写语义），作用域缺席不带（没走过认领
    // 路径就没有键，编一个等于发出一个没人认同的键）。
    const actionKey = outboundIdempotencyKey.getStore();
    if (isWrite && actionKey) headers['Idempotency-Key'] = actionKey;
    const url = this.baseUrl + path + this.toQuery(query);

    try {
      const res = await proxyFetch(
        url,
        {
          method: this.cfg.method,
          headers,
          ...(isWrite ? { body: JSON.stringify(body) } : {}),
        },
        this.timeoutMs,
        signal,
      );
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        return { success: false, error: `目标系统错误: ${res.status} ${body.slice(0, 200)}` };
      }
      const data = res.status === 204 ? null : await res.json().catch(() => null);
      return { success: true, data };
    } catch (err) {
      // KB-4 FP-3：proxyFetch 超时抛 ProxyTimeoutError → 报"超时"；其余读作「结果未知、可能已到达」（不再断言"不可达"）
      return { success: false, error: proxyErrorText(err, '目标系统') };
    }
  }

  private toQuery(params: Record<string, unknown>): string {
    const qs = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');
    return qs ? `?${qs}` : '';
  }
}
