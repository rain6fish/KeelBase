/**
 * Tool（工具/函数调用）相关接口
 *
 * ToolDefinition 是传给 LLM 的 JSON Schema 格式，
 * 也用于 Provider 层拼接 API 请求体。
 */

/** 工具定义（传给 LLM 的 JSON Schema） */
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/** 工具参数定义 */
export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  required: boolean;
  enum?: string[];
}

/** 工具执行结果 */
export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * 工具风险等级（W5 Risk-based Tool Contract，评审二 §7）。
 * 把工具执行从简单 Read/Write 升级为风险分级，对应执行策略：
 *   R0 Informational → auto；R1 Read → auto；R2 Low-risk Write → policy（治理决定）；
 *   R3 Business-sensitive Write → confirmation；R4 High-impact Action → human_approval；
 *   R5 Irreversible / External Action → block（阻断）。
 * 仅服务端关切，不暴露给 LLM。
 */
export type ToolRiskLevel = 'R0' | 'R1' | 'R2' | 'R3' | 'R4' | 'R5';

export const RISK_STRATEGY: Record<ToolRiskLevel, string> = {
  R0: 'auto',
  R1: 'auto',
  R2: 'policy',
  R3: 'confirmation',
  R4: 'human_approval',
  R5: 'block',
};

/**
 * 解析工具风险级：显式声明优先；否则按既有语义派生——
 * requiresConfirmation 写工具 → R3（业务敏感写），读工具 → R1（读）。
 */
export function resolveRiskLevel(
  tool: Pick<AiTool, 'riskLevel' | 'requiresConfirmation'>,
): ToolRiskLevel {
  if (tool.riskLevel) return tool.riskLevel;
  return tool.requiresConfirmation ? 'R3' : 'R1';
}

/**
 * Explainable Authorization（W5-⑦，评审四）：单条授权依据。
 * 供 tool_start / confirmation_request 事件携带，前端渲染「为何允许 / 为何需确认」。
 */
export interface AuthorizationCheck {
  name: string;
  ok: boolean;
  note?: string;
}

export interface AuthorizationReasons {
  tool: string;
  riskLevel: ToolRiskLevel;
  riskStrategy: string;
  requiresConfirmation: boolean;
  checks: AuthorizationCheck[];
}

/**
 * 授权拒绝（W5-⑦，评审四 §五 Why blocked）：工具被门控拒绝时抛出的结构化错误。
 * 携带失败的检查清单，供 tool_end / 审计展示「为何阻止」。
 * message 保持原拒绝文案（兼容既有 toThrow 断言）。
 */
export class AuthorizationDeniedError extends Error {
  constructor(message: string, public readonly reasons: AuthorizationCheck[]) {
    super(message);
    this.name = 'AuthorizationDeniedError';
  }
}

/**
 * 工具权限元数据（HS-2）：AI 执行工具前的门控依据。
 * 仅服务端关切，不暴露给 LLM。
 */
export interface ToolPermissions {
  /** 需已验证邮箱才能调用（对齐 HTTP 层 EmailVerificationGuard 的写操作语义） */
  requireVerifiedEmail?: boolean;
  /** 受特性开关约束：flag 关闭时工具不可调（对齐 PL-8 @FeatureFlag） */
  featureFlag?: string;
  /** 仅管理员可调 */
  adminOnly?: boolean;
}

/** 工具接口 */
export interface AiTool {
  readonly name: string;
  readonly description: string;
  readonly parameters: ToolParameter[];

  /** 写操作标记：为 true 时需人工确认后才执行（仅服务端关切，不暴露给 LLM） */
  readonly requiresConfirmation?: boolean;

  /** 风险等级（W5）：显式声明优先，未声明时由 requiresConfirmation 派生（R3/R1）。R5 = 阻断。 */
  readonly riskLevel?: ToolRiskLevel;

  /** 权限元数据（HS-2）：未声明则默认允许（数据隔离已由 execute 的 userId 保证） */
  readonly permissions?: ToolPermissions;

  /** 获取 LLM 可识别的工具定义（JSON Schema） */
  toToolDefinition(): ToolDefinition;

  /** 执行工具 */
  execute(args: Record<string, unknown>, userId: string): Promise<ToolResult>;
}
