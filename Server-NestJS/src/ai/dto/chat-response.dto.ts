// SPDX-License-Identifier: Apache-2.0

export interface ChatResponseDto {
  conversationId: string;
  reply: string;
  provider: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
}
