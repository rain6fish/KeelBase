// SPDX-License-Identifier: Apache-2.0

/** WS 信封协议：每文本帧一个 JSON { event, data }（对齐 @nestjs/platform-ws 的 event 约定）。协议详见 docs/ws-realtime.spec.md */

export interface WsEnvelope<T = unknown> {
  event: string;
  data?: T;
}

export function isWsEnvelope(value: unknown): value is WsEnvelope {
  return typeof value === 'object' && value !== null && typeof (value as WsEnvelope).event === 'string';
}

/** 服务端 → 客户端事件名 */
export const WS_EVENTS = {
  CONNECTED: 'connected',
  NOTIFICATION: 'notification',
  MESSAGE: 'message',
  PONG: 'pong',
  ERROR: 'error',
} as const;

/** aiService.chatStream 的 chunk.type → WS 事件名（data 原样透传） */
export const AI_CHUNK_TO_WS: Record<string, string> = {
  text: 'ai:text',
  reasoning: 'ai:reasoning',
  tool_call: 'ai:tool_call',
  tool_start: 'ai:tool_start',
  tool_end: 'ai:tool_end',
  confirmation_request: 'ai:confirmation_request',
  confirmation_decision: 'ai:confirmation_decision',
  done: 'ai:done',
  error: 'ai:error',
  navigate: 'ai:navigate',
};

/** 客户端 → 服务端：ai:chat 请求体（对齐 /chat/stream 的 ChatRequestDto 字段） */
export interface WsAiChatRequest {
  message: string;
  provider?: string;
  model?: string;
  conversationId?: string;
  images?: string[];
}
