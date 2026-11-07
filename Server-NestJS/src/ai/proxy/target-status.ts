// SPDX-License-Identifier: Apache-2.0

/**
 * AW-17: the B-path probe — one **read-only** question to the target, "did you execute this action key?".
 *
 * When an outbound write's outcome is unknown (timeout, reset, or any failure that says nothing about
 * whether the request landed), the honest state is *unknown* until someone asks the target. This probe
 * is that ask, and it is constructed so that it **cannot** become a second write:
 *
 * - **`GET` only.** A configured method other than `GET` is refused as `misconfigured` — never sent.
 * - **One request, no retry.** A retry would turn one query into traffic the target never agreed to.
 * - **Never `not_executed` on silence.** Timeout, unreachable, non-2xx, an unrecognised body — all
 *   conclude `unknown`. Reading silence as "it did not run" is the mistake this whole item exists to
 *   prevent; the only path to `not_executed` is the target saying so.
 * - **The writer's identity.** The delegation token is signed for the user who issued the write, not
 *   for the administrator who triggered the reconciliation: the target authorizes reading that user's
 *   record, and an admin token would ask in a different scope (or be refused outright).
 *
 * The path convention mirrors `revokePath`: `[METHOD] path`, with `{key}` standing for the write's
 * idempotency key — the one identity both sides already agree on. Any other `{placeholder}` left
 * unfilled means the query would ask about something we do not know, so it is refused rather than sent.
 *
 * AW-17：B 路径探针 —— 向目标问**一个只读**问题：「这个 action key 你执行了吗？」
 *
 * 出站写的结局未知时（超时、重置，或任何「说不清请求到没到」的失败），诚实的账是 *unknown*，直到有人
 * 去问目标。本探针就是那次询问，且构造上**不可能**变成第二次写：
 *
 * - **只发 `GET`**。配了别的方法一律按 `misconfigured` 拒绝 —— **发都不发**。
 * - **一次请求、不重试**。重试等于把一次询问变成目标没答应过的流量。
 * - **沉默绝不判 `not_executed`**。超时、不可达、非 2xx、认不出的响应 —— 结论都是 `unknown`。把沉默
 *   读成「它没跑」正是本项要防的那个错；通向 `not_executed` 的唯一路径是目标**自己这么说**。
 * - **用写入者的身份**。委托 token 签给发起那次写的用户，而不是触发对账的管理员：目标按那个用户的
 *   权限放行读，管理员 token 问的是另一个范围（或被直接拒）。
 *
 * 路径约定与 `revokePath` 同构：`[METHOD] path`，`{key}` 代表这次写的幂等键 —— 两侧已经认同的那一个
 * 身份。代入后若还剩别的 `{占位}`，说明这次查询要问一件我们并不知道的事，故拒绝，而不是发出去。
 */
import { Injectable } from '@nestjs/common';
import { ToolRegistry } from '../tools/tool-registry';
import { DelegationTokenService } from '../../auth/delegation-token.service';
import { ProxyTool } from './proxy-tool';
import { ProxyTimeoutError, proxyFetch } from './proxy-http';
import { resolveCapabilities } from '../interfaces/tool.interface';
import { TARGET_STATUS, type TargetStatusLookup } from '../../governance-core/target-status';
import type { TargetStatusProbe } from '../../governance-shared/services/tool-effects.types';

/** The codes that mean the connection never opened — the request cannot have been sent. */
const NEVER_SENT_CODES: ReadonlySet<string> = new Set([
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNREFUSED',
  'EHOSTUNREACH',
  'ENETUNREACH',
]);

/** undici hangs the code on `cause.code`; bare socket errors hang it on `code`. */
function transportCode(err: unknown): string {
  const e = err as { code?: unknown; cause?: unknown } | null;
  const cause = (e?.cause ?? undefined) as { code?: unknown } | undefined;
  if (typeof cause?.code === 'string') return cause.code;
  return typeof e?.code === 'string' ? e.code : '';
}

/** The evidence for "we could not even ask": no query channel, or a configuration we refuse to send. */
function unanswered(
  reason: TargetStatusLookup['reason'],
  queryMethod = 'GET',
  queryPath = '',
): TargetStatusLookup {
  return {
    queriedAt: new Date().toISOString(),
    queryMethod,
    queryPath,
    conclusion: TARGET_STATUS.UNKNOWN,
    reason,
  };
}

