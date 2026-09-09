// SPDX-License-Identifier: Apache-2.0

/**
 * B 路径（AI Bridge）外部 HTTP 调用的有界超时守卫（KB-4 FP-3）。
 *
 * ProxyTool.execute / ProxyToolRevokerService.revoke 都调外部系统（旧 Java 系统等）；
 * 若无超时守卫，目标挂死会无限挂起、审计/副作用永远悬空。proxyFetch 用
 * AbortController 在上限内中止，并把中止转成可辨识的 ProxyTimeoutError——
 * 调用方据此返回"超时"而非一般"不可达"，上层能如实记录失败。
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

/** 归一化外部调用错误消息：超时 → 明确"超时"，否则"不可达"（供上层/Agent 区分） */
export function proxyErrorText(err: unknown, prefix = '目标系统'): string {
  if (err instanceof ProxyTimeoutError) return `${prefix}请求超时（${err.timeoutMs}ms）`;
  return `${prefix}不可达: ${(err as Error).message}`;
}
