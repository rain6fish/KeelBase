// SPDX-License-Identifier: Apache-2.0

/**
 * 对话相关接口
 */
export interface Conversation {
  id: string;
  userId: string;
  messages: {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    toolCallId?: string;
    toolName?: string;
    timestamp: string;
  }[];
  provider: string;
  model: string;
  createdAt: string;
  lastActivityAt: string;
}

export interface ConversationSummary {
  id: string;
  lastMessage: string;
  messageCount: number;
  lastActivityAt: string;
}
