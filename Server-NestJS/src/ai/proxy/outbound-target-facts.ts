// SPDX-License-Identifier: Apache-2.0

/**
 * AW-17: the business-side answer to "does any outbound **write** target lack a status query?" — the
 * deployment fact behind the `target-status-unavailable` coverage gap.
 *
 * Two channels, two readings, and the difference is the point:
 * - **B path (`ProxyTool`)** — a write tool without `statusPath` cannot be asked. A write tool *with*
 *   one can.
 * - **External MCP** — there is no status channel on that path at all (the MCP server decides what it
 *   exposes; KeelBase cannot query it), so **any** external write tool counts as unresolvable.
 *
 * Reads never count: a read answers its own question, and its outcome is never "unknown" in the way a
 * timed-out write's is.
 *
 * **Cannot enumerate ⇒ declare the gap.** If listing the external tools throws (server down, gateway
 * not registered), the answer is `true`, not `false`: the pessimistic direction is the only one this
 * registry is allowed to take, because `false` would read as "there is nothing we cannot ask" — a claim
 * we just failed to verify.
 *
 * AW-17：业务侧对「有没有出站**写**目标没有状态查询？」的回答 —— `target-status-unavailable` 覆盖缺口
 * 背后的部署事实。
 *
 * 两条通道、两个读数，差别正是要点：
 * - **B 路径（`ProxyTool`）** —— 写工具没有 `statusPath` 就问不到；有的能问。
 * - **外部 MCP** —— 那条路上根本没有状态通道（MCP server 自己决定暴露什么，KeelBase 无法查），故
 *   **任何**外部写工具都算「收敛不了」。
 *
 * 读一律不算：读回答它自己的问题，它的结局不会像超时的写那样「未知」。
 *
 * **列不出 ⇒ 声明缺口**。列举外部工具抛错时（server 挂了、网关没注册），答案是 `true` 而不是 `false`：
 * 悲观方向是这张登记表唯一允许走的方向，因为 `false` 会被读成「没有问不到的东西」—— 而那恰恰是我们
 * 刚刚没能核实的那句话。
 */
import { Injectable } from '@nestjs/common';
import { ToolRegistry } from '../tools/tool-registry';
import { ExternalToolRegistry } from '../tools/external-tool-registry';
import { ProxyTool, isProxyWriteMethod } from './proxy-tool';
import type { OutboundTargetFacts } from '../../governance-shared/outbound-target-facts';

@Injectable()
export class OutboundTargetFactsProvider implements OutboundTargetFacts {
  constructor(
    private readonly toolRegistry: ToolRegistry,
    private readonly externalTools: ExternalToolRegistry,
  ) {}

  async hasWriteTargetWithoutStatusQuery(): Promise<boolean> {
    for (const tool of this.toolRegistry.getAllTools()) {
      if (tool instanceof ProxyTool && isProxyWriteMethod(tool.method) && !tool.statusPath) return true;
    }

    const provider = this.externalTools.current;
    if (!provider) return false;
    try {
      // `requiresConfirmation` is the shared write predicate (R3/R4), so this asks the same question
      // the execution path asks rather than re-deriving "write" from a name.
      // `requiresConfirmation` 是共用的写判据（R3/R4），故这里问的是执行路径问的同一个问题，
      // 而不是从工具名重新推「是不是写」。
      for (const def of await provider.listExternalTools()) {
        if (await provider.requiresConfirmation(def.name)) return true;
      }
      return false;
    } catch {
      // Cannot enumerate ⇒ the gap stands. See the header. / 列不出 ⇒ 缺口成立，见头注。
      return true;
    }
  }
}
