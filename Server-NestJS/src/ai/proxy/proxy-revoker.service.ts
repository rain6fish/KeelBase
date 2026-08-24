/**
 * B 路径（AI Bridge §4）运行时撤销：ProxyTool 写副作用撤销时，调用 Java 端补偿端点。
 *
 * 约定：OpenAPI operation 声明 `x-keelbase-revoke-path`（如 `DELETE /contracts/{id}` 或 `POST /contracts/{id}/cancel`）
 * → 生成器生成 ProxyTool 的 `revokePath`；撤销时据此调用目标系统补偿端点（注入委托身份），实现真正补偿。
 * 无 revokePath 的写工具：返回明确消息（B 路径撤销需 Java 端补偿）。
 *
 * 由 AiToolEffectsService 可选注入（@Optional），本地实体撤销（软删）路径不受影响。
 */
import { Injectable } from '@nestjs/common';
import { ToolRegistry } from '../tools/tool-registry';
import { ProxyTool } from './proxy-tool';
import { DelegationTokenService } from '../../auth/delegation-token.service';

export interface ExternalRevokeResult {
  ok: boolean;
  message?: string;
}

/** 外部（B 路径）副作用撤销执行器——由 AiToolEffectsService 可选注入。 */
export interface ExternalRevoker {
  revoke(toolName: string, resultId: number, userId: string): Promise<ExternalRevokeResult>;
}

@Injectable()
export class ProxyToolRevokerService implements ExternalRevoker {
  constructor(
    private readonly toolRegistry: ToolRegistry,
    private readonly delegationService: DelegationTokenService,
  ) {}

  async revoke(toolName: string, resultId: number, userId: string): Promise<ExternalRevokeResult> {
    let tool: ProxyTool | undefined;
    try {
      const t = this.toolRegistry.getTool(toolName);
      if (t instanceof ProxyTool) tool = t;
    } catch {
      // 工具未注册 → 下方统一返回
    }
    if (!tool) {
      return { ok: false, message: `工具 ${toolName} 非 B 路径代理（无法撤销）` };
    }
    if (!tool.revokePath) {
      return { ok: false, message: `工具 ${toolName} 未配置 revokePath——B 路径撤销需 Java 端补偿接口` };
    }

    // revokePath 支持「方法 + 路径」或仅路径：`DELETE /contracts/{id}` / `/contracts/{id}/cancel`
    const methodMatch = tool.revokePath.trim().match(/^(GET|POST|PUT|PATCH|DELETE)\s+(.+)$/i);
    const method = (methodMatch?.[1] ?? 'POST').toUpperCase();
    let path = (methodMatch?.[2] ?? tool.revokePath).trim();
    // 占位 `{id}`（或任意 `{param}`）→ resultId（副作用目标 id，B 路径为写调用锚点）
    path = path.replace(/\{[^{}]+\}/g, String(resultId));

    let token: string;
    try {
      token = (await this.delegationService.sign(userId, tool.audience)).token;
    } catch (err) {
      return { ok: false, message: `委托 token 签发失败: ${(err as Error).message}` };
    }

    try {
      const res = await fetch(tool.baseUrl + path, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        return { ok: false, message: `补偿端点 ${method} ${path} 返回 ${res.status} ${body.slice(0, 120)}` };
      }
      return { ok: true, message: `${method} ${path}` };
    } catch (err) {
      return { ok: false, message: `补偿端点不可达: ${(err as Error).message}` };
    }
  }
}
