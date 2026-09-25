// SPDX-License-Identifier: Apache-2.0

/**
 * Tool destination — the single source for "which system does this tool actually write to".
 *
 * A delegation token already names its target system in `aud` (`delegation-token.service.ts`), and
 * the receiving system checks it. A confirmation artifact had no equivalent: it recorded the tool
 * and the exact arguments, so it was bound to *what* would be written but never to *where*. Point
 * the same artifact at a different destination — a re-pointed proxy tool, a re-registered external
 * server — and nothing in the artifact contradicted it.
 *
 * This module answers the missing question in one place, so the mint side (which records the
 * destination on the artifact) and the execution side (which verifies it) cannot drift.
 *
 * 工具目的地 —— 「这个工具到底写到哪个系统」的单一源。
 *
 * 委托 token 早已在 `aud` 里指名目标系统（`delegation-token.service.ts`），并由此被目标系统校验。
 * 确认 artifact 没有对应物：它记了工具与**精确参数**，因而绑住了「写什么」，却从未绑住「写到哪」。
 * 把同一个 artifact 指向另一个目的地——代理工具被改指、外部 server 被重新注册——artifact 里
 * 没有任何东西与它矛盾。
 *
 * 本模块在一处回答这个缺失的问题，使签发侧（把目的地记上 artifact）与执行侧（校验它）不会漂移。
 */
import { AiTool } from '../interfaces/tool.interface';

/** 外部 MCP 工具键前缀（形状 `mcp_<server>_<tool>`，见 `external-tool-provider.interface.ts`）。 */
export const MCP_TOOL_PREFIX = 'mcp_';

/** 本地运行时目的地标识：内置工具写的是本库自身。 */
export const LOCAL_DESTINATION = 'local';

/**
 * 解析外部 MCP 工具键 `mcp_<server>_<tool>`；非该形状返回 null。
 * server 名与 tool 名都用非贪婪切分，故 server 名含下划线时也按第一个下划线后切开。
 */
export function parseMcpToolKey(name: string): { server: string; tool: string } | null {
  if (!name.startsWith(MCP_TOOL_PREFIX)) return null;
  const m = /^mcp_(.+?)_(.+)$/.exec(name);
  if (!m) return null;
  return { server: m[1], tool: m[2] };
}

/** 构造外部 MCP 工具键——与 `parseMcpToolKey` 同一份形状定义（往返配对，防两处各写一个字面量）。 */
export function mcpToolKey(server: string, tool: string): string {
  return `${MCP_TOOL_PREFIX}${server}_${tool}`;
}

/**
 * 工具的目的地标识（与委托 token 的 `aud` 同形：字母数字/点/冒号/连字符）：
 * - 外部 MCP 工具 → `mcp:<server>`（目的地是该 server）
 * - 声明了 `audience` 的工具（B 路径 ProxyTool，audience 取自 Settings `ai_proxy_tools`）→ 该 audience
 * - 其余（内置工具）→ `local`
 */
export function resolveToolDestination(
  name: string,
  tool?: Pick<AiTool, 'audience'>,
): string {
  const key = parseMcpToolKey(name);
  if (key) return `mcp:${key.server}`;
  return tool?.audience ?? LOCAL_DESTINATION;
}
