// SPDX-License-Identifier: Apache-2.0

/**
 * 流式 chunk 归并（阶段 3 第十一刀：从 `AiService.chatStreamImpl` 的轮次循环里提出）。
 *
 * 一轮 LLM 输出是一串 chunk（文本 / 推理 / 工具调用 / 用量 / 错误）。循环要**边逐块转发**给客户端、
 * 边**累积**成轮次状态——这段归并此前内联在一个 600 行的流式方法里，带着六个可变局部变量。
 * 提成纯对象后：归并规则可单测，主方法少一层心智负担。
 *
 * 归并规则（与提出前逐字一致）：
 * - `text`：累积 + **转发**（流式的意义就在逐块下发）
 * - `reasoning`：只累积、不下发
 * - `tool_call`：按 index 归并（id / name 覆盖，arguments 追加——同一个调用的参数分块到达）
 * - `error`：记下 + **转发**（客户端要知道失败）
 * - `done`：只取 usage（可缺省）
 *
 * 它**只管一轮**，每轮新建一个实例。
 */
import { LlmUsage, addLlmUsage } from '../llm-usage';
import { StreamChunk } from '../interfaces/llm-provider.interface';

/** 归并完成的单个工具调用（同一 index 的多个 chunk 已拼好） */
export interface AccumulatedToolCall {
  id: string;
  name: string;
  /** 跨 chunk 拼装好的参数 JSON 串（调用方负责 parse） */
  args: string;
  index: number;
}

export class StreamAccumulator {
  private text = '';
  private reasoning = '';
  private readonly calls = new Map<number, { id: string; name: string; args: string }>();
  private error?: string;
  private usageAcc?: LlmUsage;
  private sawToolCall = false;

  /**
   * 吸收一个 chunk；返回**需要转发给客户端**的 chunk（文本逐块转发、错误透传），
   * 其余类型返回 null（只累积、不下发）。
   */
  apply(chunk: StreamChunk): StreamChunk | null {
    if (chunk.type === 'text') {
      this.text += chunk.content;
      return chunk;
    }
    if (chunk.type === 'reasoning') {
      this.reasoning += chunk.content;
      return null;
    }
    if (chunk.type === 'tool_call' && chunk.toolCall) {
      this.sawToolCall = true;
      const idx = chunk.toolCall.index ?? 0;
      const existing = this.calls.get(idx) ?? { id: '', name: '', args: '' };
      if (chunk.toolCall.id) existing.id = chunk.toolCall.id;
      if (chunk.toolCall.name) existing.name = chunk.toolCall.name;
      if (chunk.toolCall.arguments) existing.args += chunk.toolCall.arguments;
      this.calls.set(idx, existing);
      return null;
    }
    if (chunk.type === 'error') {
      this.error = chunk.error;
      return chunk;
    }
    if (chunk.type === 'done' && chunk.usage) {
      this.usageAcc = addLlmUsage(this.usageAcc, chunk.usage);
    }
    return null;
  }

  /** 本轮累积的正文（转发过的文本） */
  get fullText(): string {
    return this.text;
  }

  /** 本轮累积的推理内容（不下发，仅随 assistant 消息回填给下一轮） */
  get reasoningText(): string {
    return this.reasoning;
  }

  /** 本轮是否出现过工具调用（与 `toolCalls().length` 不一定同值：与提出前同口径） */
  get hasToolCalls(): boolean {
    return this.sawToolCall;
  }

  /** 流中携带的错误（首个错误即记下；调用方据此走错误收尾） */
  get streamError(): string | undefined {
    return this.error;
  }

  /** 本轮用量增量（多个 done 各带一份时累加；provider 未给则 undefined） */
  get usage(): LlmUsage | undefined {
    return this.usageAcc;
  }

  /** 归并完成的工具调用（按 index 首次出现的顺序） */
  toolCalls(): AccumulatedToolCall[] {
    return Array.from(this.calls.entries()).map(([idx, tc]) => ({
      id: tc.id,
      name: tc.name,
      args: tc.args,
      index: idx,
    }));
  }
}