@Injectable()
export class ProxyTargetStatusProbe implements TargetStatusProbe {
  constructor(
    private readonly toolRegistry: ToolRegistry,
    private readonly delegationService: DelegationTokenService,
  ) {}

  async lookup(toolName: string, actionKey: string, userId: string): Promise<TargetStatusLookup> {
    const tool = this.tool(toolName);
    if (!tool) return unanswered('target-status-unavailable');
    // AW-19: the **declaration** decides whether a query may be attempted, not the incidental shape
    // of the config. `no` and `unknown` both mean "not licensed": an undeclared tool has told us
    // nothing about its target, and silence cannot be read as "it supports this". The reading is the
    // same either way — the target was not asked, and the ledger stays `unknown`.
    // AW-19：允不允许尝试查询由**声明**决定，而不是由配置碰巧长什么样。`no` 与 `unknown` 都表示
    // 「未获许可」：未声明的工具没有告诉我们目标的任何事，沉默不能被读成「它支持」。两种读法相同 ——
    // 目标没被问过，账照样留 `unknown`。
    if (resolveCapabilities(tool).statusLookup !== 'yes') {
      return unanswered('target-status-unavailable', 'GET', tool.statusPath ?? '');
    }
    // Declared `yes` but with nothing configured to ask: the gap is recorded, never a success.
    // 声明 `yes` 却没有可问的配置：记下这个缺口，绝不报成功。
    if (!tool.statusPath) return unanswered('target-status-unavailable');

    // `[METHOD] path` — a missing method defaults to GET, the same reading `revokePath` gets.
    const trimmed = tool.statusPath.trim();
    const methodMatch = trimmed.match(/^([A-Za-z]+)\s+(.+)$/);
    const method = (methodMatch?.[1] ?? 'GET').toUpperCase();
    let path = (methodMatch?.[2] ?? trimmed).trim();

    // Read-only by construction: anything but GET is refused before a single byte is sent.
    if (method !== 'GET') return unanswered('misconfigured', method, path);
    // Same SSRF guard as the tool's own execution path: the path must stay relative to `baseUrl`.
    if (path.startsWith('//') || /^https?:\/\//i.test(path)) return unanswered('misconfigured', method, path);
    // We only know the action key. A path that does not name it would ask about something else.
    if (!path.includes('{key}')) return unanswered('misconfigured', method, path);
    path = path.split('{key}').join(encodeURIComponent(actionKey));
    if (/\{[^{}]+\}/.test(path)) return unanswered('misconfigured', method, path);

    let token: string;
    try {
      token = (await this.delegationService.sign(userId, tool.audience)).token;
    } catch {
      // No identity to ask with ⇒ the target was never contacted. Still `unknown`, never `not_executed`.
      return unanswered('misconfigured', method, path);
    }

    const queriedAt = new Date().toISOString();
    try {
      const res = await proxyFetch(
        tool.baseUrl + path,
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        },
        tool.timeoutMs,
      );
      if (!res.ok) {
        return { queriedAt, queryMethod: method, queryPath: path, conclusion: TARGET_STATUS.UNKNOWN, reason: 'non_2xx' };
      }
      const body = (await res.json().catch(() => null)) as { status?: unknown } | null;
      const status = body?.status;
      if (status === TARGET_STATUS.EXECUTED || status === TARGET_STATUS.NOT_EXECUTED) {
        return { queriedAt, queryMethod: method, queryPath: path, conclusion: status, reason: null };
      }
      // A target that answers in a shape we do not know is **silent**, not a "no".
      return {
        queriedAt,
        queryMethod: method,
        queryPath: path,
        conclusion: TARGET_STATUS.UNKNOWN,
        reason: 'unrecognized_answer',
      };
    } catch (err) {
      const reason = err instanceof ProxyTimeoutError
        ? 'timeout'
        : NEVER_SENT_CODES.has(transportCode(err))
          ? 'unreachable'
          : 'call_failed';
      return { queriedAt, queryMethod: method, queryPath: path, conclusion: TARGET_STATUS.UNKNOWN, reason };
    }
  }

  /** AW-17: a property of the tool, not a query — no request leaves this method. */
  canAsk(toolName: string): boolean {
    return !!this.tool(toolName)?.statusPath;
  }

  /** The registered tool, or `undefined` when it is not a B-path proxy tool (or no longer registered). */
  private tool(toolName: string): ProxyTool | undefined {
    try {
      const t = this.toolRegistry.getTool(toolName);
      return t instanceof ProxyTool ? t : undefined;
    } catch {
      return undefined;
    }
  }
}
