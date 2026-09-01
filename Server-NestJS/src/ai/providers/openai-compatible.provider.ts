// SPDX-License-Identifier: Apache-2.0

/**
 * OpenAI 兼容格式的 LLM Provider 实现
 *
 * DeepSeek、Qwen、GLM、Kimi 等国产模型均兼容 OpenAI API 格式，
 * 只需传入不同的 baseURL 和 apiKey 即可复用此类。
 *
 * 不依赖外部 SDK，使用 Node.js 原生 fetch。
 */

import {
  LlmProvider,
  GenerateParams,
  GenerateResult,
  StreamChunk,
  ChatMessage,
} from '../interfaces/llm-provider.interface';
import { LlmProviderConfig } from '../interfaces/provider-config.interface';
import { CircuitBreakerService } from '../../circuit-breaker/circuit-breaker.service';

/** OpenAI 兼容 API 的响应格式 */
interface OpenAIChoice {
  message?: {
    content: string | null;
    reasoning_content?: string | null;
    tool_calls?: Array<{
      id: string;
      type: string;
      function: { name: string; arguments: string };
    }>;
  };
  finish_reason: string;
}

interface OpenAIResponse {
  choices: OpenAIChoice[];
  usage?: { prompt_tokens: number; completion_tokens: number };
}

/** SSE 流式数据块 delta */
interface StreamDelta {
  role?: string;
  content?: string;
  /** DeepSeek thinking mode 推理内容 */
  reasoning_content?: string;
  tool_calls?: Array<{
    index: number;
    id?: string;
    type?: string;
    function?: { name?: string; arguments?: string };
  }>;
}

interface StreamChoice {
  delta: StreamDelta;
  finish_reason: string | null;
}

interface StreamEvent {
  choices: StreamChoice[];
}

export class OpenAICompatibleProvider implements LlmProvider {
  readonly name: string;
  readonly displayName: string;
  readonly availableModels: string[];

  private readonly baseURL: string;
  private readonly apiKey: string;
  private readonly defaultModel: string;
  private readonly maxTokens: number;
  private readonly temperature: number;

  constructor(
    config: LlmProviderConfig,
    private readonly circuitBreaker?: CircuitBreakerService,
  ) {
    this.name = config.name;
    this.displayName = config.displayName;
    this.availableModels = config.availableModels;
    this.baseURL = config.baseURL.replace(/\/+$/, '');
    this.apiKey = config.apiKey;
    this.defaultModel = config.defaultModel;
    this.maxTokens = config.maxTokens;
    this.temperature = config.temperature;
  }

  /** RG-1.1：provider 名作熔断 key（deepseek/qwen/openai 各自独立熔断） */
  private get breakerName(): string {
    return `llm:${this.name}`;
  }

  isOpenAICompatible(): boolean {
    return true;
  }

  async generate(params: GenerateParams): Promise<GenerateResult> {
    const doGenerate = async () => {
      const body = this.buildRequestBody(params);

      const response = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => 'Unknown error');
        throw new Error(`LLM API error: ${response.status} ${errorBody}`);
      }

