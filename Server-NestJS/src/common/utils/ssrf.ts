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
