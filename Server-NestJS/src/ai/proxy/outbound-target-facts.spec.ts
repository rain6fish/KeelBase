// SPDX-License-Identifier: Apache-2.0

import { OutboundTargetFactsProvider } from './outbound-target-facts';
import { ProxyTool, ProxyToolConfig } from './proxy-tool';
import { ToolRegistry } from '../tools/tool-registry';
import { ExternalToolRegistry } from '../tools/external-tool-registry';

/**
 * AW-17: the deployment fact behind `target-status-unavailable`.
 *
 * The fact exists so a package can say "a timed-out write here could not have been resolved" — so the
 * cases that matter are the **negative** ones: a write that *can* be asked, a read (a read answers its
 * own question), and no outbound targets at all must **not** put a standing caveat on every package.
 * The non-optimistic direction is pinned separately: an external-tool listing that throws counts as
 * "cannot ask", because `false` there would be a claim we just failed to verify.
 *
 * AW-17：`target-status-unavailable` 背后的部署事实。
 *
 * 这条事实的存在，是为了让一份包说得出「这里超时的写事后收敛不了」—— 故要紧的是**否定**那些用例：
 * 能问的写、读（读回答它自己的问题）、以及根本没有出站目标，都**不得**给每份包挂常设告诫。非乐观方向
 * 单独钉住：列外部工具抛错算「问不到」，因为那里的 `false` 是一句我们刚刚没能核实的话。
 */
const delegation = { sign: jest.fn(async () => ({ token: 't' })) };

const tool = (overrides: Partial<ProxyToolConfig>): ProxyTool =>
  new ProxyTool(
    { name: 'proxy_t', description: 'x', method: 'POST', path: '/a', parameters: [], ...overrides },
    delegation as any,
    'http://localhost:4000/api',
    'legacy-erp',
  );

const provider = (tools: ProxyTool[], external?: any): OutboundTargetFactsProvider => {
  const registry = new ToolRegistry();
  for (const t of tools) registry.register(t);
  const externalRegistry = new ExternalToolRegistry();
  if (external) externalRegistry.register(external);
  return new OutboundTargetFactsProvider(registry, externalRegistry);
};

describe('AW-17 部署事实：有出站写目标问不到状态？', () => {
  it('B 路径写工具没有 statusPath ⇒ true（超时的写事后收敛不了）', async () => {
    expect(await provider([tool({})]).hasWriteTargetWithoutStatusQuery()).toBe(true);
  });

  it('B 路径写工具配了 statusPath ⇒ false（能问就不算缺口）', async () => {
    expect(
      await provider([tool({ statusPath: 'GET /a/status/{key}' })]).hasWriteTargetWithoutStatusQuery(),
    ).toBe(false);
  });

  it('读工具不算（读的结局由读本身回答）', async () => {
    expect(await provider([tool({ method: 'GET' })]).hasWriteTargetWithoutStatusQuery()).toBe(false);
  });

  it('没有出站目标 ⇒ false（不给每份包挂常设告诫）', async () => {
    expect(await provider([]).hasWriteTargetWithoutStatusQuery()).toBe(false);
  });

  it('外部 MCP 写工具 ⇒ true（那条路径根本没有状态通道）', async () => {
    const external = {
      listExternalTools: async () => [{ name: 'mcp_crm_create', description: '', parameters: {} }],
      requiresConfirmation: async (n: string) => n === 'mcp_crm_create',
      isExternal: () => true,
      callTool: jest.fn(),
    };
    expect(await provider([], external).hasWriteTargetWithoutStatusQuery()).toBe(true);
  });

  it('外部 MCP 只有读工具 ⇒ false', async () => {
    const external = {
      listExternalTools: async () => [{ name: 'mcp_crm_list', description: '', parameters: {} }],
      requiresConfirmation: async () => false,
      isExternal: () => true,
      callTool: jest.fn(),
    };
    expect(await provider([], external).hasWriteTargetWithoutStatusQuery()).toBe(false);
  });

  it('列不出外部工具 ⇒ true（非乐观：`false` 会是一句没核实过的话）', async () => {
    const external = {
      listExternalTools: async () => {
        throw new Error('gateway down');
      },
      requiresConfirmation: async () => false,
      isExternal: () => true,
      callTool: jest.fn(),
    };
    expect(await provider([], external).hasWriteTargetWithoutStatusQuery()).toBe(true);
  });
});
