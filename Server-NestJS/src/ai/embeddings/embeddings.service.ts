// SPDX-License-Identifier: Apache-2.0

/**
 * Embeddings 服务 — 生成文本向量（OpenAI 兼容 /embeddings）
 *
 * 零依赖（原生 fetch），复用 LlmProvider 的配置驱动风格。
 * 通过 isAvailable() 判断向量功能是否可用，不可用由调用方降级全文搜索。
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EmbeddingsService {
  private readonly logger = new Logger(EmbeddingsService.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * 向量功能是否可用：总开关 + postgres + 配置满足。
   * 云端需要 baseUrl + apiKey + model；Ollama 本地（POV-1）仅需 OLLAMA_BASE_URL。
   */
  isAvailable(dbType?: string): boolean {
    if (!this.configService.get<boolean>('VECTOR_SEARCH_ENABLED', true)) return false;
    if (dbType !== 'postgres') return false;
    // POV-1：本地 Ollama embedding（数据不出域）
    if (this.configService.get<string>('OLLAMA_BASE_URL', '')) return true;
    const baseUrl = this.configService.get<string>('EMBEDDING_BASE_URL', '');
    const apiKey = this.configService.get<string>('EMBEDDING_API_KEY', '');
    const model = this.configService.get<string>('EMBEDDING_MODEL', '');
    return !!(baseUrl && apiKey && model);
  }

  /**
   * 生成单文本 embedding；失败抛错，由调用方降级。
   */
  async embed(text: string): Promise<number[]> {
    // POV-1：本地 Ollama（无 key，endpoint = /v1/embeddings）
    const ollamaBase = this.configService.get<string>('OLLAMA_BASE_URL', '');
    const isOllama = !!ollamaBase;
    const baseUrl = isOllama
      ? `${ollamaBase.replace(/\/+$/, '')}/v1`
      : this.configService.get<string>('EMBEDDING_BASE_URL', '').replace(/\/+$/, '');
    const apiKey = isOllama ? 'ollama' : this.configService.get<string>('EMBEDDING_API_KEY', '');
    const model = isOllama
      ? this.configService.get<string>('OLLAMA_EMBED_MODEL', 'bge-m3')
      : this.configService.get<string>('EMBEDDING_MODEL', '');

    const response = await fetch(`${baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, input: text }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      throw new Error(`Embeddings API ${response.status}: ${await response.text()}`);
    }

    const json = (await response.json()) as {
      data: Array<{ embedding: number[] }>;
    };
    const vector = json.data?.[0]?.embedding;
    if (!vector) {
      throw new Error('Embeddings response missing data[0].embedding');
    }
    return vector;
  }
}
