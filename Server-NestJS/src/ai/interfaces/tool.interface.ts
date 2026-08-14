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

  /** 权限元数据（HS-2）：未声明则默认允许（数据隔离已由 execute 的 userId 保证） */
  readonly permissions?: ToolPermissions;

  /** 获取 LLM 可识别的工具定义（JSON Schema） */
  toToolDefinition(): ToolDefinition;

  /** 执行工具 */
  execute(args: Record<string, unknown>, userId: string): Promise<ToolResult>;
}
