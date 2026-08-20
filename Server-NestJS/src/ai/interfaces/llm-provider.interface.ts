/**
 * LLM Provider 统一接口定义
 *
 * 所有 LLM 供应商（DeepSeek、Qwen、OpenAI 等）必须实现此接口。
 * 设计为 Provider 无关，支持同步生成和流式生成两种模式。
 */

import { ToolDefinition, AuthorizationCheck, AuthorizationReasons } from './tool.interface';

/** 发送给 LLM 的消息 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  name?: string;
  /** assistant 角色发起工具调用时，必须附带此字段，后续 tool 角色消息才能匹配 */
  tool_calls?: ToolCall[];
  /** DeepSeek thinking mode：推理内容必须随 assistant 消息原样回传，否则 API 400 */
  reasoning_content?: string;
  /** AI-12 多模态：用户消息附带的图片 URL（OpenAI 兼容 vision 的 image_url） */
  images?: string[];
}

/** 生成参数（通用，不区分供应商） */
export interface GenerateParams {
  messages: ChatMessage[];
  model?: string;
  tools?: ToolDefinition[];
  maxTokens?: number;
  temperature?: number;
}

/** 工具调用 */
export interface ToolCall {
  id: string;
  name: string;
  arguments: string; // JSON string
  /** 流式模式下工具的 index，用于按索引合并多个 chunk 中的分段 arguments */
  index?: number;
}

/** 生成结果（非流式） */
export interface GenerateResult {
  content: string;
  /** DeepSeek thinking mode 推理内容（多轮工具调用需回传） */
  reasoningContent?: string;
  toolCalls?: ToolCall[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
}

/** 写操作待确认请求数据 */
export interface ConfirmationRequestData {
  token: string;
  toolName: string;
  summary: string;
  arguments: Record<string, unknown>;
  /** W5-⑦ Explainable Authz：为何需确认（风险级/策略/检查清单） */
  authorization?: AuthorizationReasons;
}

/** 写操作确认结果数据 */
export interface ConfirmationDecisionData {
  toolName: string;
  approved: boolean;
  success?: boolean;
  resultId?: number | string;
  error?: string;
}

/** 工具执行开始（前端进程卡片） */
export interface ToolStartData {
  name: string;
  summary: string;
  arguments?: Record<string, unknown>;
  /** ADT（P0-14）：写操作（需确认/可撤销）标记 */
  isWrite?: boolean;
  /** W5-⑥ 风险等级（R0-R5） */
  riskLevel?: string;
  /** W5-⑦ Explainable Authz：为何允许/为何需确认 */
  authorization?: AuthorizationReasons;
}

/** 授权拒绝详情（W5-⑦ 为何阻止） */
export interface AuthorizationDeniedData {
  reason: string;
  checks: AuthorizationCheck[];
}

/** 工具执行结束（前端进程卡片结果） */
export interface ToolEndData {
  name: string;
  success: boolean;
  summary?: string;
  error?: string;
  /** W5-⑦ Explainable Authz：授权被拒时携带「为何阻止」+ 失败检查清单 */
  authorizationDenied?: AuthorizationDeniedData;
}

/** 流式数据块 */
export interface StreamChunk {
  type:
    | 'text'
    | 'reasoning'
    | 'tool_call'
    | 'done'
    | 'error'
    | 'navigate'
    | 'confirmation_request'
    | 'confirmation_decision'
    | 'tool_start'
    | 'tool_end';
  content?: string;
  toolCall?: ToolCall;
  error?: string;
  /** 导航目标路由 */
  route?: string;
  /** 对话 id（done 事件携带，供前端续接会话） */
  conversationId?: string;
  /** 写操作确认请求 */
  confirmation?: ConfirmationRequestData;
  /** 写操作确认结果 */
  confirmationDecision?: ConfirmationDecisionData;
  /** 工具执行开始 */
  toolStart?: ToolStartData;
  /** 工具执行结束 */
  toolEnd?: ToolEndData;
}

/** LLM Provider 接口 */
export interface LlmProvider {
  /** 供应商标识：'deepseek' | 'qwen' | 'openai' */
  readonly name: string;

  /** 展示名称：'DeepSeek' | '通义千问' */
  readonly displayName: string;

  /** 可选模型列表 */
  readonly availableModels: string[];

  /** 非流式生成 */
  generate(params: GenerateParams): Promise<GenerateResult>;

  /** 流式生成 */
  stream(params: GenerateParams): AsyncIterable<StreamChunk>;

  /** 是否兼容 OpenAI API 格式 */
  isOpenAICompatible(): boolean;
}
