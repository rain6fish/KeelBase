// SPDX-License-Identifier: Apache-2.0

/**
 * B 路径（AI Bridge）外部 HTTP 调用的有界超时守卫（KB-4 FP-3）。
 *
 * ProxyTool.execute / ProxyToolRevokerService.revoke 都调外部系统（旧 Java 系统等）；
 * 若无超时守卫，目标挂死会无限挂起、审计/副作用永远悬空。proxyFetch 用
 * AbortController 在上限内中止，并把中止转成可辨识的 ProxyTimeoutError——
 * 调用方据此返回"超时"这一可判定的读数，而不是把其余失败也读成一个词（见 proxyErrorText）。
 */

/** 默认超时（ms）；env `PROXY_FETCH_TIMEOUT_MS` 可覆盖 */
const DEFAULT_PROXY_TIMEOUT_MS = 30_000;

/**
 * 外部调用超时（ms）——**调用期**读取 env：模块导入期 .env 尚未注入，此处改为每次调用取值，
 * 使 `PROXY_FETCH_TIMEOUT_MS` 实际生效（配置后无需重启即换默认）。非法/未配 → 默认 30000。
 */
export function getProxyTimeout(): number {
  const raw = process.env.PROXY_FETCH_TIMEOUT_MS;
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_PROXY_TIMEOUT_MS;
}

/** 超时标记错误：name = 'ProxyTimeoutError'，供调用方/测试辨识 timeout 与网络错误 */
export class ProxyTimeoutError extends Error {
  readonly timeoutMs: number;
  constructor(timeoutMs: number) {
    super(`目标系统请求超时（${timeoutMs}ms）`);
    this.name = 'ProxyTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

/** fetch with timeout：超时 abort → 抛 ProxyTimeoutError；其余错误原样透传 */
export async function proxyFetch(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = getProxyTimeout(),
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  timer.unref?.();
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw new ProxyTimeoutError(timeoutMs);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Normalize an external-call error for the caller / agent. A timeout reads as "timeout" — that one is
 * knowable. **Any other error no longer reads as "unreachable"**: a connection reset after the request
 * was sent means the target may have received it, and "unreachable" would assert it did not — a claim
 * the transport layer cannot support. The fallback therefore gives the indeterminate reading, the same
 * shape the external-MCP path takes in `tool-execution.service.ts`.
 *
 * 归一化外部调用错误消息（供调用方 / Agent 消费）。超时读作「超时」—— 这一条可知。**其余异常不再
 * 读作「不可达」**：请求发出后连接被重置，意味着目标可能已收到，而「不可达」是在断言「没送到」——
 * 传输层支持不了这个断言。故兜底给不确定的读法，与 `tool-execution.service.ts` 外部 MCP 那条路同形。
 */
export function proxyErrorText(err: unknown, prefix = '目标系统'): string {
  if (err instanceof ProxyTimeoutError) return `${prefix}请求超时（${err.timeoutMs}ms）`;
  return `${prefix}调用失败、结果未知（可能已到达）：${(err as Error).message} —— 本次不重试`;
}
