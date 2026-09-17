// SPDX-License-Identifier: Apache-2.0

/**
 * AU-1（§22.19 审计归因层）：Express `trust proxy` 取值解析。
 *
 * 目的：标准 Docker 部署（自带 nginx 反代）下，`req.ip` 会恒为 nginx 容器内网地址——
 * 操作审计的 `ip` 字段因此无归因价值。设 `trust proxy` 后，Express 依 `X-Forwarded-For`
 * 解析真实客户端 IP；nginx 已发 `X-Real-IP` / `X-Forwarded-For`。
 *
 * **护栏（§22.19）**：只信任**自带反代的跳数/子网**，**绝不返回 `true`**——`true` 等于盲信
 * 任意上游可伪造的 `X-Forwarded-For`，攻击者可任填 IP。故本函数任何输入都不产出 `true`。
 *
 * ⚠ **跳数与子网并不等价**（2026-09-17 修正原「默认 1 跳」）：Express 的 `trust proxy: N` 是
 * **无条件**信任最近 N 跳、**不校验来源地址**。故在有 `X-Forwarded-For` 时，`N` 在「应用可被
 * 绕过直连」（无反代 / 反代旁路 / pod 直接可达）的场景下与 `true` 的伪造效果**完全一致**——
 * 攻击者发一条 XFF 即可让审计 `ip` 变成任意值（实测：`trust proxy: 1` 与 `true` 均返回伪造值，
 * 而 `false` 返回真实 socket 地址）。默认值因此取**子网**而非跳数。
 *
 * 取值语义（对齐 Express）：
 *   - 未设 / 空 → `DEFAULT_TRUST_PROXY`（**只信回环 + 链路本地 + 私有网段**）——仅当来源地址
 *     真落在这些网段内（自带 nginx / 同机反代）才采信其 XFF；公网直连者不在其中，伪造不生效
 *   - `0` / `false` → `false`（不信任任何反代，`req.ip` 取 socket 地址）
 *   - 纯数字 `N` → 跳数（**不校验来源**，仅在「应用不可被绕过直连」时安全，见上 ⚠）
 *   - 其他字符串（CIDR / 逗号分隔子网列表 / 具名如 `loopback`）→ 原样交 Express（信任这些代理地址）
 *   - `true` → 拒绝为 `false`（见上「绝不返回 true」护栏；调用方应就此**告警**，见 `isBlindTrustValue`）
 */

/**
 * 默认信任集：回环 + 链路本地 + 私有网段（RFC1918 / RFC4193，Express 具名子网）。
 * 覆盖 Docker 默认 bridge（172.17.0.0/16 ⊂ `uniquelocal`）与自定义 compose 网络（172.16.0.0/12）、
 * 同机/宿主反代（`loopback`）。**不含任何公网段** → 公网来源的 XFF 一律不采信。
 * 需要更精确时用 CIDR 显式配 `TRUST_PROXY`（例如只写自带 nginx 的容器网段）。
 */
export const DEFAULT_TRUST_PROXY = 'loopback, linklocal, uniquelocal';

/**
 * 是否为被明确拒绝的「盲信任」取值（`true`）。
 * 单一真源：解析与调用方的告警共用，避免 `true` 的判定散落两处。
 */
export function isBlindTrustValue(raw?: string): boolean {
  return (raw ?? '').trim().toLowerCase() === 'true';
}

export function parseTrustProxy(raw?: string): number | string | false {
  const v = (raw ?? '').trim();
  if (v === '') return DEFAULT_TRUST_PROXY;
  // 显式拒绝 boolean-true 语义（盲信任意 XFF）与关闭值——按「不信任」处理
  if (isBlindTrustValue(v) || v === '0' || v.toLowerCase() === 'false') return false;
  if (/^\d+$/.test(v)) return Number(v);
  return v;
}
