// SPDX-License-Identifier: Apache-2.0

/**
 * B 路径 ProxyTool（AI Bridge §4）：把已有系统 REST 端点暴露为 AI 工具。
 *
 * 由 ProxyToolRegistryService 从 Settings `ai_proxy_tools` 配置动态创建；
 * execute 时签发委托 token（DelegationTokenService，audience=目标系统）注入
 * `Authorization: Bearer`，过治理层（读 R1 自动 / 写 R3 确认 / 审计）。
 * 错误语义：目标 4xx/5xx 透传为工具失败原因，供 Agent 回退。
 */

import {
  AiTool,
  ToolDefinition,
  ToolResult,
  ToolParameter,
  ToolRiskLevel,
} from '../interfaces/tool.interface';
import { DelegationTokenService } from '../../auth/delegation-token.service';

export interface ProxyToolConfig {
  name: string;
  description: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** 目标路径（相对 baseUrl），支持 `{param}` 占位（从 args 取，URL 编码） */
  path: string;
  parameters: ToolParameter[];
  /** W5 风险级：缺省读=R1 / 写=R3；显式覆盖 */
  riskLevel?: ToolRiskLevel;
  /** query 参数名（写方法时拼 URL query string，不塞进 body） */
  queryParams?: string[];
  /** Java 端补偿端点路径（相对 baseUrl）——撤销时调用（带委托身份），`{param}` 占位取自副作用 resultId；缺省无本地撤销（AI Bridge §4） */
  revokePath?: string;
}

const WRITE_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

export class ProxyTool implements AiTool {
  readonly name: string;
  readonly description: string;
  readonly parameters: ToolParameter[];
  readonly riskLevel?: ToolRiskLevel;
  readonly requiresConfirmation: boolean;
  readonly revokePath?: string;

  constructor(
    private readonly cfg: ProxyToolConfig,
    private readonly delegationService: DelegationTokenService,
    /** 目标系统 baseUrl（撤销时 revoker 读取调补偿端点） */
    readonly baseUrl: string,
    /** 目标系统 audience（委托 token 限定） */
    readonly audience: string,
  ) {
    this.name = cfg.name;
    this.description = cfg.description;
    this.parameters = cfg.parameters ?? []; // 无参端点配置缺 parameters → 默认空，防 toToolDefinition 迭代 undefined 崩溃
    this.riskLevel = cfg.riskLevel ?? (WRITE_METHODS.includes(cfg.method) ? 'R3' : 'R1');
    this.requiresConfirmation = this.riskLevel === 'R3' || this.riskLevel === 'R4';
    this.revokePath = cfg.revokePath;
  }

  toToolDefinition(): ToolDefinition {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const p of this.parameters) {
      properties[p.name] = { type: p.type, description: p.description };
      if (p.required) required.push(p.name);
    }
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: { type: 'object', properties, ...(required.length ? { required } : {}) },
      },
    };
  }

  async execute(args: Record<string, unknown>, userId: string): Promise<ToolResult> {
    // 1. 路径模板 `{param}` 替换（从 args 取，URL 编码）；未提供 → 失败
    let path = this.cfg.path;
    // SSRF 防护（M0）：path 必须相对——禁止 `//` 前缀与绝对 URL 前缀（防绕过 baseUrl）
    if (path.startsWith('//') || /^https?:\/\//i.test(path)) {
      return { success: false, error: '非法目标路径' };
    }
    // 占位符用任意非花括号字符（生成器 sanitize 后参数名含 _，OpenAPI path 可能是 {customer-id} 等非 \w 形式）
    const pathParams = [...this.cfg.path.matchAll(/\{([^{}]+)\}/g)].map((m) => m[1]);
    for (const p of pathParams) {
      const val = args[p];
      if (val === undefined || val === null || val === '') {
        return { success: false, error: `缺少路径参数 ${p}` };
      }
      path = path.replace(`{${p}}`, encodeURIComponent(String(val)));
    }

    // 2. 签发委托 token（audience=目标系统，短时）
    let token: string;
    try {
      token = (await this.delegationService.sign(userId, this.audience)).token;
    } catch (err) {
      return { success: false, error: `委托 token 签发失败: ${(err as Error).message}` };
    }

    // 3. 非路径参数分流：读 → 全拼 query string；写 → queryParams 拼 query、其余进 body
    const isWrite = WRITE_METHODS.includes(this.cfg.method);
    const body: Record<string, unknown> = {};
    const query: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(args)) {
      if (pathParams.includes(k)) continue;
      if (isWrite && this.cfg.queryParams?.includes(k)) query[k] = v;
      else if (isWrite) body[k] = v;
      else query[k] = v;
    }
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
    const url = this.baseUrl + path + this.toQuery(query);

    try {
      const res = await fetch(url, {
        method: this.cfg.method,
        headers,
        ...(isWrite ? { body: JSON.stringify(body) } : {}),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        return { success: false, error: `目标系统错误: ${res.status} ${body.slice(0, 200)}` };
      }
      const data = res.status === 204 ? null : await res.json().catch(() => null);
      return { success: true, data };
    } catch (err) {
      return { success: false, error: `目标系统不可达: ${(err as Error).message}` };
    }
  }

  private toQuery(params: Record<string, unknown>): string {
    const qs = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');
    return qs ? `?${qs}` : '';
  }
}
