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
 * 取值语义（对齐 Express）：
 *   - 未设 / 空 → **默认 1 跳**（对应 docker-compose 单层 nginx 前置，开箱即得真实客户端 IP）
 *   - `0` / `false` → `false`（不信任任何反代；直连部署 / 应用直接暴露时用，取 socket 地址）
 *   - 纯数字 `N` → 跳数
 *   - 其他字符串（CIDR / 逗号分隔子网列表 / 具名如 `loopback`）→ 原样交 Express（信任这些代理地址）
 *   - `true` → 拒绝为 `false`（见上「绝不返回 true」护栏）
 */
export function parseTrustProxy(raw?: string): number | string | false {
  const v = (raw ?? '').trim();
  const lower = v.toLowerCase();
  if (v === '') return 1; // 未设/空 → 默认 1 跳
  // 显式拒绝 boolean-true 语义（盲信任意 XFF）与关闭值——按「不信任」处理
  if (v === '0' || lower === 'false' || lower === 'true') return false;
  if (/^\d+$/.test(v)) return Number(v);
  return v;
}
