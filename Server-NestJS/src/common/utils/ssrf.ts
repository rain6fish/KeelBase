// SPDX-License-Identifier: Apache-2.0

/**
 * SSRF 防护（webhook W4-④ 提取，MCP 复用）：hostname 解析后任一地址落在私网/回环/链接本地
 * （含云元数据 169.254.169.254）即阻止；解析失败保守阻止。
 */
import { lookup } from 'dns/promises';
import { isIP } from 'net';

export function isPrivateV4(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) || // 云元数据 169.254.169.254 属链接本地
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

export function isPrivateV6(ip: string): boolean {
  const v = ip.toLowerCase();
  return v === '::' || v === '::1' || v.startsWith('fe80') || v.startsWith('fc') || v.startsWith('fd');
}

/**
 * hostname 为**字面 IP**（v4/v6）且落在私网/回环/链接本地（含云元数据）时为 true。
 * 与 `isBlockedHost` 的区别：**不做 DNS 解析** —— 主机名一律返回 false（解析是异步的、且会误伤
 * 依赖内网主机名的合法用途，如 sidecar 回调用 `http://sidecar:3200`）。调用方自行决定用哪一种。
 * `URL.hostname` 对 IPv6 带方括号（`[::1]`）⇒ 先剥括号再 `isIP`。
 */
export function isPrivateLiteralHost(hostname: string): boolean {
  const h = hostname.replace(/^\[|\]$/g, '');
  const version = isIP(h);
  if (version === 4) return isPrivateV4(h);
  if (version === 6) return isPrivateV6(h);
  return false;
}

export async function isBlockedHost(hostname: string): Promise<boolean> {
  let addresses: string[];
  try {
    addresses = (await lookup(hostname, { all: true })).map((r) => r.address);
  } catch {
    return true;
  }
  return addresses.some((addr) => {
    const version = isIP(addr);
    if (version === 4) return isPrivateV4(addr);
    if (version === 6) return isPrivateV6(addr);
    return true;
  });
}

/** 校验 URL 公网可达（SSRF）：hostname 解析后私网/回环/链接本地 → 抛错。 */
export async function assertPublicUrl(url: string): Promise<void> {
  const { hostname } = new URL(url);
  if (await isBlockedHost(hostname)) {
    throw new Error('目标地址为内网/回环/链接本地，已阻止（防 SSRF）');
  }
}
