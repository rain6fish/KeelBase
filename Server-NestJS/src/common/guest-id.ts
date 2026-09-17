// SPDX-License-Identifier: Apache-2.0

/**
 * AU-3（§22.19 归因层）：访客标识的读取与签发。
 *
 * 解决的问题：演示端访客共享同一账号（alex）→ 审计 `user_id` 全塌缩成一个，N 个访客不可区分。
 * `guestId` 是**与账号无关**的匿名标识，让「N 个访客 → 审计可见 N 个不同来源」成立，
 * 而**不把访客身份并入真人账号**（§22.19 护栏①）。
 *
 * 载体：cookie（`kb_guest`）—— 浏览器自动携带，**Web 端零改动即生效**；同时接受 `X-Guest-Id`
 * 请求头，供 Flutter / Taro / 脚本等不走 cookie 的客户端显式发送。
 * 不引入 `cookie-parser` 依赖：`req.headers.cookie` 只是 `k=v; k2=v2`，此处手工解析（本仓原本不用 cookie）。
 *
 * 隐私：值是随机 UUID，不含任何个人信息；**不做指纹计算**（不拼 IP/UA），故不构成设备指纹。
 * 换浏览器或清 cookie 即视为新访客 —— 符合匿名标识的语义。
 *
 * ⚠ **诚实边界（必读）**：标识由客户端 cookie / `X-Guest-Id` 提供 → **客户端完全可控**，
 * 可被清除、伪造或任意填写。因此它：
 *   - **不是安全凭证**，**不参与任何授权/鉴权判定**（不要用它做权限、限流配额或风控依据）；
 *   - 只是**归因标签**——回答"这些审计行来自哪个浏览器/访客"，不回答"这是谁、他有没有权"；
 *   - 与 AU-1 的 IP 一样属**观测维度**：可信度受客户端合作程度限制，故审计 UI 与文档不得
 *     把它呈现为可信身份（对齐 §22.19 护栏①「演示 ≠ 生产身份」）。
 * 需要可信访客身份时，走认证（账号 / 令牌），不能用本标识。
 */
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';

export const GUEST_COOKIE = 'kb_guest';
/** 一年：演示访客的区分维度应长期稳定（否则同一访客每次访问都被当成新访客，归因反而失真） */
const GUEST_COOKIE_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

/** 从 `cookie` 头解析指定键（不引依赖；同名取首个）。解析失败按原值返回，不抛。 */
export function parseCookieHeader(
  header: string | undefined,
  name = GUEST_COOKIE,
): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    const raw = part.slice(eq + 1).trim();
    try {
      return decodeURIComponent(raw) || undefined;
    } catch {
      return raw || undefined;
    }
  }
  return undefined;
}

/** 读取已有访客标识（cookie 优先，`X-Guest-Id` 兜底）；无则 undefined。 */
export function readGuestId(req: Pick<Request, 'headers'>): string | undefined {
  const fromCookie = parseCookieHeader(req.headers.cookie);
  if (fromCookie) return fromCookie;
  const header = req.headers['x-guest-id'];
  const value = Array.isArray(header) ? header[0] : header;
  return value?.trim() || undefined;
}

/**
 * 取访客标识；无则签发一个并写入 cookie。
 * `res.cookie` 是 Express 内置（`cookie-parser` 只用于解析 req，签发不需要它）。
 * httpOnly：该标识只服务端用于归因，前端无需读取。
 */
export function ensureGuestId(req: Pick<Request, 'headers'>, res: Pick<Response, 'cookie'>): string {
  const existing = readGuestId(req);
  if (existing) return existing;
  const guestId = randomUUID();
  try {
    res.cookie(GUEST_COOKIE, guestId, {
      maxAge: GUEST_COOKIE_MAX_AGE_MS,
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    });
  } catch {
    // 响应头已发出等场景：本次仍返回标识（当次归因成立），只是不持久化
  }
  return guestId;
}
