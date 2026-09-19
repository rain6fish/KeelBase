// SPDX-License-Identifier: Apache-2.0

/**
 * 外部 MCP 工具提供者的**共享持有者**（阶段 3 拆分产出）。
 *
 * 为什么需要它：这个提供者是**运行期**由 `McpGatewayService` 注册进来的（`register(provider)`），
 * 之所以不直接构造注入，是**为了避开 ai ↔ mcp 的模块循环**。拆分前它是 `AiService` 的一个私有字段——
 * 一个类自己用，没问题；拆出门控域后，**门控与执行/清单域都要用它**，私有字段就成不了共享。
 * 所以把它提成这个持有者：注册入口留在 `AiService.registerExternalToolProvider`（保持 mcp 侧接缝不变），
 * 实际状态在这里，谁需要谁注入。
 */
import { Injectable } from '@nestjs/common';
import { ExternalToolProvider } from '../external-tool-provider.interface';

@Injectable()
export class ExternalToolRegistry {
  private provider?: ExternalToolProvider;

  /** 启动时由 McpGatewayService 调用（经 AiService 转发）。 */
  register(provider: ExternalToolProvider): void {
    this.provider = provider;
  }

  /** 尚未注册时返回 undefined——调用方自行决定降级方式（现状：视为「非外部工具」）。 */
  get current(): ExternalToolProvider | undefined {
    return this.provider;
  }

  /** 是否外部工具（未注册时恒 false）。 */
  isExternal(name: string): boolean {
    return this.provider?.isExternal(name) ?? false;
  }

  /** 外部工具的确认判定（未注册时恒 false，与「无外部工具」一致）。 */
  requiresConfirmation(name: string): Promise<boolean> {
    return this.provider ? this.provider.requiresConfirmation(name) : Promise.resolve(false);
  }
}
