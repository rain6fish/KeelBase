/**
 * LLM Provider 配置接口
 */
export interface LlmProviderConfig {
  /** 供应商标识 */
  name: string;

  /** 展示名称 */
  displayName: string;

  /** API 基础地址 */
  baseURL: string;

  /** API Key */
  apiKey: string;

  /** 默认模型 */
  defaultModel: string;

  /** 可选模型列表 */
  availableModels: string[];

  /** 最大 Token 数 */
  maxTokens: number;

  /** 生成温度 */
  temperature: number;
}
