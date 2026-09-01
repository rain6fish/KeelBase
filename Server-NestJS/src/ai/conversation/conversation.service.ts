// SPDX-License-Identifier: Apache-2.0

/**
 * 数据库持久化的对话管理服务
 *
 * 替代内存版 ConversationService，将对话和消息持久化到 PostgreSQL。
 * 保持与原有接口兼容，AiService 无需修改。
 */

import { Injectable, NotFoundException, ForbiddenException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { subject } from '@casl/ability';
import { Repository, LessThan, In } from 'typeorm';
import { AiConversation } from './ai-conversation.entity';
import { AiMessage } from './ai-message.entity';
import type { AppAbility } from '../../common/casl/casl-ability.factory';

const DEFAULT_TTL_MS = 3600_000; // 1 hour
// 兜底硬帽：仅当上下文压缩连续失败（LLM 不可用）时，删除最旧的 user 消息防止无界增长。
// 正常路径由 ConversationCompactor 压缩旧消息，不走这里。
const HARD_CAP = 80;

export interface ConversationData {
  id: string;
  userId: string;
  provider: string;
  model: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    toolCallId?: string;
    toolName?: string;
    timestamp: string;
  }>;
  summary?: string;
  createdAt: string;
  lastActivityAt: string;
}

@Injectable()
export class ConversationService {
  constructor(
    @InjectRepository(AiConversation)
    private readonly convRepo: Repository<AiConversation>,
    @InjectRepository(AiMessage)
    private readonly msgRepo: Repository<AiMessage>,
    @Optional()
    private readonly ttlMs: number = DEFAULT_TTL_MS,
  ) {}

  async createConversation(
    userId: string,
    provider: string,
    model: string,
  ): Promise<ConversationData> {
    const conv = await this.convRepo.save({
      userId,
      provider,
      model,
      lastActivityAt: new Date(),
    });
    return this.toData(conv, []);
  }

  async getConversation(id: string, userId: string, ability: AppAbility): Promise<ConversationData> {
    const conv = await this.convRepo.findOne({ where: { id, isDeleted: false } });
    if (!conv) throw new NotFoundException('Conversation not found');
    if (ability.cannot('read', subject('AiConversation', conv))) {
      throw new ForbiddenException('无权访问此对话');
    }
    const messages = await this.msgRepo.find({
      where: { conversationId: id },
      order: { createdAt: 'ASC' },
    });
    return this.toData(conv, messages);
  }

  async peekConversation(id: string): Promise<ConversationData> {
    const conv = await this.convRepo.findOne({ where: { id, isDeleted: false } });
    if (!conv) throw new NotFoundException('Conversation not found');
    const messages = await this.msgRepo.find({
      where: { conversationId: id },
      order: { createdAt: 'ASC' },
    });
    return this.toData(conv, messages);
  }

  async appendMessage(
    conversationId: string,
    message: {
      role: 'system' | 'user' | 'assistant' | 'tool';
      content: string;
      toolCallId?: string;
      toolName?: string;
    },
  ): Promise<void> {
    await this.msgRepo.save({
      conversationId,
      role: message.role,
      content: message.content,
      toolCallId: message.toolCallId,
      toolName: message.toolName,
    });

    // 更新计数和活动时间
    await this.convRepo.update(conversationId, {
      lastActivityAt: new Date(),
    });

    // 兜底硬帽：正常路径由 ConversationCompactor 压缩旧消息；
    // 仅当压缩连续失败（LLM 不可用）导致消息无界增长时，删除最旧的 user 消息。
    let count = await this.msgRepo.count({ where: { conversationId } });
    if (count > HARD_CAP) {
      const toDelete = await this.msgRepo.find({
        where: { conversationId, role: 'user' },
        order: { createdAt: 'ASC' },
        take: 1,
      });
      if (toDelete.length > 0) {
        await this.msgRepo.remove(toDelete);
        count = await this.msgRepo.count({ where: { conversationId } });
      }
    }

    // 更新 messageCount
    await this.convRepo.update(conversationId, {
      messageCount: count,
    });
  }

  /**
   * 取对话全部消息（供压缩器选择要摘要/删除的行）
   */
  async getMessagesForCompaction(conversationId: string): Promise<AiMessage[]> {
    return this.msgRepo.find({
      where: { conversationId },
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * 应用压缩结果：删除被摘要的消息 + 持久化摘要 + 重算计数。
   * delete-by-id 幂等：并发时第二次压缩的 id 已被删，不误删最近窗口。
   */
  async applyCompaction(
    conversationId: string,
    summary: string,
    deleteMessageIds: number[],
  ): Promise<void> {
    if (deleteMessageIds.length > 0) {
      await this.msgRepo.delete({ id: In(deleteMessageIds) });
    }
    await this.convRepo.update(conversationId, { summary });
    const count = await this.msgRepo.count({ where: { conversationId } });
    await this.convRepo.update(conversationId, { messageCount: count });
  }

  async deleteConversation(id: string, userId: string, ability: AppAbility): Promise<void> {
    const conv = await this.convRepo.findOne({ where: { id, isDeleted: false } });
    if (!conv) throw new NotFoundException('Conversation not found');
    if (ability.cannot('delete', subject('AiConversation', conv))) {
      throw new ForbiddenException('无权访问此对话');
    }
    await this.convRepo.update(id, { isDeleted: true });
  }

  async getUserConversations(userId: string): Promise<ConversationData[]> {
    const convs = await this.convRepo.find({
      where: { userId, isDeleted: false },
      order: { lastActivityAt: 'DESC' },
    });
    return Promise.all(
      convs.map(async (c) => {
        const msgs = await this.msgRepo.find({
          where: { conversationId: c.id },
          order: { createdAt: 'ASC' },
          take: 2,
        });
        return this.toData(c, msgs);
      }),
    );
  }

  async deleteAllUserConversations(userId: string): Promise<void> {
    await this.convRepo.update(
      { userId, isDeleted: false },
      { isDeleted: true },
    );
  }

  async cleanupExpiredConversations(): Promise<void> {
    const cutoff = new Date(Date.now() - this.ttlMs);
    const expired = await this.convRepo.find({
      where: { lastActivityAt: LessThan(cutoff), isDeleted: false },
    });
    for (const c of expired) {
      await this.msgRepo.delete({ conversationId: c.id });
    }
    await this.convRepo.remove(expired);
  }

  private toData(
    conv: AiConversation,
    messages: AiMessage[],
  ): ConversationData {
    return {
      id: conv.id,
      userId: conv.userId,
      provider: conv.provider,
      model: conv.model,
      summary: conv.summary ?? undefined,
      messages: messages.map((m) => ({
        role: m.role as any,
        content: m.content,
        toolCallId: m.toolCallId,
        toolName: m.toolName,
        timestamp: m.createdAt.toISOString(),
      })),
      createdAt: conv.createdAt.toISOString(),
      lastActivityAt: (conv.lastActivityAt ?? conv.updatedAt).toISOString(),
    };
  }
}