      const data = (await response.json()) as OpenAIResponse;
      return this.parseResponse(data);
    };
    if (this.circuitBreaker) {
      return this.circuitBreaker.fire(this.breakerName, doGenerate);
    }
    return doGenerate();
  }

  async *stream(params: GenerateParams): AsyncIterable<StreamChunk> {
    // RG-1.1：熔断打开时直接返回 error chunk（不发起请求）
    if (this.circuitBreaker?.isOpen(this.breakerName)) {
      yield { type: 'error', error: `LLM provider "${this.name}" is circuit-open` };
      return;
    }

    const body = this.buildRequestBody(params, true);

    let response: Response;
    try {
      response = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(body),
      });
    } catch (err) {
      this.circuitBreaker?.recordFailure(this.breakerName);
      yield { type: 'error', error: (err as Error).message };
      return;
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'Unknown error');
      this.circuitBreaker?.recordFailure(this.breakerName);
      yield {
        type: 'error',
        error: `LLM API error: ${response.status} ${errorBody}`,
      };
      return;
    }
    this.circuitBreaker?.recordSuccess(this.breakerName);

    const reader = response.body?.getReader();
    if (!reader) {
      yield { type: 'error', error: 'Response body is not readable' };
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        // Keep the last possibly-incomplete line in the buffer
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          const data = trimmed.slice(6).trim();
          if (data === '[DONE]') {
            yield { type: 'done' };
            return;
          }

          try {
            const parsed = JSON.parse(data) as StreamEvent;
            const delta = parsed.choices?.[0]?.delta;

            if (delta?.content) {
              yield { type: 'text', content: delta.content };
            }

            if (delta?.reasoning_content) {
              yield { type: 'reasoning', content: delta.reasoning_content };
            }

            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                yield {
                  type: 'tool_call',
                  toolCall: {
                    id: tc.id ?? `call_${tc.index}`,
                    name: tc.function?.name ?? '',
                    arguments: tc.function?.arguments ?? '',
                    index: tc.index,
                  },
                };
              }
            }

            const finishReason = parsed.choices?.[0]?.finish_reason;
            if (finishReason && finishReason !== 'null') {
              // Stream will end; [DONE] event follows
            }
          } catch {
            // Skip unparseable lines (e.g., keep-alive comments)
          }
        }
      }

      // If no [DONE] was encountered, yield done
      yield { type: 'done' };
    } catch (err) {
      yield { type: 'error', error: (err as Error).message };
    } finally {
      reader.releaseLock();
    }
  }

  /** AI-12：相对路径图片 URL 拼成公网可访问地址（LLM 需能 fetch 到） */
  private resolveImageUrl(url: string): string {
    // CR-6：禁止绝对 URL / 非 /uploads/ 路径，防 LLM 供应商回读内网地址（SSRF）
    if (/^https?:\/\//i.test(url)) {
      throw new Error('图片禁止使用绝对 URL（SSRF 防护）');
    }
    if (!url.startsWith('/uploads/') || url.includes('..')) {
      throw new Error('图片必须是本平台 /uploads/ 上传文件（SSRF 防护）');
    }
    return `${this.baseURL.replace(/\/chat\/completions$/, '')}${url.startsWith('/') ? '' : '/'}${url}`;
  }

  /**
   * AI-12.1 图像生成：OpenAI 兼容 POST /images/generations。
   * 返回生成的图片 URL（b64 或 url）。失败抛错由调用方处理。
   */
  async generateImage(prompt: string, size: string = '1024x1024'): Promise<string> {
    const body = { model: this.defaultModel, prompt, size, n: 1 };
    const res = await fetch(`${this.baseURL.replace(/\/+$/, '')}/images/generations`, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => 'Unknown error');
      throw new Error(`Image API error: ${res.status} ${err.slice(0, 200)}`);
    }
    const data = (await res.json()) as {
      data?: Array<{ url?: string; b64_json?: string }>;
    };
    const item = data.data?.[0];
    if (item?.url) return item.url;
    if (item?.b64_json) return `data:image/png;base64,${item.b64_json}`;
    throw new Error('图像生成未返回有效结果');
  }

  /** 构建请求头 */
  private buildHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
    };
  }

  /** 构建请求体 */
  private buildRequestBody(
    params: GenerateParams,
    stream: boolean = false,
  ): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: params.model ?? this.defaultModel,
      messages: params.messages.map((m: ChatMessage) => {
        const msg: Record<string, unknown> = {
          role: m.role,
        };
        // AI-12 多模态：带图片的 user 消息转 OpenAI 兼容的多模态 content 数组
        if (m.images && m.images.length > 0) {
          msg.content = [
            { type: 'text', text: m.content },
            ...m.images.map((url) => ({
              type: 'image_url',
              image_url: { url: this.resolveImageUrl(url) },
            })),
          ];
        } else {
          msg.content = m.content;
        }
        if (m.tool_call_id) msg.tool_call_id = m.tool_call_id;
        if (m.name) msg.name = m.name;
        if (m.tool_calls && m.tool_calls.length > 0) {
          msg.tool_calls = m.tool_calls.map((tc) => ({
            id: tc.id,
            type: 'function',
            function: {
              name: tc.name,
              arguments: tc.arguments,
            },
          }));
        }
        // DeepSeek thinking mode：推理内容必须原样回传
        if (m.reasoning_content) {
          msg.reasoning_content = m.reasoning_content;
        }
        return msg;
      }),
      max_tokens: params.maxTokens ?? this.maxTokens,
      temperature: params.temperature ?? this.temperature,
      stream,
    };

    if (params.tools && params.tools.length > 0) {
      body.tools = params.tools;
    }

    return body;
  }

  /** 解析非流式响应 */
  private parseResponse(data: OpenAIResponse): GenerateResult {
    const choice = data.choices?.[0];

    return {
      content: choice?.message?.content ?? '',
      reasoningContent: choice?.message?.reasoning_content ?? undefined,
      toolCalls: choice?.message?.tool_calls?.map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: tc.function.arguments,
      })),
      usage: data.usage
        ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
          }
        : undefined,
    };
  }
}
