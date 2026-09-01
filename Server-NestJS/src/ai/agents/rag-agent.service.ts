// SPDX-License-Identifier: Apache-2.0

/**
 * RAG Agent — 检索增强生成
 *
 * 从知识库检索相关文档片段，注入到 Prompt 中让 LLM 基于真实信息回答。
 *
 * 检索当前为全文搜索降级（LIKE 匹配标题/内容/分类），
 * 后续接入 Embedding + 向量数据库时替换 KnowledgeService.search 实现。
 */

import { Injectable, Optional } from '@nestjs/common';
import { ChatMessage, LlmProvider } from '../interfaces/llm-provider.interface';
import { KnowledgeService } from '../rag/knowledge.service';
import { markSystemBoundary, sanitizeExternalContent } from '../security/injection-guard';
import { ContentSafetyService } from '../security/content-safety.service';

export interface KnowledgeArticle {
  id: number;
  title: string;
  content: string;
  category?: string;
  score?: number;
}

const RAG_SYSTEM_PROMPT = `你是一个基于知识库的智能助手。请根据提供的参考文档回答用户问题。
规则：
- 优先使用参考文档中的信息回答问题
- 如果参考文档不足以回答，如实说"知识库中没有相关信息"
- 不要编造不在参考文档中的内容
- 引用时标注来源文档标题`;

@Injectable()
export class RagAgent {
  constructor(
    private readonly knowledgeService: KnowledgeService,
    // N-6 内容安全：检索结果逐篇 check（注入到知识库的敏感内容不进入 LLM 上下文）
    @Optional() private readonly contentSafety?: ContentSafetyService,
  ) {}

  /**
   * 检索知识库并基于检索结果回答
   */
  async answer(
    messages: ChatMessage[],
    userMessage: string,
    provider: LlmProvider,
    model?: string,
    ctx?: { userId?: string; conversationId?: string },
  ): Promise<{ content: string; articles: KnowledgeArticle[] }> {
    // Step 1: 检索知识库（全文搜索降级，后续替换为向量检索）
    const articles = await this.search(userMessage);
    // N-6 内容安全：逐篇 check，命中剔除 + 审计（blocked 已由 service 写审计；不整答阻断防误伤）
    let safeArticles = articles;
    if (this.contentSafety) {
      safeArticles = [];
      for (const a of articles) {
        const safety = await this.contentSafety.check(a.content, ctx);
        if (!safety.blocked) safeArticles.push(a);
      }
    }

    // Step 2: 构建增强 Prompt
    // HS-8：检索结果注入前掩码敏感字段 + 系统边界标注（知识库内容非用户指令）
    const contextContent = safeArticles
      .map((a) => `[${a.title}] ${sanitizeExternalContent(a.content)}`)
      .join('\n\n');

    const augmentedMessages: ChatMessage[] = [
      { role: 'system', content: RAG_SYSTEM_PROMPT },
      ...(contextContent
        ? [
            {
              role: 'system',
              content: markSystemBoundary('knowledge', contextContent),
            } as ChatMessage,
          ]
        : []),
      ...messages.filter((m) => m.role !== 'system' && m.role !== 'tool'),
    ];

    // Step 3: 生成回答
    const result = await provider.generate({
      messages: augmentedMessages,
      model: model ?? provider.availableModels[0],
    });

    return {
      content: result.content,
      articles: safeArticles,
    };
  }

  /**
   * 全文搜索知识库（降级方案，向量版接入后替换此方法）
   */
  private async search(query: string): Promise<KnowledgeArticle[]> {
    return this.knowledgeService.search(query);
  }

  /**
   * 创建知识条目（管理接口）
   */
  async addArticle(article: Omit<KnowledgeArticle, 'id' | 'score'>): Promise<void> {
    await this.knowledgeService.create({
      title: article.title,
      content: article.content,
      category: article.category,
    });
  }
}
